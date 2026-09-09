// Probe: does Maestro expose an endpoint to HOST the call recording media?
// Body: { call_id: uuid, dry?: boolean }
import { adminClient, corsHeaders, getMaestroConfig, json, telecomAuth } from "../_shared/maestro.ts";
import { recordingPermalink } from "../_shared/recording-link.ts";

let MAX_BODY = 300;

async function raw(cfg: any, opts: { method: string; path: string; token: string; body?: BodyInit; headers?: Record<string, string> }) {
  const url = `${cfg.url}${opts.path}${opts.path.includes("?") ? "&" : "?"}machine=1`;
  try {
    const res = await fetch(url, {
      method: opts.method,
      headers: { Authorization: `Bearer ${opts.token}`, Accept: "application/json", ...(opts.headers ?? {}) },
      body: opts.body,
    });
    const text = await res.text();
    return { path: opts.path, method: opts.method, status: res.status, ok: res.ok, body: text.slice(0, MAX_BODY) };
  } catch (e) {
    return { path: opts.path, method: opts.method, status: 0, ok: false, body: String((e as Error).message) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const { call_id, paths, play, max_body, s3, peek } = await req.json().catch(() => ({} as any));
  if (max_body) MAX_BODY = Math.min(Number(max_body), 20000);
  const admin = adminClient();

  if (play) {
    const link = await recordingPermalink(String(call_id));
    const h = await fetch(link, { headers: { Range: "bytes=0-1023" } });
    return json({
      link,
      status: h.status,
      contentType: h.headers.get("content-type"),
      contentRange: h.headers.get("content-range"),
      acceptRanges: h.headers.get("accept-ranges"),
      cors: h.headers.get("access-control-allow-origin"),
      bytes: (await h.arrayBuffer()).byteLength,
    });
  }

  const { data: call } = await admin
    .from("planipret_phone_calls")
    .select("id, user_id, maestro_call_id, recording_url, ns_recording_url, recording_storage_path")
    .eq("id", call_id)
    .maybeSingle();
  if (!call?.maestro_call_id) return json({ error: "no_maestro_call_id", call });

  const cfg = await getMaestroConfig(admin);
  const auth = await telecomAuth(admin, call.user_id, false);
  const base = `/api/v1/users/${auth.brokerId}/calls/${call.maestro_call_id}`;

  // 1. Fetch the audio bytes from NetSapiens / storage.
  let bytes: Uint8Array | null = null;
  let audioErr: string | null = null;
  try {
    const nsRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ns-get-recording`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
      body: JSON.stringify({ call_db_id: call_id, prefer_url: true }),
    });
    const ns = await nsRes.json().catch(() => ({} as any));
    const src = ns?.url ?? ns?.recording_url ?? call.recording_url ?? call.ns_recording_url;
    if (src) {
      const a = await fetch(src);
      if (a.ok) bytes = new Uint8Array(await a.arrayBuffer());
      else audioErr = `audio_${a.status}`;
    } else audioErr = "no_audio_url";
  } catch (e) { audioErr = String((e as Error).message); }

  const results: unknown[] = [];

  if (peek) {
    const lr = await fetch(`${cfg.url}/api/v1/users/${auth.brokerId}/calls?limit=40&machine=1`, {
      headers: { Authorization: `Bearer ${auth.token}`, Accept: "application/json" },
    });
    const arr = await lr.json().catch(() => []);
    const row = (arr as any[]).find?.((c) => c.id === call.maestro_call_id);
    return json({
      found: !!row,
      transcript_head: String(row?.transcript ?? "").slice(0, 300),
      ai_summary_head: String(row?.ai_summary ?? "").slice(0, 200),
      notes_head: String(row?.notes ?? "").slice(0, 200),
      call_recording_filename: row?.call_recording_filename ?? null,
      saving_call_recording: row?.saving_call_recording,
      saving_call_transcript: row?.saving_call_transcript,
    });
  }

  // S3 mode: set a plain filename, read back the presigned URL, try to PUT the bytes there.

  if (s3) {
    const filename = `${call.maestro_call_id}.wav`;
    const put = await raw(cfg, {
      method: "PUT",
      path: base,
      token: auth.token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_recording_filename: filename, saving_call_recording: 1 }),
    });
    results.push(put);
    let signed: string | null = null;
    try {
      const lr = await fetch(`${cfg.url}/api/v1/users/${auth.brokerId}/calls?limit=40&machine=1`, {
        headers: { Authorization: `Bearer ${auth.token}`, Accept: "application/json" },
      });
      const arr = await lr.json();
      const row = (arr as any[]).find((c) => c.id === call.maestro_call_id);
      signed = row?.call_recording_url ?? null;
    } catch (e) { results.push({ step: "list_err", error: String((e as Error).message) }); }

    results.push({ step: "signed", signed: signed ? signed.split("?")[0] : null, has: !!signed });
    if (signed && bytes) {
      const up = await fetch(signed, { method: "PUT", headers: { "Content-Type": "audio/wav" }, body: bytes });
      const upText = (await up.text()).slice(0, 400);
      results.push({ step: "s3_put", status: up.status, ok: up.ok, body: upText });
      const check = await fetch(signed, { method: "GET", headers: { Range: "bytes=0-99" } });
      results.push({ step: "s3_get", status: check.status, len: (await check.arrayBuffer()).byteLength });
    }
    return json({ call_id, maestro_call_id: call.maestro_call_id, broker: auth.brokerId, audio: bytes?.length ?? null, audioErr, results });
  }



  // 2. Discovery: which routes even exist?
  for (const p of (paths as string[] | undefined) ?? [
    `${base}/recording`,
    `${base}/recordings`,
    `${base}/recording/upload`,
    `${base}/recording/upload-url`,
    `${base}/recording/presigned`,
    `/api/v1/users/${auth.brokerId}/recordings`,
    `/api/v1/users/${auth.brokerId}/call-recordings`,
  ]) {
    const p2 = p.replace("{b}", String(auth.brokerId)).replace("{c}", String(call.maestro_call_id));
    for (const m of (paths ? ["GET"] : ["GET", "POST"])) results.push(await raw(cfg, { method: m, path: p2, token: auth.token }));
  }

  // 3. Real upload attempts (multipart + base64 JSON) when we have audio.
  if (bytes && !paths) {
    const blob = new Blob([bytes], { type: "audio/wav" });
    const filename = `${call.maestro_call_id}.wav`;
    for (const [p, field] of [
      [`${base}/recording`, "file"],
      [`${base}/recordings`, "file"],
      [`${base}/recording/upload`, "file"],
      [`/api/v1/users/${auth.brokerId}/recordings`, "file"],
    ] as const) {
      const fd = new FormData();
      fd.append(field, blob, filename);
      fd.append("call_id", String(call.maestro_call_id));
      results.push(await raw(cfg, { method: "POST", path: p, token: auth.token, body: fd }));
    }
    const b64 = btoa(String.fromCharCode(...bytes.slice(0, 1)));
    results.push(await raw(cfg, {
      method: "POST",
      path: `${base}/recording`,
      token: auth.token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, encoding: "base64", base64_file: b64 }),
    }));
  }

  return json({ call_id, maestro_call_id: call.maestro_call_id, broker: auth.brokerId, audio: bytes ? bytes.length : null, audioErr, results });
});
