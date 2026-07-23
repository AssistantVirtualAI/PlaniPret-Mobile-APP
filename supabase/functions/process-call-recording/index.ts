// process-call-recording: single idempotent pipeline that transcribes + analyzes + coaches a call recording.
// Short-circuits when results already exist so we never bill or run twice for the same recording.
// Writes an audit trail of every run to public.call_intelligence_audit.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function buildResult(insight: any, transcript: string | null, status: string, extras: Record<string, unknown> = {}) {
  return {
    status,
    insight,
    transcript,
    summary: insight?.summary ?? null,
    sentiment: insight?.sentiment ?? null,
    satisfaction_score: insight?.satisfaction_score ?? null,
    quality_score: insight?.quality_score ?? null,
    coaching_score: insight?.coaching_score ?? null,
    coaching_notes: insight?.coaching_notes ?? [],
    action_items: insight?.action_items ?? [],
    topics: insight?.topics ?? [],
    key_phrases: insight?.key_phrases ?? [],
    intent: insight?.intent ?? null,
    risks: insight?.risks ?? [],
    sales_opportunities: insight?.sales_opportunities ?? [],
    escalation_needed: insight?.escalation_needed ?? false,
    last_processed_at: insight?.created_at ?? null,
    ...extras,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const runId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const token = auth.replace("Bearer ", "");
    const isService = token === SERVICE_ROLE;

    let userId: string | null = null;
    if (!isService) {
      const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
      const { data: claims, error: authErr } = await userClient.auth.getClaims(token);
      if (authErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
      userId = claims.claims.sub as string;
    }

    const body = await req.json().catch(() => ({}));
    const { callId, force } = body ?? {};
    if (!callId) return json({ error: "callId required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: call, error: callErr } = await admin
      .from("pbx_call_records")
      .select("id, organization_id, caller_number, caller_name, destination, destination_number, direction, duration_seconds, recording_url, recording_path, recording_name, pbx_uuid, domain_uuid, domain_name, has_recording")
      .eq("id", callId)
      .single();
    if (callErr || !call) return json({ error: "Call not found" }, 404);

    // Idempotency key — same callId + recording URL = same logical request.
    const recordingVersion = call.recording_url
      ? Array.from(new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(call.recording_url))))
          .map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16)
      : "no-url";
    const idempotencyKey = `${callId}:${recordingVersion}`;

    const audit = async (event: string, status: string, extra: Record<string, unknown> = {}) => {
      await admin.from("call_intelligence_audit").insert({
        run_id: runId,
        organization_id: call.organization_id,
        call_record_id: call.id,
        event,
        status,
        forced: !!force,
        triggered_by: userId,
        duration_ms: Date.now() - startedAt,
        idempotency_key: idempotencyKey,
        ...extra,
      });
    };

    // Membership / super admin check (skipped for internal service-role calls)
    if (!isService && userId) {
      const { data: member } = await admin
        .from("organization_members")
        .select("id")
        .eq("user_id", userId)
        .eq("organization_id", call.organization_id)
        .maybeSingle();
      if (!member) {
        const { data: isSa } = await admin.rpc("is_super_admin", { _user_id: userId });
        if (!isSa) return json({ error: "Forbidden" }, 403);
      }
    }

    // Early dedup via idempotency key — same recording version already running/done in last 5 min
    if (!force) {
      const since = new Date(Date.now() - 5 * 60_000).toISOString();
      const { data: recentRun } = await admin
        .from("call_intelligence_audit")
        .select("status, run_id")
        .eq("idempotency_key", idempotencyKey)
        .gte("created_at", since)
        .in("status", ["queued", "processing", "analyzed"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (recentRun) {
        return json({
          status: recentRun.status === "analyzed" ? "cached" : "processing",
          message: `Deduped via idempotency key (existing run ${(recentRun as any).run_id.slice(0,8)})`,
          idempotency_key: idempotencyKey,
        }, recentRun.status === "analyzed" ? 200 : 202);
      }
    }

    // Short-circuit: already processed
    const { data: existingInsight } = await admin
      .from("pbx_ai_insights")
      .select("*")
      .eq("call_record_id", callId)
      .maybeSingle();
    const { data: existingTr } = await admin
      .from("pbx_call_transcripts")
      .select("transcript_text, provider, created_at")
      .eq("call_record_id", callId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!force && existingInsight && existingTr?.transcript_text) {
      const { data: existingCall } = await admin.from("pbx_call_records")
        .select("raw_data")
        .eq("id", call.id)
        .maybeSingle();
      await admin.from("pbx_call_records").update({
        analyzed: true,
        transcribed: true,
        ai_processing: false,
        ai_summary: (existingInsight as any).summary || null,
        raw_data: {
          ...((existingCall?.raw_data as Record<string, unknown>) || {}),
          transcript_text: existingTr.transcript_text,
          transcript_provider: (existingCall?.raw_data as any)?.transcript_provider || "cached",
          ai: { ...(existingInsight as Record<string, unknown>) },
          ai_model: (existingInsight as any).ai_model || null,
        },
      }).eq("id", call.id);
      await audit("skipped_cached", "skipped", {
        pipeline: "full",
        metadata: {
          reason: "transcript_and_insight_present",
          outputs: { transcript: true, insight: true },
          insight_created_at: (existingInsight as any).created_at,
          transcript_created_at: (existingTr as any).created_at,
        },
      });
      return json(buildResult(existingInsight, existingTr.transcript_text, "cached", {
        skipped_reason: "Transcript and AI insight already exist for this recording — no new run was executed.",
        outputs_present: { transcript: true, insight: true },
      }));
    }

    // Concurrency guard via Postgres advisory lock (works across all apps/regions)
    const { data: lockOk } = await admin.rpc("try_lock_call_intel", { _call_id: callId });
    if (!lockOk) {
      await audit("locked_busy", "processing", { metadata: { reason: "another_run_in_progress" } });
      return json({
        status: "processing",
        message: "Another analysis run is already in progress for this recording.",
      }, 409);
    }

    try {
      await audit("queued", "queued", { pipeline: "full" });

      // Step 1: ensure transcript
      const existingProvider = String((existingTr as any)?.provider || "").toLowerCase();
      let transcript = existingProvider.startsWith("stub") ? "" : existingTr?.transcript_text ?? "";
      if (!transcript) {
        try {
          const sttRes = await fetch(`${SUPABASE_URL}/functions/v1/ai-transcribe-call`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}`, apikey: SERVICE_ROLE },
            body: JSON.stringify({
              call_record_id: call.id,
              organization_id: call.organization_id,
              recording_url: call.recording_url,
              recording_path: (call as any).recording_path,
              recording_name: (call as any).recording_name,
              xml_cdr_uuid: (call as any).pbx_uuid,
              domain_uuid: (call as any).domain_uuid,
            }),
          });
          if (!sttRes.ok) {
            const t = await sttRes.text();
            console.error("STT failed", sttRes.status, t);
            await audit("failed", "failed", { pipeline: "transcribe", error: t.slice(0, 500) });
            return json({ status: "pending_sync", message: "Transcription temporarily unavailable", details: t.slice(0, 500), retry_after_ms: 5000 }, 202);
          }
          const sttJson = await sttRes.json();
          transcript = sttJson.transcript_text ?? sttJson.text ?? "";
          if (sttJson.stub) {
            await audit("failed", "failed", { pipeline: "transcribe", error: sttJson.reason || "stub_transcript", metadata: { reason: sttJson.reason, pending_sync: sttJson.pending_sync } });
            return json({ status: sttJson.pending_sync ? "pending_sync" : "missing", message: sttJson.reason || "Transcript unavailable", retry_after_ms: sttJson.retry_after_ms ?? 5000 }, 202);
          }
          if (transcript) {
            const { data: existingCall } = await admin.from("pbx_call_records")
              .select("raw_data")
              .eq("id", call.id)
              .maybeSingle();
            await admin.from("pbx_call_records").update({
              transcribed: true,
              raw_data: {
                ...((existingCall?.raw_data as Record<string, unknown>) || {}),
                transcript_text: transcript,
                transcript_provider: sttJson.provider || "ai-transcribe-call",
                transcript_updated_at: new Date().toISOString(),
              },
            }).eq("id", call.id);
            await audit("transcribed", "processing", { pipeline: "transcribe", metadata: { chars: transcript.length, provider: sttJson.provider || null } });
          }
        } catch (e) {
          console.error("STT error", e);
          await audit("failed", "failed", { pipeline: "transcribe", error: String(e).slice(0, 500) });
          return json({ status: "pending_sync", message: "Transcription temporarily unavailable", retry_after_ms: 5000 }, 202);
        }
      }

      if (!transcript) {
        await audit("failed", "failed", { pipeline: "transcribe", error: "empty_transcript" });
        return json({ status: "pending_sync", message: "Empty transcript", retry_after_ms: 5000 }, 202);
      }

      // Step 2: analyze + coach (skip if cached and not force)
      if (existingInsight && !force) {
        await audit("skipped_cached", "skipped", {
          pipeline: "analyze",
          metadata: { reason: "insight_present_after_transcribe" },
        });
        return json(buildResult(existingInsight, transcript, "cached", {
          skipped_reason: "Insight already exists — skipped re-analysis.",
          outputs_present: { transcript: true, insight: true },
        }));
      }

      const destination = call.destination ?? call.destination_number ?? "unknown";
      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
          "X-Lovable-AIG-SDK": "edge-function",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content:
                "You are an expert call-center analyst and coach. Produce concise, factual analysis AND constructive coaching feedback for the human agent. Always answer in the call's language.",
            },
            {
              role: "user",
              content: `Analyze this call.\nCaller: ${call.caller_name ?? call.caller_number ?? "unknown"} → ${destination}\nDirection: ${call.direction}\nDuration: ${call.duration_seconds ?? 0}s.\n\nTranscript:\n${transcript.slice(0, 16000)}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "save_insight",
                description: "Save structured insight + coaching for this call",
                parameters: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    summary: { type: "string" },
                    sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
                    satisfaction_score: { type: "number" },
                    quality_score: { type: "number" },
                    intent: { type: "string" },
                    topics: { type: "array", items: { type: "string" } },
                    action_items: { type: "array", items: { type: "string" } },
                    coaching_notes: { type: "array", items: { type: "string" } },
                    coaching_score: { type: "number" },
                    risks: { type: "array", items: { type: "string" } },
                    sales_opportunities: { type: "array", items: { type: "string" } },
                    escalation_needed: { type: "boolean" },
                    key_phrases: { type: "array", items: { type: "string" } },
                  },
                  required: ["summary", "sentiment", "topics", "action_items", "coaching_notes"],
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "save_insight" } },
        }),
      });

      if (aiRes.status === 429) {
        await audit("failed", "failed", { pipeline: "analyze", error: "rate_limited" });
        return json({ error: "Rate limited, please retry shortly." }, 429);
      }
      if (aiRes.status === 402) {
        await audit("failed", "failed", { pipeline: "analyze", error: "credits_exhausted" });
        return json({ error: "AI credits exhausted." }, 402);
      }
      if (!aiRes.ok) {
        const t = await aiRes.text();
        console.error("AI gateway", aiRes.status, t);
        await audit("failed", "failed", { pipeline: "analyze", error: t.slice(0, 500) });
        return json({ error: "AI gateway error", details: t }, 500);
      }
      const aiJson = await aiRes.json();
      const args = aiJson.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      const parsed = args ? JSON.parse(args) : {};

      const row = {
        organization_id: call.organization_id,
        call_record_id: call.id,
        summary: parsed.summary ?? null,
        sentiment: parsed.sentiment ?? null,
        satisfaction_score: parsed.satisfaction_score ?? null,
        quality_score: parsed.quality_score ?? null,
        intent: parsed.intent ?? null,
        topics: parsed.topics ?? [],
        action_items: parsed.action_items ?? [],
        coaching_notes: parsed.coaching_notes ?? [],
        coaching_score: parsed.coaching_score ?? null,
        risks: parsed.risks ?? [],
        sales_opportunities: parsed.sales_opportunities ?? [],
        escalation_needed: parsed.escalation_needed ?? false,
        key_phrases: parsed.key_phrases ?? [],
        ai_model: "google/gemini-3-flash-preview",
        prompt_version: "v2-coaching",
      };

      await admin.from("pbx_ai_insights").delete().eq("call_record_id", callId);
      const { data: inserted, error: insErr } = await admin
        .from("pbx_ai_insights")
        .insert(row)
        .select()
        .single();
      if (insErr) {
        console.error(insErr);
        await audit("failed", "failed", { pipeline: "analyze", error: insErr.message });
        return json({ error: "Failed to save insight" }, 500);
      }
      const { data: existingCallForAi } = await admin.from("pbx_call_records")
        .select("raw_data")
        .eq("id", call.id)
        .maybeSingle();
      await admin.from("pbx_call_records").update({
        analyzed: true,
        transcribed: true,
        ai_summary: row.summary,
        raw_data: {
          ...((existingCallForAi?.raw_data as Record<string, unknown>) || {}),
          transcript_text: transcript,
          transcript_provider: (existingCallForAi?.raw_data as any)?.transcript_provider || "elevenlabs",
          ai: { ...row },
          ai_model: row.ai_model,
          ai_updated_at: new Date().toISOString(),
        },
      }).eq("id", call.id);
      await audit("analyzed", "analyzed", {
        pipeline: "analyze",
        ai_model: row.ai_model,
        prompt_version: row.prompt_version,
        metadata: { insight_id: (inserted as any)?.id },
      });

      return json(buildResult(inserted, transcript, force ? "regenerated" : "created", {
        run_id: runId,
        outputs_present: { transcript: true, insight: true },
      }));
    } finally {
      await admin.rpc("unlock_call_intel", { _call_id: callId }).catch(() => {});
    }
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
