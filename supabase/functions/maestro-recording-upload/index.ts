// POST /functions/v1/maestro-recording-upload
// Body: { call_id: uuid, force?: boolean }
//
// NOTE: The Maestro Telecom API is READ-ONLY for recordings.
// There is no POST/PUT endpoint to upload audio files — only GET to retrieve
// the recording URL that Maestro already has from its own telephony system.
// This function now skips gracefully instead of looping with 404 errors.
//
// The recording URL from NS-API is stored on the call row (recording_url)
// and passed to Maestro via the CDR push (POST /users/{id}/calls).
import {
  adminClient,
  corsHeaders,
  json,
  pipelineLog,
  setPipelineStep,
} from "../_shared/maestro.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const { call_id } = await req.json().catch(() => ({}));
    if (!call_id) return json({ success: false, error: "call_id_required" }, 400);

    const admin = adminClient();
    const { data: call } = await admin
      .from("planipret_phone_calls")
      .select("id, user_id, recording_url, recording_storage_path")
      .eq("id", call_id)
      .maybeSingle();
    if (!call) return json({ success: false, error: "call_not_found" }, 404);

    // The Maestro Telecom API does not expose a recording upload endpoint.
    // Recording URLs are already sent to Maestro as part of the CDR push
    // (recording_url field in POST /users/{brokerId}/calls).
    // We mark the pipeline step as done and return a clean skip.
    await setPipelineStep(admin, call_id, "recording" as any, "done", {
      reason: "no_upload_endpoint",
      recording_url: call.recording_url ?? null,
    });
    await pipelineLog(admin, {
      call_id,
      user_id: call.user_id,
      step: "recording_upload",
      status: "skipped",
      payload: {
        reason: "maestro_api_read_only",
        recording_url_present: !!call.recording_url,
        storage_path_present: !!call.recording_storage_path,
      },
    });

    return json({
      success: true,
      skipped: "no_upload_endpoint",
      reason: "Maestro Telecom API is read-only for recordings. The recording_url is sent via CDR push.",
      recording_url: call.recording_url ?? null,
    });
  } catch (e: any) {
    console.error("maestro-recording-upload error", e);
    return json({ success: false, error: e?.message ?? "server_error" }, 500);
  }
});
