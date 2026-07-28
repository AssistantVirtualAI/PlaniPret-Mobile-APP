// POST /functions/v1/maestro-ai-analysis
// Body: { call_id: uuid, force?: boolean }
// Runs Claude (via ANTHROPIC_API_KEY) on the transcript and writes coaching/insights.
import {
  adminClient,
  broadcastPipeline,
  corsHeaders,
  getBrokerAuth,
  getMaestroConfig,
  json,
  maestroAudit,
  maestroFetch,
  pipelineLog,
  setPipelineStep,
  updateCallPipeline,
} from "../_shared/maestro.ts";


const ANALYSIS_SYSTEM = `Tu es un expert en coaching de courtiers hypothécaires. Analyse cette transcription d'appel et retourne UNIQUEMENT un JSON valide sans markdown, sans bloc de code, sans commentaire — juste l'objet JSON brut.`;

const ANALYSIS_USER = (transcript: string) =>
  `Transcription:\n${transcript}\n\nRetourne ce JSON exact (champs obligatoires, valeurs en français):
{
  "summary_text": "2-5 phrases résumant l'appel",
  "key_points": ["3 à 5 points importants"],
  "sentiment": "positive|neutral|negative",
  "coaching": {
    "score": 7,
    "strengths": ["2-3 points forts"],
    "improvements": ["2-3 axes d'amélioration"],
    "suggestions": ["2-3 suggestions concrètes"],
    "overall": "1 phrase de coaching général"
  },
  "next_actions": [
    { "title": "...", "type": "task|appointment|followup", "priority": "low|medium|high", "due_days": 3 }
  ],
  "client_insights": {
    "main_need": "...",
    "objections": ["..."],
    "buying_signals": ["..."],
    "mortgage_stage": "découverte|qualification|proposition|fermeture",
    "preferred_lang": "fr|en"
  },
  "lead_score": 7,
  "lead_temperature": "hot|warm|cold",
  "lead_score_reason": "1 phrase"
}`;

async function callClaude(transcript: string): Promise<any> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY missing");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2000,
      system: ANALYSIS_SYSTEM,
      messages: [{ role: "user", content: ANALYSIS_USER(transcript) }],
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Claude ${res.status}: ${text.slice(0, 500)}`);
  }
  const data = JSON.parse(text);
  const raw = data?.content?.[0]?.text ?? "";
  // Strip any accidental code fences
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Claude returned non-JSON: ${cleaned.slice(0, 300)}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const { call_id, force } = await req.json().catch(() => ({}));
    if (!call_id) return json({ success: false, error: "call_id_required" }, 400);

    const admin = adminClient();
    const { data: call } = await admin
      .from("planipret_phone_calls")
      .select("id, user_id, transcript, ai_summary, maestro_client_id, maestro_call_id, ns_call_id")
      .eq("id", call_id)
      .maybeSingle();
    if (!call) return json({ success: false, error: "call_not_found" }, 404);
    if (!call.transcript) return json({ success: false, error: "no_transcript" }, 200);
    if (call.ai_summary && !force) return json({ success: true, cached: true });

    await setPipelineStep(admin, call_id, "ai", "running");
    await updateCallPipeline(admin, call_id, { step: "analyzing" });
    await pipelineLog(admin, { call_id, user_id: call.user_id, step: "ai_analysis", status: "started" });

    let analysis: any;
    try {
      analysis = await callClaude(call.transcript);
    } catch (e: any) {
      await setPipelineStep(admin, call_id, "ai", "error", { reason: e?.message?.slice(0, 200) });
      await updateCallPipeline(admin, call_id, { step: "error", error: `ai_${e?.message?.slice(0, 80)}` });
      await pipelineLog(admin, { call_id, user_id: call.user_id, step: "ai_analysis", status: "error", error_message: e?.message });
      await broadcastPipeline(admin, call.user_id, "pipeline_error", { call_id, step: "ai_analysis", error: e?.message });
      await maestroAudit(admin, "ai_analysis_failed", { call_id, error: e?.message });
      return json({ success: false, error: e?.message ?? "ai_failed" }, 200);
    }


    await admin
      .from("planipret_phone_calls")
      .update({
        ai_summary: analysis.summary_text,
        ai_coaching: analysis.coaching ?? null,
        ai_tasks: analysis.next_actions ?? [],
        ai_key_points: analysis.key_points ?? [],
        ai_sentiment: analysis.sentiment ?? null,
        ai_client_insights: analysis.client_insights ?? null,
        lead_score: analysis.lead_score ?? null,
        lead_temperature: analysis.lead_temperature ?? null,
        lead_score_reason: analysis.lead_score_reason ?? null,
      })
      .eq("id", call_id);

    // Push to Maestro
    try {
      const cfg = await getMaestroConfig(admin);
      if (cfg.url && cfg.key) {
        const auth = await getBrokerAuth(admin, call.user_id);
        const mId = call.maestro_call_id ?? call.ns_call_id ?? call.id;
        await maestroFetch(cfg, {
          method: "POST",
          path: `/api/v1/calls/${encodeURIComponent(mId)}/ai_summary`,
          token: auth.token,
          body: {
            summary_text: analysis.summary_text,
            key_points: analysis.key_points,
            next_actions: (analysis.next_actions ?? []).map((a: any) => a.title),
            sentiment: analysis.sentiment,
          },
        });
      }
    } catch (e) {
      console.warn("push ai_summary to maestro failed", e);
    }

    // Auto-create high-priority tasks
    try {
      const supaUrl = Deno.env.get("SUPABASE_URL")!;
      const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
      const highs = (analysis.next_actions ?? []).filter((a: any) => a.priority === "high");
      for (const a of highs) {
        if (!call.maestro_client_id) break;
        const due = new Date(Date.now() + (a.due_days ?? 3) * 86400_000).toISOString();
        fetch(`${supaUrl}/functions/v1/maestro-task`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${anon}` },
          body: JSON.stringify({
            maestro_client_id: call.maestro_client_id,
            title: a.title,
            due_date: due,
            priority: "high",
            call_id,
            source: "ai_summary",
          }),
        }).catch(() => {});
      }
    } catch {}

    await setPipelineStep(admin, call_id, "ai", "done", {
      lead_score: analysis.lead_score,
      coaching_score: analysis.coaching?.score,
    });
    await updateCallPipeline(admin, call_id, { step: "complete", completed: true });
    await pipelineLog(admin, {
      call_id,
      user_id: call.user_id,
      step: "ai_analysis",
      status: "success",
      payload: { lead_score: analysis.lead_score, lead_temperature: analysis.lead_temperature, coaching_score: analysis.coaching?.score },
    });
    await maestroAudit(admin, "ai_analysis_done", {
      call_id,
      lead_score: analysis.lead_score,
      lead_temperature: analysis.lead_temperature,
    });

    // Rich pipeline_complete broadcast
    await broadcastPipeline(admin, call.user_id, "pipeline_complete", {
      call_id,
      client_name: null,
      lead_score: analysis.lead_score,
      lead_temperature: analysis.lead_temperature,
      coaching_score: analysis.coaching?.score,
      has_transcript: true,
      maestro_synced: true,
      tasks_created: (analysis.next_actions ?? []).filter((a: any) => a.priority === "high").length,
    });

    return json({ success: true, analysis });
  } catch (e: any) {
    console.error("maestro-ai-analysis error", e);
    return json({ success: false, error: e?.message ?? "server_error" }, 500);
  }
});

