// POST /functions/v1/maestro-recording-upload
// Body: { call_id: uuid }
//
// Per Scott (Maestro): there is NO upload endpoint for recordings — Maestro
// generates the media server-side once the call is marked `{status:"ended"}`
// (done by `maestro-cdr`). This function only POLLS:
//   GET /api/v1/users/{brokerId}/calls/{maestroCallId}/recording
import {
  adminClient,
  corsHeaders,
  getMaestroConfig,
  json,
  maestroFetch,
  pipelineLog,
  setPipelineStep,
  telecomAuth,
} from "../_shared/maestro.ts";
import { recordingPermalink } from "../_shared/recording-link.ts";
import { callCorrelationId, ensureMaestroCall } from "../_shared/maestro-guard.ts";

function pickUrl(d: any): string | null {
  if (!d) return null;
  if (typeof d === "string") return d.startsWith("http") ? d : null;
  // Maestro still generating the media.
  if (Number(d.saving_call_recording) === 1) return null;
  const c = d.call ?? d.recording ?? {};
  return d.call_recording_url ?? d.recording_url ?? d.url ?? d.download_url ?? d.media_url ?? d.file_url
    ?? c.call_recording_url ?? c.recording_url ?? c.url ?? null;
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const { call_id } = await req.json().catch(() => ({} as any));
  if (!call_id) return json({ success: false, error: "call_id_required" }, 400);

  const admin = adminClient();
  let { data: call } = await admin
    .from("planipret_phone_calls")
    .select("id, user_id, maestro_call_id, recording_url, metadata")
    .eq("id", call_id)
    .maybeSingle();

  const userId = call?.user_id ?? null;
  let maestroCallId = (call as any)?.maestro_call_id ?? null;

  const correlation_id = callCorrelationId(String(call_id));

  // Garde-fou: le maestro_call_id doit exister CÔTÉ Maestro avant tout PUT.
  // (source des maestro_put_404 en boucle: id périmé jamais invalidé)
  const guard = await ensureMaestroCall(admin, { callId: String(call_id), step: "recording_poll" });
  if (!guard.ok) {
    await pipelineLog(admin, {
      call_id, user_id: userId, step: "recording_poll", status: "skipped",
      error_message: guard.reason ?? "maestro_call_unavailable",
      correlation_id, entity_type: "call",
      payload: { permanent: !!guard.permanent, strikes: guard.strikes ?? null },
    });
    await admin.from("planipret_recording_uploads").upsert({
      call_id, user_id: userId, status: guard.permanent ? "failed" : "skipped",
      error_message: guard.reason ?? "maestro_call_unavailable", updated_at: new Date().toISOString(),
    }, { onConflict: "call_id" }).then(() => {}, () => {});
    return json({ success: false, error: guard.reason ?? "maestro_call_unavailable", permanent: !!guard.permanent }, 424);
  }
  maestroCallId = guard.maestroCallId;
  {
    const refreshed = await admin
      .from("planipret_phone_calls")
      .select("id, user_id, maestro_call_id, recording_url, metadata")
      .eq("id", call_id)
      .maybeSingle();
    call = refreshed.data ?? call;
  }

  const cfg = await getMaestroConfig(admin);
  const auth = await telecomAuth(admin, userId ?? "", false);
  if (!cfg.url || !cfg.key || !auth.brokerId) {
    return json({ success: false, error: !auth.brokerId ? "maestro_telecom_user_id_missing" : "maestro_not_configured" });
  }

  const res = await maestroFetch(cfg, {
    method: "GET",
    path: `/api/v1/users/${encodeURIComponent(String(auth.brokerId))}/calls/${encodeURIComponent(String(maestroCallId))}/recording`,
    token: auth.token,
    machine: auth.machine,
  });
  let url = res.ok ? pickUrl(res.data) : null;
  let source: "maestro" | "netsapiens" = "maestro";
  const meta = ((call as any)?.metadata ?? {}) as Record<string, unknown>;

  // Maestro ne génère pas toujours le média (404 récurrent). L'audio réel vit
  // dans NetSapiens : on le récupère et on pousse le lien dans la fiche
  // d'appel Maestro, sinon l'enregistrement reste introuvable côté CRM.
  if (!url) {
    try {
      const nsRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ns-get-recording`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ call_db_id: call_id, prefer_url: true }),
      });
      const nsData = await nsRes.json().catch(() => ({} as any));
      if (nsData?.available && (nsData.url || nsData.recording_url)) {
        url = String(nsData.url ?? nsData.recording_url);
        source = "netsapiens";
      }
    } catch (_) { /* non-fatal */ }
  }

  if (url) {
    // Maestro n'accepte QUE `status`, `ended_reason`, `ai_summary` et `notes`
    // sur PUT /calls/{id} (testé : recording_url → 500, POST /recording → 404).
    // On publie donc un lien d'écoute PERMANENT dans les notes, en préservant
    // le résumé IA et la transcription déjà poussés.
    const permalink = await recordingPermalink(String(call_id));
    const { data: aiCall } = await admin
      .from("planipret_phone_calls")
      .select("ai_summary, ai_summary_short, ai_key_points, ai_topics, next_actions, ai_action_items, transcript, ai_coaching, coaching_score, lead_score, lead_temperature")
      .eq("id", call_id)
      .maybeSingle();
    const arr = (v: unknown) => (Array.isArray(v) ? v : []);
    const title = (a: any) => (typeof a === "string" ? a : a?.title ?? a?.description ?? a?.label ?? null);
    const keyPoints = arr((aiCall as any)?.ai_key_points).length
      ? arr((aiCall as any)?.ai_key_points)
      : arr((aiCall as any)?.ai_topics);
    const actions = arr((aiCall as any)?.next_actions).length
      ? arr((aiCall as any)?.next_actions)
      : arr((aiCall as any)?.ai_action_items);
    const notes = [
      `Enregistrement: ${permalink}`,
      (aiCall as any)?.ai_summary || (aiCall as any)?.ai_summary_short
        ? `Résumé IA: ${(aiCall as any)?.ai_summary ?? (aiCall as any)?.ai_summary_short}`
        : null,
      keyPoints.length ? `Points clés: ${keyPoints.map(String).join(" • ")}` : null,
      actions.length ? `Prochaines actions: ${actions.map(title).filter(Boolean).join(" • ")}` : null,
      (aiCall as any)?.ai_coaching
        ? `Coaching IA${(aiCall as any)?.coaching_score != null ? ` (${(aiCall as any).coaching_score}/100)` : ""}:\n${JSON.stringify((aiCall as any).ai_coaching).slice(0, 4000)}`
        : null,
      (aiCall as any)?.lead_score != null
        ? `Score du lead: ${(aiCall as any).lead_score}${(aiCall as any)?.lead_temperature ? ` (${(aiCall as any).lead_temperature})` : ""}`
        : null,
      (aiCall as any)?.transcript ? `Transcription:\n${String((aiCall as any).transcript).slice(0, 8000)}` : null,
    ].filter(Boolean).join("\n\n");

    const put = await maestroFetch(cfg, {
      method: "PUT",
      path: `/api/v1/users/${encodeURIComponent(String(auth.brokerId))}/calls/${encodeURIComponent(String(maestroCallId))}`,
      token: auth.token,
      machine: auth.machine,
      body: {
        status: "ended",
        ai_summary: (aiCall as any)?.ai_summary ?? (aiCall as any)?.ai_summary_short ?? undefined,
        notes,
      },
    });
    await pipelineLog(admin, {
      call_id, user_id: userId, step: "recording_push", status: put.ok ? "success" : "error",
      error_message: put.ok ? null : `maestro_put_${put.status}: ${typeof (put as any).data === "string" ? String((put as any).data).slice(0, 300) : JSON.stringify((put as any).data ?? {}).slice(0, 300)}`,
      endpoint: (put as any).path ?? null,
      http_status: put.status,
      entity_type: "call",
      entity_id: String(maestroCallId),
      correlation_id,
      payload: { maestro_call_id: maestroCallId, status: put.status, source, permalink, response: (put as any).data ?? null },
    });
  }


  if (!url) {
    await admin.from("planipret_phone_calls").update({
      metadata: { ...meta, maestro_media_pending: true, maestro_recording_last_poll_at: new Date().toISOString() },
    }).eq("id", call_id);
    await pipelineLog(admin, {
      call_id, user_id: userId, step: "recording_poll", status: "skipped",
      error_message: "media_not_ready",
      payload: { maestro_call_id: maestroCallId, status: res.status, ns_fallback: "unavailable" },
    });
    await admin.from("planipret_recording_uploads").upsert({
      call_id, user_id: userId, maestro_call_id: maestroCallId, status: "pending",
      error_message: "media_not_ready", updated_at: new Date().toISOString(),
    }, { onConflict: "call_id" }).then(() => {}, () => {});
    return json({ success: true, skipped: "media_not_ready", status: res.status });
  }


  await admin.from("planipret_phone_calls").update({
    recording_url: (call as any)?.recording_url ?? url,
    metadata: {
      ...meta,
      maestro_recording_url: url,
      maestro_recording_ready_at: new Date().toISOString(),
      maestro_recording_last_poll_at: new Date().toISOString(),
    },
  }).eq("id", call_id);

  await pipelineLog(admin, {
    call_id, user_id: userId, step: "recording_poll", status: "success",
    payload: { maestro_call_id: maestroCallId, recording_url: url },
  });
  await setPipelineStep(admin, call_id, "cdr", "done", { recording: "ready" }).catch(() => {});
  await admin.from("planipret_recording_uploads").upsert({
    call_id, user_id: userId, maestro_call_id: maestroCallId, status: "synced",
    error_message: null, updated_at: new Date().toISOString(),
  }, { onConflict: "call_id" }).then(() => {}, () => {});

  return json({ success: true, recording_url: url });
});
