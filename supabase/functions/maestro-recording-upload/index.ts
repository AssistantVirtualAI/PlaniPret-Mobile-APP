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

function pickUrl(d: any): string | null {
  if (!d) return null;
  if (typeof d === "string") return d.startsWith("http") ? d : null;
  return d.recording_url ?? d.url ?? d.download_url ?? d.media_url ?? d.file_url ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const { call_id } = await req.json().catch(() => ({} as any));
  if (!call_id) return json({ success: false, error: "call_id_required" }, 400);

  const admin = adminClient();
  const { data: call } = await admin
    .from("planipret_phone_calls")
    .select("id, user_id, maestro_call_id, recording_url, metadata")
    .eq("id", call_id)
    .maybeSingle();

  const userId = call?.user_id ?? null;
  const maestroCallId = (call as any)?.maestro_call_id ?? null;

  if (!maestroCallId) {
    await pipelineLog(admin, {
      call_id, user_id: userId, step: "recording_poll", status: "skipped",
      error_message: "maestro_call_id_missing",
    });
    await admin.from("planipret_recording_uploads").upsert({
      call_id, user_id: userId, status: "skipped",
      error_message: "maestro_call_id_missing", updated_at: new Date().toISOString(),
    }, { onConflict: "call_id" }).then(() => {}, () => {});
    return json({ success: false, error: "maestro_call_id_missing" });
  }

  const cfg = await getMaestroConfig(admin);
  const auth = await telecomAuth(admin, userId ?? "");
  if (!cfg.url || !cfg.key || !auth.brokerId) {
    return json({ success: false, error: !auth.brokerId ? "maestro_broker_id_missing" : "maestro_not_configured" });
  }

  const res = await maestroFetch(cfg, {
    method: "GET",
    path: `/api/v1/users/${encodeURIComponent(String(auth.brokerId))}/calls/${encodeURIComponent(String(maestroCallId))}/recording`,
    token: auth.token,
  });
  const url = res.ok ? pickUrl(res.data) : null;
  const meta = ((call as any)?.metadata ?? {}) as Record<string, unknown>;

  if (!url) {
    await admin.from("planipret_phone_calls").update({
      metadata: { ...meta, maestro_media_pending: true, maestro_recording_last_poll_at: new Date().toISOString() },
    }).eq("id", call_id);
    await pipelineLog(admin, {
      call_id, user_id: userId, step: "recording_poll", status: "skipped",
      error_message: "media_not_ready",
      payload: { maestro_call_id: maestroCallId, status: res.status },
    });
    await admin.from("planipret_recording_uploads").upsert({
      call_id, user_id: userId, status: "pending",
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
    call_id, user_id: userId, status: "synced",
    error_message: null, updated_at: new Date().toISOString(),
  }, { onConflict: "call_id" }).then(() => {}, () => {});

  return json({ success: true, recording_url: url });
});
