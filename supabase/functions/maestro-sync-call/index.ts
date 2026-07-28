// POST /functions/v1/maestro-sync-call
// Body: { call_id: uuid, force?: boolean }
//
// Single idempotent orchestrator that pushes EVERYTHING we know about a call
// into Maestro, per broker:
//   1. CDR + client lookup      (maestro-cdr)
//   2. Recording audio upload   (maestro-recording-upload)
//   3. Transcript               (reuses the stored transcript; only transcribes if missing)
//   4. AI summary + analytics   (reuses pp-coach-call output — never re-bills Claude)
//   5. High priority tasks      (maestro-task)
import {
  adminClient,
  broadcastPipeline,
  corsHeaders,
  getBrokerAuth,
  getMaestroConfig,
  json,
  maestroAudit,
  maestroFetch,
  maestroFetchScoped,
  pipelineLog,
  setPipelineStep,
  updateCallPipeline,
} from "../_shared/maestro.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CALL_COLUMNS =
  "id, user_id, transcript, transcript_raw, transcript_segments, transcript_language, ai_summary, ai_summary_short, ai_coaching, ai_analysis_json, ai_topics, ai_action_items, ai_key_points, ai_client_insights, next_actions, lead_score, lead_temperature, lead_score_reason, coaching_score, maestro_synced, maestro_call_id, maestro_client_id, ns_call_id, pipeline_state, metadata";

async function invoke(fn: string, body: unknown) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (e: any) {
    return { ok: false, status: 0, data: { error: e?.message } };
  }
}

function asArray(v: unknown): any[] {
  return Array.isArray(v) ? v : [];
}

function actionTitle(a: any): string | null {
  if (!a) return null;
  if (typeof a === "string") return a;
  return a.title ?? a.description ?? a.label ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const { call_id, force } = await req.json().catch(() => ({}));
    if (!call_id) return json({ success: false, error: "call_id_required" }, 400);

    const admin = adminClient();
    const cfg = await getMaestroConfig(admin);
    if (!cfg.url || !cfg.key) {
      return json({ success: false, error: "maestro_not_configured" }, 200);
    }

    let { data: call } = await admin
      .from("planipret_phone_calls")
      .select(CALL_COLUMNS)
      .eq("id", call_id)
      .maybeSingle();
    if (!call) return json({ success: false, error: "call_not_found" }, 404);

    const steps: Record<string, unknown> = {};
    await updateCallPipeline(admin, call_id, { step: "maestro_sync", started: true, error: null });

    // ── 1. CDR + client lookup ─────────────────────────────
    if (!call.maestro_synced || force) {
      const r = await invoke("maestro-cdr", { call_id });
      steps.cdr = { ok: r.ok && r.data?.success !== false, status: r.status };
      // reload so we pick up maestro_call_id / maestro_client_id
      const { data: fresh } = await admin
        .from("planipret_phone_calls")
        .select(CALL_COLUMNS)
        .eq("id", call_id)
        .maybeSingle();
      if (fresh) call = fresh;
    } else {
      steps.cdr = { ok: true, skipped: "already_synced" };
    }

    const auth = await getBrokerAuth(admin, call.user_id);
    const mId = call.maestro_call_id ?? call.ns_call_id ?? call.id;

    // ── 2. Recording upload ────────────────────────────────
    const rec = await invoke("maestro-recording-upload", { call_id, force });
    steps.recording = rec.data?.skipped
      ? { ok: true, skipped: rec.data.skipped }
      : { ok: !!rec.data?.success, error: rec.data?.error ?? null };

    // ── 3. Transcript ──────────────────────────────────────
    let transcript: string | null = call.transcript ?? call.transcript_raw ?? null;
    if (!transcript || transcript.trim().length < 20) {
      const tr = await invoke("maestro-transcript", { call_id });
      transcript = tr.data?.transcript ?? null;
      steps.transcript = { ok: !!transcript, generated: true };
      const { data: fresh } = await admin
        .from("planipret_phone_calls")
        .select(CALL_COLUMNS)
        .eq("id", call_id)
        .maybeSingle();
      if (fresh) call = fresh;
    } else {
      // Push the already-stored transcript (no re-transcription cost).
      const res = await maestroFetchScoped(cfg, {
        method: "POST",
        path: `/api/v1/calls/${encodeURIComponent(String(mId))}/transcript`,
        token: auth.token,
        brokerId: auth.brokerId,
        body: {
          language: call.transcript_language ?? "fr-CA",
          text: transcript,
          segments: asArray(call.transcript_segments),
          confidence: 0.95,
        },
      });
      steps.transcript = { ok: res.ok, status: res.status, reused: true };
      await setPipelineStep(admin, call_id, "transcript", res.ok ? "done" : "error", { pushed: res.ok });
      await pipelineLog(admin, {
        call_id, user_id: call.user_id, step: "transcript_push",
        status: res.ok ? "success" : "error",
        payload: { status: res.status },
      });
    }

    // ── 4. AI summary + analytics (reuse existing analysis) ─
    const aij = (call.ai_analysis_json ?? {}) as any;
    const summary = call.ai_summary ?? call.ai_summary_short ?? aij?.summary?.text ?? null;
    const nextActions = asArray((call as any).ai_tasks).length
      ? asArray((call as any).ai_tasks)
      : asArray(call.next_actions).length
        ? asArray(call.next_actions)
        : asArray(call.ai_action_items);

    if (summary) {
      const keyPoints = asArray(call.ai_key_points).length
        ? asArray(call.ai_key_points)
        : asArray(aij?.key_points).length
          ? asArray(aij.key_points)
          : asArray(call.ai_topics);

      const res = await maestroFetchScoped(cfg, {
        method: "POST",
        path: `/api/v1/calls/${encodeURIComponent(String(mId))}/ai_summary`,
        token: auth.token,
        brokerId: auth.brokerId,
        body: {
          summary_text: summary,
          key_points: keyPoints,
          next_actions: nextActions.map(actionTitle).filter(Boolean),
          sentiment: (call as any).ai_sentiment ?? aij?.sentiment ?? null,
          analytics: {
            coaching: call.ai_coaching ?? aij?.coaching ?? null,
            coaching_score: call.coaching_score ?? null,
            lead_score: call.lead_score ?? null,
            lead_temperature: call.lead_temperature ?? null,
            lead_score_reason: call.lead_score_reason ?? null,
            client_insights: call.ai_client_insights ?? aij?.client_insights ?? null,
            topics: asArray(call.ai_topics),
          },
        },
      });
      steps.ai = { ok: res.ok, status: res.status, reused: true };
      await setPipelineStep(admin, call_id, "ai", res.ok ? "done" : "error", {
        pushed: res.ok,
        lead_score: call.lead_score,
        coaching_score: call.coaching_score,
      });
      await pipelineLog(admin, {
        call_id, user_id: call.user_id, step: "ai_summary_push",
        status: res.ok ? "success" : "error",
        payload: { status: res.status, lead_score: call.lead_score },
      });

      // ── 5. High-priority tasks ───────────────────────────
      if (call.maestro_client_id) {
        const meta = (call.metadata ?? {}) as Record<string, unknown>;
        if (!meta.maestro_tasks_pushed_at || force) {
          let created = 0;
          for (const a of nextActions) {
            const title = actionTitle(a);
            if (!title) continue;
            const priority = typeof a === "object" ? (a.priority ?? "medium") : "medium";
            if (priority !== "high") continue;
            const dueDays = (typeof a === "object" && a.due_days) || 3;
            await invoke("maestro-task", {
              maestro_client_id: call.maestro_client_id,
              title,
              due_date: new Date(Date.now() + dueDays * 86400_000).toISOString(),
              priority: "high",
              call_id,
              source: "ai_summary",
            });
            created++;
          }
          steps.tasks = { ok: true, created };
          await admin
            .from("planipret_phone_calls")
            .update({ metadata: { ...meta, maestro_tasks_pushed_at: new Date().toISOString() } })
            .eq("id", call_id);
        } else {
          steps.tasks = { ok: true, skipped: "already_pushed" };
        }
      }
    } else {
      steps.ai = { ok: false, skipped: "no_analysis_yet" };
    }

    const allOk =
      (steps.cdr as any)?.ok !== false &&
      (steps.recording as any)?.ok !== false &&
      (steps.transcript as any)?.ok !== false &&
      (steps.ai as any)?.ok !== false;

    await setPipelineStep(admin, call_id, "maestro", allOk ? "done" : "error", steps);
    await updateCallPipeline(admin, call_id, {
      step: allOk ? "complete" : "maestro_partial",
      completed: allOk,
      error: allOk ? null : "maestro_partial_sync",
    });
    await maestroAudit(admin, "call_synced", { call_id, steps, all_ok: allOk });
    await broadcastPipeline(admin, call.user_id, "pipeline_step", {
      call_id,
      step: "maestro_synced",
      label: allOk ? "Appel synchronisé avec Maestro ✅" : "Synchronisation Maestro partielle ⚠️",
      steps,
    });

    return json({ success: allOk, call_id, maestro_call_id: mId, steps });
  } catch (e: any) {
    console.error("maestro-sync-call error", e);
    return json({ success: false, error: e?.message ?? "server_error" }, 500);
  }
});
