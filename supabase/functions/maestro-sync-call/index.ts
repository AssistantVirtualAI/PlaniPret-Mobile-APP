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
  summarizeMaestroFailure,
  telecomAuth,
  updateCallPipeline,
} from "../_shared/maestro.ts";
import { callCorrelationId, ensureMaestroCall } from "../_shared/maestro-guard.ts";
import { recordingPermalink } from "../_shared/recording-link.ts";

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

  const rid = crypto.randomUUID().slice(0, 8);
  const log = (msg: string, extra?: Record<string, unknown>) =>
    console.log(`[maestro-sync-call][${rid}] ${msg}${extra ? " " + JSON.stringify(extra) : ""}`);

  try {
    const { call_id, force } = await req.json().catch(() => ({}));
    if (!call_id) return json({ success: false, error: "call_id_required" }, 400);
    log("start", { call_id, force: !!force });

    const admin = adminClient();

    // ── Config diagnostics ────────────────────────────────
    // `maestro_not_configured` était opaque : on trace maintenant d'où vient
    // (ou ne vient pas) l'URL / la clé, y compris après une reconnexion OAuth.
    const { data: secretRows, error: secretErr } = await admin
      .from("planipret_integration_secrets")
      .select("provider, config, updated_at")
      .in("provider", ["maestro_telecom", "maestro"]);
    if (secretErr) {
      log("secrets_read_error", { message: secretErr.message, code: (secretErr as any).code });
    } else {
      log("secrets_rows", {
        providers: (secretRows ?? []).map((r: any) => ({
          provider: r.provider,
          has_api_url: !!(r.config?.api_url ?? r.config?.base_url),
          has_api_key: !!r.config?.api_key,
          updated_at: r.updated_at,
        })),
      });
    }

    const cfg = await getMaestroConfig(admin);
    const diag = {
      url_present: !!cfg.url,
      key_present: !!cfg.key,
      url_host: cfg.url ? (() => { try { return new URL(cfg.url).host; } catch { return "invalid_url"; } })() : null,
      key_len: cfg.key ? cfg.key.length : 0,
      account_id_present: !!cfg.accountId,
      env_base_url: !!Deno.env.get("MAESTRO_TELECOM_BASE_URL"),
      env_machine_key: !!Deno.env.get("MAESTRO_MACHINE_API_KEY"),
      secrets_rows: secretRows?.length ?? 0,
      secrets_error: secretErr?.message ?? null,
    };
    log("config_resolved", diag);

    if (!cfg.url || !cfg.key) {
      console.error(`[maestro-sync-call][${rid}] maestro_not_configured`, JSON.stringify(diag));
      return json({
        success: false,
        error: "maestro_not_configured",
        reason: !cfg.url && !cfg.key ? "missing_url_and_key" : !cfg.url ? "missing_url" : "missing_key",
        diagnostics: diag,
        request_id: rid,
      }, 200);
    }

    const { data: call0, error: callErr } = await admin
      .from("planipret_phone_calls")
      .select(CALL_COLUMNS)
      .eq("id", call_id)
      .maybeSingle();
    let call = call0;
    if (callErr) log("call_read_error", { message: callErr.message, code: (callErr as any).code });
    if (!call) {
      log("call_not_found", { call_id });
      return json({ success: false, error: "call_not_found", request_id: rid, db_error: callErr?.message ?? null }, 404);
    }
    log("call_loaded", { user_id: call.user_id, maestro_synced: call.maestro_synced, maestro_call_id: call.maestro_call_id });


    const steps: Record<string, unknown> = {};
    await updateCallPipeline(admin, call_id, { step: "maestro_sync", started: true, error: null });

    // ── 1. CDR + client lookup ─────────────────────────────
    if (!call.maestro_synced || force) {
      const r = await invoke("maestro-cdr", { call_id });
      steps.cdr = {
        ok: r.ok && r.data?.success !== false,
        status: r.data?.status ?? r.status,
        error: r.data?.error ?? null,
        detail: r.data?.detail ?? null,
        permanent: r.data?.permanent ?? false,
      };
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

    const auth = await telecomAuth(admin, call.user_id, false);
    log("broker_auth", {
      user_id: call.user_id,
      broker_id: auth.brokerId,
      using_service_key_fallback: auth.usingFallback,
      token_len: auth.token ? auth.token.length : 0,
    });
    if (!auth.brokerId) {
      await pipelineLog(admin, {
        call_id,
        user_id: call.user_id,
        step: "maestro_sync",
        status: "error",
        error_message: "maestro_telecom_user_id_missing",
      });
      return json({
        success: false,
        error: "maestro_telecom_user_id_missing",
        hint: "Reconnect the broker's Telecom identity so the numeric Telecom user ID is linked.",
        steps,
      }, 200);
    }
    // ── Garde-fou strict : CDR confirmé AVANT enregistrement / transcription / IA.
    // Tant que Maestro ne reconnaît pas le call id, on s'arrête et on laisse le
    // retry planifié rejouer (évite les maestro_put_404 / maestro_404 en cascade).
    const guard = await ensureMaestroCall(admin, { callId: String(call_id), step: "maestro_sync" });
    if (!guard.ok) {
      steps.guard = { ok: false, reason: guard.reason, permanent: !!guard.permanent, strikes: guard.strikes ?? null };
      await pipelineLog(admin, {
        call_id, user_id: call.user_id, step: "maestro_sync", status: "skipped",
        correlation_id: callCorrelationId(String(call_id)), entity_type: "call",
        error_message: guard.reason ?? "maestro_call_unconfirmed",
        payload: { steps, permanent: !!guard.permanent },
      });
      return json({
        success: false,
        error: guard.reason ?? "maestro_call_unconfirmed",
        retry_pending: !guard.permanent,
        steps,
      }, 200);
    }
    if (guard.maestroCallId && guard.maestroCallId !== call.maestro_call_id) {
      call = { ...call, maestro_call_id: guard.maestroCallId };
    }
    const mId = call.maestro_call_id;



    // ── 2. Recording upload ────────────────────────────────
    const rec = await invoke("maestro-recording-upload", { call_id, force });
    steps.recording = rec.data?.skipped
      ? { ok: true, skipped: rec.data.skipped }
      : { ok: !!rec.data?.success, status: rec.data?.status ?? rec.status, error: rec.data?.error ?? null, detail: rec.data?.detail ?? null, permanent: rec.data?.permanent ?? false };

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
      if (fresh) {
        call = fresh;
        transcript = fresh.transcript ?? fresh.transcript_raw ?? transcript;
        steps.transcript = transcript && transcript.trim().length >= 20
          ? { ok: true, generated: true }
          : { ok: false, generated: true, error: tr.data?.error ?? "transcript_unavailable" };
      }
    } else if (mId) {
      // Scott's Telecom API has no transcript upload endpoint; the transcript
      // is pushed inside the call PUT below (notes field).
      steps.transcript = { ok: true, reused: true, delivered_via: "call_update" };
      await setPipelineStep(admin, call_id, "transcript", "done", { pushed: true });
    } else {
      steps.transcript = { ok: false, skipped: "maestro_call_id_missing", error: "maestro_call_id_missing" };
    }

    // `maestro-transcript` also starts analysis asynchronously, but the
    // orchestrator must not finish before that analysis exists. Generate (or
    // reuse) it now, then reload so summary/coaching are delivered in this run.
    if (transcript && !(call.ai_summary ?? call.ai_summary_short)) {
      const aiResult = await invoke("maestro-ai-analysis", { call_id });
      const { data: analyzed } = await admin
        .from("planipret_phone_calls")
        .select(CALL_COLUMNS)
        .eq("id", call_id)
        .maybeSingle();
      if (analyzed) call = analyzed;
      if (!(call.ai_summary ?? call.ai_summary_short)) {
        steps.ai = {
          ok: false,
          status: aiResult.status,
          error: aiResult.data?.error ?? "ai_analysis_missing",
        };
      }
    }

    // ── 4. AI summary + analytics (reuse existing analysis) ─
    const aij = (call.ai_analysis_json ?? {}) as any;
    const summary = call.ai_summary ?? call.ai_summary_short ?? aij?.summary?.text ?? null;
    const nextActions = asArray((call as any).ai_tasks).length
      ? asArray((call as any).ai_tasks)
      : asArray(call.next_actions).length
        ? asArray(call.next_actions)
        : asArray(call.ai_action_items);

    if (summary && mId) {
      const keyPoints = asArray(call.ai_key_points).length
        ? asArray(call.ai_key_points)
        : asArray(aij?.key_points).length
          ? asArray(aij.key_points)
          : asArray(call.ai_topics);

      const recordingLink = await recordingPermalink(String(call_id)).catch(() => null);
      const res = await maestroFetch(cfg, {
        method: "PUT",
        path: `/api/v1/users/${encodeURIComponent(String(auth.brokerId ?? ""))}/calls/${encodeURIComponent(String(mId))}`,
        token: auth.token,
        // Maestro n'accepte que `status`, `ai_summary` et `notes` sur ce PUT :
        // tout le reste (coaching, scores, transcription) part dans `notes`.
        body: {
          status: "ended",
          ai_summary: summary,
          notes: [
            recordingLink ? `Enregistrement: ${recordingLink}` : null,
            summary ? `Résumé IA: ${summary}` : null,
            keyPoints.length ? `Points clés: ${keyPoints.map(String).join(" • ")}` : null,
            nextActions.length ? `Prochaines actions: ${nextActions.map(actionTitle).filter(Boolean).join(" • ")}` : null,
            call.ai_coaching ? `Coaching IA${call.coaching_score != null ? ` (${call.coaching_score}/100)` : ""}:\n${String(call.ai_coaching).slice(0, 4000)}` : null,
            call.lead_score != null ? `Score du lead: ${call.lead_score}${call.lead_temperature ? ` (${call.lead_temperature})` : ""}` : null,
            transcript ? `Transcription:\n${String(transcript).slice(0, 8000)}` : null,
          ].filter(Boolean).join("\n\n") || null,
        },
      });
      const failure = res.ok ? null : summarizeMaestroFailure(res.status, res.data);
      steps.ai = { ok: res.ok, status: res.status, reused: true, error: failure?.error ?? null, detail: failure?.detail ?? null, permanent: failure?.permanent ?? false };
      await setPipelineStep(admin, call_id, "ai", res.ok ? "done" : "error", {
        pushed: res.ok,
        lead_score: call.lead_score,
        coaching_score: call.coaching_score,
      });
      await pipelineLog(admin, {
        call_id, user_id: call.user_id, step: "ai_summary_push",
        status: res.ok ? "success" : "error",
        correlation_id: call_id,
        entity_type: "ai",
        entity_id: String(mId),
        endpoint: res.endpoint,
        http_status: res.status,
        error_message: res.ok ? undefined : failure?.error,
        payload: { status: res.status, broker_id: auth.brokerId, client_id: call.maestro_client_id, lead_score: call.lead_score, response: res.data ?? null },
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
      steps.ai = summary
        ? { ok: false, skipped: "maestro_call_id_missing", error: "maestro_call_id_missing" }
        : { ok: false, skipped: "no_analysis_yet" };
    }

    const allOk =
      (steps.cdr as any)?.ok !== false &&
      (steps.recording as any)?.ok !== false &&
      (steps.transcript as any)?.ok !== false &&
      (steps.ai as any)?.ok !== false;

    await setPipelineStep(admin, call_id, "maestro", allOk ? "done" : "error", steps);
    const stepValues = Object.values(steps) as any[];
    const firstError = stepValues.find((s) => s?.error)?.error ?? (allOk ? null : "maestro_partial_sync");
    const firstDetail = stepValues.find((s) => s?.detail)?.detail ?? null;
    await updateCallPipeline(admin, call_id, {
      step: allOk ? "complete" : "maestro_partial",
      completed: allOk,
      error: allOk ? null : firstError,
    });
    await maestroAudit(admin, "call_synced", { call_id, steps, all_ok: allOk });
    await broadcastPipeline(admin, call.user_id, "pipeline_step", {
      call_id,
      step: "maestro_synced",
      label: allOk ? "Appel synchronisé avec Maestro ✅" : "Synchronisation Maestro partielle ⚠️",
      steps,
    });

    log("done", { allOk, steps });
    return json({ success: allOk, call_id, maestro_call_id: mId, error: allOk ? null : firstError, detail: firstDetail, permanent: stepValues.some((s) => s?.permanent === true), steps, request_id: rid });
  } catch (e: any) {
    console.error(`[maestro-sync-call][${rid}] fatal`, e?.stack ?? e);
    return json({ success: false, error: e?.message ?? "server_error", request_id: rid }, 500);
  }

});
