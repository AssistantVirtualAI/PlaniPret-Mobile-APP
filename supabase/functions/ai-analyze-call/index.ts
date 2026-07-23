import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { mirrorCallAnalysisToMaestro } from "../_shared/maestro-telecom.ts";

const SYSTEM_PROMPT = `Tu es un analyste IA spécialisé en appels téléphoniques et coaching d'agents.
Analyse cette transcription d'appel et retourne UNIQUEMENT un JSON valide, sans texte avant ou après, avec cette structure exacte:
{
  "summary": string,
  "customer_intent": string,
  "sentiment": "positive"|"neutral"|"negative"|"mixed",
  "objections": string[],
  "buying_signals": string[],
  "coaching": string,
  "next_action": string,
  "tasks": [{"title": string, "due_days_from_now": number}],
  "events": [{"title": string, "start_offset_hours": number, "duration_minutes": number}],
  "should_create_maestro_task": boolean,
  "should_create_maestro_event": boolean,
  "lead_score": number,
  "lead_temperature": "hot"|"warm"|"cold",
  "lead_score_reason": string,
  "suggested_callback_delay": "now"|"2h"|"tomorrow_9am"|"monday_9am",
  "callback_reason": string
}

Ajoute du coaching concret pour l'agent, les prochaines actions et les métriques de qualité. Réponds dans la langue dominante de l'appel.`;

async function getSecret(admin: any, provider: string, key: string): Promise<string | null> {
  const { data } = await admin.from("planipret_integration_secrets").select("config").eq("provider", provider).maybeSingle();
  return (data?.config as any)?.[key] ?? Deno.env.get(key.toUpperCase()) ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    const body = await req.json().catch(() => ({}));
    let { call_id, call_record_id, transcript, transcript_text, action, organization_id, force } = body ?? {};
    call_id = call_id || call_record_id || body?.callId;
    transcript = transcript || transcript_text;
    if (action === "test" || call_id === "test") {
      return new Response(JSON.stringify({ success: true, test: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!call_id) {
      return new Response(JSON.stringify({ success: false, error: "missing call_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: pbxCall } = await admin.from("pbx_call_records")
      .select("id, organization_id, caller_number, caller_name, destination, destination_number, direction, duration_seconds, raw_data")
      .eq("id", call_id)
      .maybeSingle();

    if (pbxCall) {
      organization_id = organization_id || (pbxCall as any).organization_id;
      const isServiceCall = authHeader === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
      if (!user && !isServiceCall) {
        return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (user) {
        const [m1, m2, m3, m4] = await Promise.all([
          admin.from("organization_members").select("organization_id").eq("user_id", user.id).eq("organization_id", organization_id).maybeSingle(),
          admin.from("org_members").select("org_id").eq("user_id", user.id).eq("org_id", organization_id).maybeSingle(),
          admin.from("pbx_softphone_users").select("organization_id").eq("portal_user_id", user.id).eq("organization_id", organization_id).maybeSingle(),
          admin.from("user_roles").select("organization_id").eq("user_id", user.id).eq("organization_id", organization_id).maybeSingle(),
        ]);
        if (![m1, m2, m3, m4].some((r) => r.data)) {
          return new Response(JSON.stringify({ success: false, error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      if (!transcript) {
        const { data: tr } = await admin.from("pbx_call_transcripts")
          .select("transcript_text, provider, created_at")
          .eq("call_record_id", call_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        transcript = (tr as any)?.transcript_text || (pbxCall as any)?.raw_data?.transcript_text || "";
      }

      if (!transcript || !String(transcript).trim()) {
        return new Response(JSON.stringify({ success: false, error: "missing transcript", message: "Transcription audio absente: lancez d'abord la transcription voice-to-text." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (!force) {
        const { data: cached } = await admin.from("pbx_ai_insights").select("*").eq("call_record_id", call_id).maybeSingle();
        if (cached) return new Response(JSON.stringify({ success: true, cached: true, insights: cached, transcript_text: transcript }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const apiKey = (await getSecret(admin, "anthropic", "api_key")) ?? Deno.env.get("ANTHROPIC_API_KEY");
      const openaiKey = Deno.env.get("OPENAI_API_KEY");
      if (!apiKey && !openaiKey) {
        return new Response(JSON.stringify({ success: false, error: "Aucune clé IA configurée (ANTHROPIC_API_KEY ou OPENAI_API_KEY)" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const userContent = `Appel: ${(pbxCall as any).caller_name || (pbxCall as any).caller_number || "inconnu"} → ${(pbxCall as any).destination_number || (pbxCall as any).destination || "inconnu"}\nDirection: ${(pbxCall as any).direction}\nDurée: ${(pbxCall as any).duration_seconds || 0}s\n\nTranscription:\n${String(transcript).slice(0, 18000)}`;

      let text = "{}";
      let usedModel = "";
      const callOpenAI = async () => {
        const r = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "gpt-4o-mini", response_format: { type: "json_object" }, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: userContent }] }),
        });
        if (!r.ok) throw new Error(`openai ${r.status}: ${(await r.text()).slice(0, 300)}`);
        const d = await r.json();
        return { text: String(d?.choices?.[0]?.message?.content ?? "{}"), model: "openai/gpt-4o-mini" };
      };

      if (apiKey) {
        const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-5-20250929",
            max_tokens: 2000,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: userContent }],
          }),
        });
        if (!claudeRes.ok) {
          const errText = await claudeRes.text();
          console.error("Claude error, falling back to OpenAI", claudeRes.status, errText);
          if (openaiKey) { const r = await callOpenAI(); text = r.text; usedModel = r.model; }
          else return new Response(JSON.stringify({ success: false, error: "Claude API error", details: errText }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } else {
          const claudeData = await claudeRes.json();
          text = claudeData.content?.[0]?.text ?? "{}";
          usedModel = "claude-sonnet-4-5-20250929";
        }
      } else {
        const r = await callOpenAI(); text = r.text; usedModel = r.model;
      }

      let insights: any;
      try { insights = JSON.parse(text); } catch { insights = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}"); }


      const row = {
        organization_id,
        call_record_id: call_id,
        summary: insights.summary ?? null,
        sentiment: ["positive", "neutral", "negative"].includes(insights.sentiment) ? insights.sentiment : "neutral",
        satisfaction_score: insights.lead_score ?? null,
        quality_score: insights.quality_score ?? (insights.lead_score ? Math.round(Number(insights.lead_score || 0) * 10) : null),
        intent: insights.customer_intent ?? null,
        topics: insights.objections ?? insights.topics ?? [],
        action_items: (insights.tasks || []).map((t: any) => typeof t === "string" ? t : t?.title).filter(Boolean),
        coaching_notes: [insights.coaching, insights.next_action, insights.lead_score_reason].filter(Boolean),
        coaching_score: insights.lead_score ?? null,
        risks: insights.risks ?? [],
        sales_opportunities: insights.buying_signals ?? [],
        escalation_needed: false,
        key_phrases: insights.key_phrases ?? [],
        prompt_version: "claude-mobile-v1",
        ai_model: usedModel || "claude-sonnet-4-5-20250929",

      };

      await admin.from("pbx_ai_insights").delete().eq("call_record_id", call_id);
      const { data: inserted, error: insertError } = await admin.from("pbx_ai_insights").insert(row).select().single();
      if (insertError) throw insertError;
      try {
        await admin.channel(`ai-insights:${organization_id}`).send({
          type: "broadcast",
          event: "insights",
          payload: { call_record_id: call_id, insights: inserted },
        });
      } catch (_) {}

      await admin.from("pbx_call_records").update({
        analyzed: true,
        ai_processing: false,
        ai_summary: row.summary,
        raw_data: {
          ...(((pbxCall as any)?.raw_data as Record<string, unknown>) || {}),
          transcript_text: transcript,
          ai: inserted,
          ai_model: row.ai_model,
          ai_updated_at: new Date().toISOString(),
        },
      }).eq("id", call_id);

      return new Response(JSON.stringify({ success: true, insights: inserted, analysis: inserted, transcript_text: transcript }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ================== PLANIPRET COACHING BRANCH ==================
    // Accept either raw text transcript OR structured segments.
    const segments = Array.isArray(body?.segments) ? body.segments : null;
    if (!transcript && segments && segments.length > 0) {
      transcript = segments.map((s: any) => `${s.speaker ?? "Speaker"}: ${s.text ?? ""}`).join("\n");
    }

    // Load call context from planipret_phone_calls to enrich the prompt.
    const { data: ppCall } = await admin.from("planipret_phone_calls")
      .select("id, user_id, organization_id, metadata, direction, duration_seconds, from_number, to_number, started_at, transcript, transcript_segments, transcript_language, ai_analysis_json, maestro_call_id, maestro_client_id")
      .eq("id", call_id).maybeSingle();

    if (!ppCall) {
      return new Response(JSON.stringify({ success: false, error: "Appel introuvable" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!transcript || !String(transcript).trim()) {
      transcript = (ppCall as any).transcript ?? "";
      if (!transcript && Array.isArray((ppCall as any).transcript_segments)) {
        transcript = (ppCall as any).transcript_segments.map((s: any) => `${s.speaker ?? "Speaker"}: ${s.text ?? ""}`).join("\n");
      }
    }
    if (!transcript || !String(transcript).trim()) {
      return new Response(JSON.stringify({ success: false, error: "missing transcript", message: "Transcription requise avant analyse." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const apiKey = (await getSecret(admin, "anthropic", "api_key")) ?? Deno.env.get("ANTHROPIC_API_KEY");
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");


    const COACHING_SYSTEM = `Tu es AVA, coach IA pour courtiers hypothécaires Planiprêt (Québec).
Analyse la transcription et retourne UNIQUEMENT un JSON valide (aucun markdown, aucun texte avant/après) suivant EXACTEMENT ce schéma:
{
  "corrected_transcript": [{"speaker":"Courtier"|"Client","text":"...","start":null}],
  "summary": {
    "short":"1-2 phrases",
    "detailed":"3-5 phrases",
    "client_needs":["..."],
    "key_info":{"budget":null,"property_type":null,"timeline":null,"concerns":[]},
    "outcome":"...",
    "next_steps":["..."]
  },
  "lead_analysis": {
    "score":1-10,
    "temperature":"hot"|"warm"|"cold",
    "buying_signals":["..."],
    "objections":["..."],
    "recommendation":"..."
  },
  "coaching": {
    "overall_score":1-10,
    "score_breakdown":{"listening":n,"questioning":n,"empathy":n,"product_knowledge":n,"closing":n},
    "strengths":["..."],
    "improvements":["..."],
    "missed_opportunities":["..."],
    "best_moment":"...",
    "coaching_message":"2-3 phrases encourageantes",
    "suggested_phrases":[{"context":"...","phrase":"..."}]
  },
  "compliance": {"consent_mentioned":bool,"privacy_mentioned":bool,"flags":[]}
}
Français québécois professionnel.`;

    const meta = ppCall as any;
    const userMsg = `MÉTADONNÉES:
- Direction: ${meta.direction ?? "?"}
- Durée: ${meta.duration_seconds ?? "?"}s
- De → Vers: ${meta.from_number ?? "?"} → ${meta.to_number ?? "?"}
- Date: ${meta.started_at ?? "?"}

TRANSCRIPTION:
${String(transcript).slice(0, 18000)}`;

    let analysis: any = null;
    let modelUsed = "";

    const tryOpenAI = async () => {
      modelUsed = "openai/gpt-4o-mini";
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [{ role: "system", content: COACHING_SYSTEM }, { role: "user", content: userMsg }],
        }),
      });
      if (!r.ok) throw new Error(`openai ${r.status}: ${(await r.text()).slice(0, 300)}`);
      const d = await r.json();
      const raw = d.choices?.[0]?.message?.content ?? "{}";
      try { analysis = JSON.parse(raw); } catch { analysis = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}"); }
    };

    // Prefer Claude, then Lovable Gateway (Gemini), then OpenAI as final fallback.
    if (apiKey) {
      modelUsed = "claude-sonnet-4-5-20250929";
      const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: modelUsed,
          max_tokens: 3000,
          system: COACHING_SYSTEM,
          messages: [{ role: "user", content: userMsg }],
        }),
      });
      if (!claudeRes.ok) {
        const errText = await claudeRes.text();
        console.error("Claude error, trying fallbacks", claudeRes.status, errText);
        if (openaiKey) { try { await tryOpenAI(); } catch (e) { return new Response(JSON.stringify({ success: false, error: "Claude+OpenAI failed", details: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }); } }
        else return new Response(JSON.stringify({ success: false, error: "Claude API error", details: errText.slice(0, 500) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } else {
        const claudeData = await claudeRes.json();
        const raw = claudeData.content?.[0]?.text ?? "{}";
        try { analysis = JSON.parse(raw); } catch { analysis = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}"); }
      }
    } else if (lovableKey) {
      modelUsed = "google/gemini-2.5-pro";
      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Lovable-API-Key": lovableKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelUsed,
          messages: [
            { role: "system", content: COACHING_SYSTEM },
            { role: "user", content: userMsg },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!aiRes.ok) {
        const errText = await aiRes.text();
        console.error("Lovable gateway error, trying OpenAI", aiRes.status, errText);
        if (openaiKey) { try { await tryOpenAI(); } catch (e) { return new Response(JSON.stringify({ success: false, error: "Gateway+OpenAI failed", details: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }); } }
        else return new Response(JSON.stringify({ success: false, error: "AI gateway error", details: errText.slice(0, 500) }), { status: aiRes.status === 429 || aiRes.status === 402 ? aiRes.status : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } else {
        const aiData = await aiRes.json();
        const raw = aiData.choices?.[0]?.message?.content ?? "{}";
        try { analysis = JSON.parse(raw); } catch { analysis = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}"); }
      }
    } else if (openaiKey) {
      try { await tryOpenAI(); } catch (e) {
        return new Response(JSON.stringify({ success: false, error: "OpenAI error", details: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } else {
      return new Response(JSON.stringify({ success: false, error: "Aucune clé IA configurée (ANTHROPIC_API_KEY, LOVABLE_API_KEY ou OPENAI_API_KEY)" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }


    if (!analysis || typeof analysis !== "object") {
      return new Response(JSON.stringify({ success: false, error: "Réponse IA invalide" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const coaching = analysis.coaching ?? {};
    const summary = analysis.summary ?? {};
    const leadA = analysis.lead_analysis ?? {};

    const overall = typeof coaching.overall_score === "number" ? Math.round(coaching.overall_score * 10) / 10 : null;
    const leadScore = typeof leadA.score === "number" ? Math.min(10, Math.max(1, Math.round(leadA.score))) : null;
    const leadTemp = ["hot", "warm", "cold"].includes(leadA.temperature) ? leadA.temperature : null;
    const correctedSegs = Array.isArray(analysis.corrected_transcript) ? analysis.corrected_transcript : (ppCall as any).transcript_segments ?? null;

    // Back-compat metadata used by existing MCalls coaching UI
    const newMeta = {
      ...((meta.metadata ?? {}) as Record<string, unknown>),
      ai_coaching: coaching.coaching_message ?? coaching.overall ?? null,
      ai_strengths: coaching.strengths ?? [],
      ai_improvements: coaching.improvements ?? [],
      ai_key_info: summary.key_info ?? null,
      ai_next_action: summary.next_steps?.[0] ?? null,
    };

    await admin.from("planipret_phone_calls").update({
      transcript_segments: correctedSegs,
      ai_summary: summary.detailed ?? null,
      ai_summary_short: summary.short ?? null,
      ai_analysis_json: analysis,
      coaching_score: overall,
      lead_score: leadScore,
      lead_temperature: leadTemp,
      lead_score_reason: leadA.recommendation ?? null,
      next_actions: summary.next_steps ?? [],
      analyzed_at: new Date().toISOString(),
      metadata: newMeta,
    }).eq("id", call_id);

    await admin.from("planipret_ai_insights").insert({
      user_id: (ppCall as any).user_id,
      organization_id: (ppCall as any).organization_id,
      call_id,
      summary: summary.detailed ?? null,
      customer_intent: leadA.recommendation ?? null,
      sentiment: leadTemp === "hot" ? "positive" : leadTemp === "cold" ? "negative" : "neutral",
      topics: leadA.buying_signals ?? [],
      suggested_actions: summary.next_steps ?? [],
      coaching_notes: coaching.coaching_message ?? null,
      raw_response: analysis,
      model: modelUsed,
    });

    // Fire-and-forget mirror to Maestro Télécom (summary + full analysis).
    try {
      mirrorCallAnalysisToMaestro(
        admin,
        (ppCall as any).user_id,
        ppCall as any,
        analysis,
        {
          ai_summary: summary.detailed ?? null,
          ai_summary_short: summary.short ?? null,
          coaching_message: coaching.coaching_message ?? coaching.overall ?? null,
          next_actions: summary.next_steps ?? [],
          topics: leadA.buying_signals ?? [],
          sentiment: leadTemp === "hot" ? "positive" : leadTemp === "cold" ? "negative" : "neutral",
          lead_score: leadScore,
          lead_temperature: leadTemp,
          lead_reason: leadA.recommendation ?? null,
          model: modelUsed,
        },
      );
    } catch (e) {
      console.warn("[ai-analyze-call] maestro mirror scheduling failed", (e as Error)?.message);
    }


    // Realtime broadcast
    try {
      await admin.channel(`ai-insights:${(ppCall as any).user_id}`).send({
        type: "broadcast", event: "ai-insights",
        payload: { call_id, analysis },
      });
    } catch (_) {}

    return new Response(JSON.stringify({ success: true, analysis, model: modelUsed }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e: any) {
    console.error("ai-analyze-call error", e);
    return new Response(JSON.stringify({ success: false, error: e?.message ?? "Erreur serveur" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
