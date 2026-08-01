// POST /functions/v1/maestro-media-poll
// Body: { call_id?: uuid, limit?: number, max_age_hours?: number }
//
// Maestro generates the recording + transcription server-side after a call is
// marked `ended`. There is no upload endpoint — we poll:
//   GET /api/v1/users/{brokerId}/calls/{callId}/recording
//   GET /api/v1/users/{brokerId}/calls/{callId}/transcription
// until the media is ready, then store it back on planipret_phone_calls.
import {
  adminClient,
  corsHeaders,
  getMaestroConfig,
  json,
  maestroFetch,
  pipelineLog,
  telecomAuth,
} from "../_shared/maestro.ts";

function pickUrl(d: any): string | null {
  if (!d) return null;
  return d.url ?? d.recording_url ?? d.download_url ?? d.media_url ?? d.file_url ?? null;
}
function pickTranscript(d: any): string | null {
  if (!d) return null;
  if (typeof d === "string") return d;
  const t = d.transcript ?? d.transcription ?? d.text ?? d.content ?? null;
  if (typeof t === "string" && t.trim()) return t;
  if (Array.isArray(d.segments)) {
    const s = d.segments.map((x: any) => `${x.speaker ? `${x.speaker}: ` : ""}${x.text ?? ""}`).join("\n").trim();
    return s || null;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const body = await req.json().catch(() => ({} as any));
  const admin = adminClient();
  const cfg = await getMaestroConfig(admin);
  if (!cfg.url || !cfg.key) return json({ success: false, error: "maestro_not_configured" });

  const maxAgeHours = Number(body?.max_age_hours ?? 48);
  const limit = Math.min(Number(body?.limit ?? 25), 100);

  let q = admin
    .from("planipret_phone_calls")
    .select("id, user_id, maestro_call_id, recording_url, transcript, metadata")
    .not("maestro_call_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (body?.call_id) q = q.eq("id", body.call_id);
  else q = q.gte("created_at", new Date(Date.now() - maxAgeHours * 3600_000).toISOString());

  const { data: calls } = await q;
  const results: any[] = [];

  for (const call of calls ?? []) {
    const meta = ((call as any).metadata ?? {}) as Record<string, any>;
    const needRecording = !meta.maestro_recording_url;
    const needTranscript = !call.transcript && !meta.maestro_transcript_ready;
    if (!body?.call_id && !needRecording && !needTranscript) continue;

    const auth = await telecomAuth(admin, call.user_id ?? "");
    if (!auth.brokerId) { results.push({ call_id: call.id, skipped: "no_broker_id" }); continue; }

    const base = `/api/v1/users/${encodeURIComponent(String(auth.brokerId))}/calls/${encodeURIComponent(String(call.maestro_call_id))}`;
    const patch: Record<string, unknown> = {};
    const nextMeta: Record<string, unknown> = { ...meta };
    let recordingReady = !needRecording;
    let transcriptReady = !needTranscript;

    if (needRecording) {
      const r = await maestroFetch(cfg, { method: "GET", path: `${base}/recording`, token: auth.token });
      const url = r.ok ? pickUrl(r.data) : null;
      if (url) {
        recordingReady = true;
        nextMeta.maestro_recording_url = url;
        nextMeta.maestro_recording_expires_at = (r.data as any)?.expires_at ?? null;
        if (!call.recording_url) patch.recording_url = url;
      }
      results.push({ call_id: call.id, recording: { ok: r.ok, status: r.status, ready: !!url } });
    }

    if (needTranscript) {
      const r = await maestroFetch(cfg, { method: "GET", path: `${base}/transcription`, token: auth.token });
      const text = r.ok ? pickTranscript(r.data) : null;
      if (text) {
        transcriptReady = true;
        nextMeta.maestro_transcript_ready = true;
        patch.transcript = text;
      }
      results.push({ call_id: call.id, transcription: { ok: r.ok, status: r.status, ready: !!text } });
    }

    nextMeta.maestro_media_pending = !(recordingReady && transcriptReady);
    nextMeta.maestro_media_last_poll_at = new Date().toISOString();
    patch.metadata = nextMeta;
    await admin.from("planipret_phone_calls").update(patch).eq("id", call.id);

    if (recordingReady || transcriptReady) {
      await pipelineLog(admin, {
        call_id: call.id, user_id: call.user_id, step: "maestro_media_poll",
        status: "success",
        payload: { recording: recordingReady, transcription: transcriptReady },
      });
      await admin.from("planipret_recording_uploads").upsert({
        call_id: call.id, user_id: call.user_id,
        status: recordingReady ? "synced" : "pending",
        updated_at: new Date().toISOString(),
      }, { onConflict: "call_id" }).then(() => {}, () => {});
    }
  }

  return json({ success: true, polled: (calls ?? []).length, results });
});
