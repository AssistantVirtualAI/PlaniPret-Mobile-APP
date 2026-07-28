// POST /functions/v1/maestro-recording-upload
// Body: { call_id: uuid, force?: boolean }
// Uploads the call audio file (multipart) to Maestro:
//   POST /api/v1/calls/{maestro_call_id}/recording
// Source of the bytes: `call-recordings` storage cache, else ns-get-recording.
import {
  adminClient,
  corsHeaders,
  getBrokerAuth,
  getMaestroConfig,
  json,
  maestroSyncLog,
  pipelineLog,
  setPipelineStep,
} from "../_shared/maestro.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function loadAudio(
  admin: ReturnType<typeof adminClient>,
  call: any,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  // 1. Storage cache
  if (call.recording_storage_path) {
    try {
      const { data, error } = await admin.storage
        .from("call-recordings")
        .download(call.recording_storage_path);
      if (!error && data) {
        const buf = new Uint8Array(await data.arrayBuffer());
        if (buf.byteLength > 0) {
          return { bytes: buf, contentType: data.type || "audio/mpeg" };
        }
      }
    } catch (_) { /* fall through */ }
  }

  // 2. NS proxy (also persists into the bucket for next time)
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ns-get-recording`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({
        call_db_id: call.id,
        ns_callid: call.ns_callid ?? call.ns_orig_callid ?? call.ns_term_callid ?? call.ns_call_id,
        ns_orig_callid: call.ns_orig_callid,
        ns_term_callid: call.ns_term_callid,
        ns_extension: call.extension,
      }),
    });
    const ct = res.headers.get("content-type") ?? "";
    if (res.ok && (ct.startsWith("audio") || ct.includes("octet-stream"))) {
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength > 0) return { bytes: buf, contentType: ct.split(";")[0] };
    }
  } catch (_) { /* fall through */ }

  // 3. Plain recording_url
  if (call.recording_url) {
    try {
      const res = await fetch(call.recording_url);
      if (res.ok) {
        const buf = new Uint8Array(await res.arrayBuffer());
        if (buf.byteLength > 0) {
          return { bytes: buf, contentType: res.headers.get("content-type") ?? "audio/mpeg" };
        }
      }
    } catch (_) { /* ignore */ }
  }

  return null;
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
      .select(
        "id, user_id, extension, ns_call_id, ns_callid, ns_orig_callid, ns_term_callid, maestro_call_id, recording_url, recording_storage_path, duration_seconds, metadata",
      )
      .eq("id", call_id)
      .maybeSingle();
    if (!call) return json({ success: false, error: "call_not_found" }, 404);

    const meta = (call.metadata ?? {}) as Record<string, unknown>;

    // --- Persistent dedup ledger, keyed by call id -------------------------
    const { data: ledger } = await admin
      .from("planipret_recording_uploads")
      .select("call_id, status, uploaded_at, bytes, media_id, maestro_call_id, updated_at")
      .eq("call_id", call_id)
      .maybeSingle();

    if (!force && ledger?.status === "uploaded") {
      return json({
        success: true,
        skipped: "already_uploaded",
        at: ledger.uploaded_at,
        bytes: ledger.bytes,
        maestro_call_id: ledger.maestro_call_id,
      });
    }
    // Another invocation is currently uploading the same call (< 5 min old)
    if (
      !force && ledger?.status === "uploading" &&
      Date.now() - new Date(ledger.updated_at as string).getTime() < 5 * 60_000
    ) {
      return json({ success: true, skipped: "upload_in_progress" });
    }
    if (!force && meta.maestro_recording_uploaded_at) {
      // Legacy marker: backfill the ledger then skip.
      await admin.from("planipret_recording_uploads").upsert({
        call_id,
        user_id: call.user_id,
        status: "uploaded",
        uploaded_at: meta.maestro_recording_uploaded_at as string,
        bytes: (meta.maestro_recording_bytes as number) ?? null,
        media_id: (meta.maestro_recording_media_id as string) ?? null,
      }, { onConflict: "call_id" });
      return json({ success: true, skipped: "already_uploaded", at: meta.maestro_recording_uploaded_at });
    }

    // Claim the upload slot (atomic on the unique call_id constraint).
    await admin.from("planipret_recording_uploads").upsert({
      call_id,
      user_id: call.user_id,
      status: "uploading",
      error_message: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "call_id" });


    const cfg = await getMaestroConfig(admin);
    if (!cfg.url || !cfg.key) return json({ success: false, error: "maestro_not_configured" }, 200);

    await setPipelineStep(admin, call_id, "recording" as any, "running");
    await pipelineLog(admin, { call_id, user_id: call.user_id, step: "recording_upload", status: "started" });

    const t0 = Date.now();
    const audio = await loadAudio(admin, call);
    if (!audio) {
      await setPipelineStep(admin, call_id, "recording" as any, "error", { reason: "no_audio" });
      await pipelineLog(admin, {
        call_id, user_id: call.user_id, step: "recording_upload", status: "skipped",
        duration_ms: Date.now() - t0, payload: { reason: "no_audio_available" },
      });
      await admin.from("planipret_recording_uploads").upsert({
        call_id, user_id: call.user_id, status: "failed",
        error_message: "no_audio_available", updated_at: new Date().toISOString(),
      }, { onConflict: "call_id" });
      return json({ success: false, error: "no_audio_available" }, 200);
    }

    const auth = await getBrokerAuth(admin, call.user_id);
    const mId = call.maestro_call_id ?? call.ns_call_id ?? call.id;
    const ext = audio.contentType.includes("wav") ? "wav" : "mp3";

    const form = new FormData();
    form.append("file", new Blob([audio.bytes], { type: audio.contentType }), `call-${mId}.${ext}`);
    form.append("call_id", String(mId));
    if (call.duration_seconds != null) form.append("duration_sec", String(call.duration_seconds));

    const relPath = `/api/v1/calls/${encodeURIComponent(String(mId))}/recording`;
    const scoped = auth.brokerId
      ? `/api/v1/users/${encodeURIComponent(String(auth.brokerId))}/calls/${encodeURIComponent(String(mId))}/recording`
      : relPath;
    const headers: Record<string, string> = { Authorization: `Bearer ${auth.token}` };
    if (cfg.accountId) headers["X-Account-Id"] = cfg.accountId;
    if (auth.brokerId) headers["X-Broker-Id"] = String(auth.brokerId);

    const machineSuffix = auth.usingFallback ? `${scoped.includes("?") ? "&" : "?"}machine=1` : "";
    let endpoint = `${cfg.url}${scoped}${machineSuffix}`;
    let res = await fetch(endpoint, { method: "POST", headers, body: form });
    if (!res.ok && (res.status === 404 || res.status === 405) && scoped !== relPath) {
      const relMachineSuffix = auth.usingFallback ? `${relPath.includes("?") ? "&" : "?"}machine=1` : "";
      endpoint = `${cfg.url}${relPath}${relMachineSuffix}`;
      res = await fetch(endpoint, { method: "POST", headers, body: form });
    }

    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 500) }; }
    const ms = Date.now() - t0;

    await maestroSyncLog(admin, {
      user_id: call.user_id,
      action: "recording_upload",
      endpoint,
      request_body: { bytes: audio.bytes.byteLength, content_type: audio.contentType },
      response_status: res.status,
      response_body: data,
      duration_ms: ms,
      success: res.ok,
    });

    if (!res.ok) {
      console.error(`maestro recording upload failed [${res.status}]: ${text.slice(0, 500)}`);
      await setPipelineStep(admin, call_id, "recording" as any, "error", { status: res.status });
      await pipelineLog(admin, {
        call_id, user_id: call.user_id, step: "recording_upload", status: "error",
        duration_ms: ms, error_message: `status_${res.status}`,
      });
      await admin.from("planipret_recording_uploads").upsert({
        call_id, user_id: call.user_id, status: "failed",
        error_message: `status_${res.status}`, updated_at: new Date().toISOString(),
      }, { onConflict: "call_id" });
      return json({ success: false, status: res.status, details: data }, 200);
    }

    await admin
      .from("planipret_phone_calls")
      .update({
        metadata: {
          ...meta,
          maestro_recording_uploaded_at: new Date().toISOString(),
          maestro_recording_bytes: audio.bytes.byteLength,
          maestro_recording_media_id: data?.id ?? data?.media_id ?? null,
        },
      })
      .eq("id", call_id);

    await admin.from("planipret_recording_uploads").upsert({
      call_id,
      user_id: call.user_id,
      status: "uploaded",
      maestro_call_id: String(mId),
      bytes: audio.bytes.byteLength,
      media_id: data?.id ?? data?.media_id ?? null,
      uploaded_at: new Date().toISOString(),
      error_message: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "call_id" });

    await setPipelineStep(admin, call_id, "recording" as any, "done", { bytes: audio.bytes.byteLength });
    await pipelineLog(admin, {
      call_id, user_id: call.user_id, step: "recording_upload", status: "success",
      duration_ms: ms, payload: { bytes: audio.bytes.byteLength },
    });

    return json({ success: true, bytes: audio.bytes.byteLength, maestro_call_id: mId });
  } catch (e: any) {
    console.error("maestro-recording-upload error", e);
    return json({ success: false, error: e?.message ?? "server_error" }, 500);
  }
});
