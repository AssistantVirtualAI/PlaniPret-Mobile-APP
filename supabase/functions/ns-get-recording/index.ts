// ns-get-recording — official NS-API v2 recording fetch (Bearer NS_API_KEY).
// Accepts { call_db_id?, ns_callid?, ns_extension? } — resolves missing fields from DB.
// Important: recordings are keyed by NS call-id values (orig/term/parent call-id),
// not always by CDR id. We hydrate those IDs from the CDR row before probing.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore npm package has no bundled TS declarations.
import GSMDecoder from "npm:gsm-decoder@1.0.0";

const FALLBACK_NS_API_BASE_URL = (Deno.env.get("NS_API_BASE_URL") ?? "https://voice.ava-telecom.ca/ns-api/v2").replace(/\/$/, "");
const FALLBACK_NS_DOMAIN = Deno.env.get("NS_DEFAULT_DOMAIN") ?? Deno.env.get("NS_API_DOMAIN") ?? "planipret.ca";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (payload: any, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const unavailable = (reason: string, payload: Record<string, unknown> = {}) => json({
  success: false,
  available: false,
  reason,
  ...payload,
}, 200);

function pickAudioUrl(j: any): string | null {
  if (!j) return null;
  const first = Array.isArray(j) ? j[0] : j;
  const cand = first?.["file-access-url"] ?? first?.file_access_url ?? first?.url ?? first?.["recording-url"] ?? first?.recording_url
    ?? first?.["media-url"] ?? first?.["file"] ?? first?.["download-url"] ?? first?.recording ?? null;
  return typeof cand === "string" ? cand : null;
}

const val = (raw: any, keys: string[], fb: any = null) => {
  for (const k of keys) {
    const v = raw?.[k];
    if (v !== undefined && v !== null && `${v}` !== "") return v;
  }
  return fb;
};

function normalizePhone(v: unknown): string {
  return String(v ?? "").replace(/^sip:/i, "").split("@")[0].replace(/\D/g, "");
}

function pushId(out: string[], raw: unknown) {
  const value = String(raw ?? "").trim();
  if (!value || value === "null" || value === "undefined") return;
  if (value.includes("sip:") || value.split(":").length > 3) return;
  if (!out.includes(value)) out.push(value);
}

function addIds(out: string[], ...sources: any[]) {
  const keys = [
    "call-orig-call-id", "orig-callid", "orig-call-id", "orig_callid",
    "call-term-call-id", "term-callid", "term-call-id", "term_callid",
    "call-through-call-id", "by-callid", "by_callid",
    "call-parent-call-id", "call-id", "call_id", "callid",
    "call-parent-cdr-id", "cdr_id", "cdr-id", "id", "uuid",
  ];
  for (const source of sources) {
    if (!source) continue;
    for (const k of keys) pushId(out, source[k]);
  }
}

function normalizeNsPath(path: unknown): string | null {
  const s = String(path ?? "").trim();
  if (!s) return null;
  if (s.startsWith("http")) {
    try {
      const u = new URL(s);
      const idx = u.pathname.indexOf("/ns-api/v2");
      return `${idx >= 0 ? u.pathname.slice(idx + "/ns-api/v2".length) : u.pathname}${u.search}`;
    } catch { return s; }
  }
  return s.replace(/^\/?ns-api\/v2/i, "");
}

function addIdsFromPath(out: string[], path: unknown) {
  const p = normalizeNsPath(path);
  if (!p) return;
  try {
    const u = new URL(`https://ns.local${p.startsWith("/") ? p : `/${p}`}`);
    ["orig_callid", "term_callid", "callid", "call-id"].forEach((k) => pushId(out, u.searchParams.get(k)));
  } catch { /* ignore */ }
}

async function nsJson(path: string) {
  const cfg = await getNsRuntimeConfig();
  const r = await fetch(`${cfg.baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}`, Accept: "application/json" },
  });
  const text = await r.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: r.ok, status: r.status, ct: r.headers.get("Content-Type") ?? "", data, text };
}

async function getNsRuntimeConfig() {
  let configData: Record<string, string> = {};
  let secretData: Record<string, string> = {};
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const [{ data: cfg }, { data: secrets }] = await Promise.all([
      admin.from("planipret_integration_config").select("config_data").eq("integration_key", "ns_api").maybeSingle(),
      admin.from("planipret_integration_secrets").select("provider, config").in("provider", ["nsapi", "ns_api"]).limit(2),
    ]);
    configData = (cfg?.config_data ?? {}) as Record<string, string>;
    secretData = (((secrets ?? [])[0] as any)?.config ?? {}) as Record<string, string>;
  } catch { /* env fallback */ }
  const baseUrl = (configData.base_url ?? secretData.base_url ?? FALLBACK_NS_API_BASE_URL).replace(/\/$/, "").replace(/\/ns-api(\/v2)?$/, "") + "/ns-api/v2";
  const apiKey = configData.api_key ?? secretData.api_key ?? Deno.env.get("NS_API_KEY") ?? "";
  if (!apiKey) throw new Error("NS_API_KEY not configured");
  return {
    baseUrl,
    apiKey,
    domain: configData.domain ?? configData.default_domain ?? secretData.domain ?? secretData.default_domain ?? FALLBACK_NS_DOMAIN,
  };
}

function asArray(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  for (const k of ["data", "cdrs", "items", "results", "recordings"]) {
    if (Array.isArray(data[k])) return data[k];
  }
  return [data];
}

function cdrScore(c: any, row: any, knownIds: string[]) {
  let score = 0;
  const cIds: string[] = [];
  addIds(cIds, c);
  if (knownIds.some((id) => cIds.includes(id))) score += 100;
  const ext = String(row?.extension ?? "").trim();
  if (ext && ["call-orig-user", "call-term-user", "call-through-user", "orig-user", "term-user", "user"].some((k) => String(c?.[k] ?? "") === ext)) score += 20;
  const dur = Number(row?.duration_seconds ?? 0);
  const cDur = Number(val(c, ["call-talking-duration-seconds", "call-total-duration-seconds", "duration", "billsec"], 0));
  if (dur && cDur && Math.abs(dur - cDur) <= 3) score += 20;
  const started = row?.started_at ? new Date(row.started_at).getTime() : 0;
  const cStartRaw = val(c, ["call-start-datetime", "call-batch-start-datetime", "start-time", "time-start", "started_at"], null);
  const cStart = cStartRaw ? new Date(cStartRaw).getTime() : 0;
  if (started && cStart && Math.abs(started - cStart) <= 120_000) score += 20;
  const from = normalizePhone(row?.from_number);
  const to = normalizePhone(row?.to_number);
  const cFrom = normalizePhone(val(c, ["call-orig-from-uri", "orig-from-uri", "from", "from_number", "caller_id_number"], ""));
  const cTo = normalizePhone(val(c, ["call-term-to-uri", "call-orig-to-uri", "to", "to_number", "destination"], ""));
  if (from && cFrom && (from.endsWith(cFrom) || cFrom.endsWith(from))) score += 10;
  if (to && cTo && (to.endsWith(cTo) || cTo.endsWith(to))) score += 10;
  return score;
}

async function hydrateCdrs(row: any, domain: string, ids: string[], attempts: any[]) {
  if (!row) return [];
  const D = encodeURIComponent(domain);
  const paths: string[] = [];
  for (const id of ids.slice(0, 4)) {
    paths.push(`/domains/${D}/cdrs/${encodeURIComponent(id)}`);
    paths.push(`/domains/${D}/cdrs?id=${encodeURIComponent(id)}`);
  }
  if (row.started_at) {
    const start = new Date(new Date(row.started_at).getTime() - 180_000).toISOString();
    const end = new Date(new Date(row.started_at).getTime() + (Number(row.duration_seconds ?? 0) + 180) * 1000).toISOString();
    const qs = `datetime-start=${encodeURIComponent(start)}&datetime-end=${encodeURIComponent(end)}&limit=200`;
    const legacy = `start-time=${encodeURIComponent(start)}&end-time=${encodeURIComponent(end)}&limit=200`;
    paths.push(`/domains/${D}/cdrs?${qs}`, `/domains/${D}/cdrs?${legacy}`);
    if (row.extension) paths.push(`/domains/${D}/users/${encodeURIComponent(row.extension)}/cdrs?${qs}`);
  }
  const matches: any[] = [];
  for (const p of Array.from(new Set(paths))) {
    try {
      const r = await nsJson(p);
      attempts.push({ url: p, status: r.status, ct: r.ct, kind: "cdr_lookup" });
      if (!r.ok) continue;
      for (const c of asArray(r.data)) {
        const score = cdrScore(c, row, ids);
        if (score >= 30) matches.push({ score, cdr: c, path: p });
      }
    } catch (e) {
      attempts.push({ url: p, error: (e as Error).message, kind: "cdr_lookup" });
    }
  }
  return matches.sort((a, b) => b.score - a.score).slice(0, 5);
}

function recordingHeaders(upstream: Response, meta: any, extra: Record<string, string | null | undefined> = {}) {
  const ct = upstream.headers.get("Content-Type") ?? "audio/mpeg";
  const h: Record<string, string> = {
    ...corsHeaders,
    "Content-Type": ct.includes("audio") || ct.includes("octet-stream") ? ct : "audio/mpeg",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  };
  const len = upstream.headers.get("Content-Length");
  if (len) h["Content-Length"] = len;
  const duration = meta?.["file-duration-seconds"] ?? meta?.duration_sec ?? meta?.duration;
  const size = meta?.["file-size-kilobytes"] ?? meta?.file_size_kb;
  const status = meta?.["call-recording-status"] ?? meta?.recording_status;
  if (duration != null) h["X-NS-Duration-Seconds"] = String(duration);
  if (size != null) h["X-NS-File-Size-KB"] = String(size);
  if (status != null) h["X-NS-Recording-Status"] = String(status);
  for (const [k, v] of Object.entries(extra)) if (v != null) h[k] = String(v);
  return h;
}

// Persist recording bytes to the "call-recordings" bucket and remember the
// path on the phone_calls row so subsequent playbacks are instant.
async function persistRecording(callDbId: string | null, bytes: Uint8Array, contentType: string) {
  if (!callDbId || !bytes?.byteLength) return null;
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: row } = await admin
      .from("planipret_phone_calls")
      .select("user_id, recording_storage_path")
      .eq("id", callDbId)
      .maybeSingle();
    if (row?.recording_storage_path) return row.recording_storage_path;
    const userId = row?.user_id ?? "unknown";
    const ext = contentType.includes("mpeg") || contentType.includes("mp3") ? "mp3" : contentType.includes("wav") ? "wav" : "audio";
    const path = `${userId}/${callDbId}.${ext}`;
    const up = await admin.storage.from("call-recordings").upload(path, bytes, {
      contentType: contentType.startsWith("audio/") ? contentType : "audio/mpeg",
      upsert: true,
    });
    if (up.error) return null;
    await admin
      .from("planipret_phone_calls")
      .update({
        recording_storage_path: path,
        recording_cached_at: new Date().toISOString(),
        recording_bytes: bytes.byteLength,
      })
      .eq("id", callDbId);
    return path;
  } catch (_) {
    return null;
  }
}

async function signCachedUrl(path: string) {
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data } = await admin.storage.from("call-recordings").createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  } catch { return null; }
}

function readWavChunks(bytes: Uint8Array) {
  if (bytes.length < 44 || String.fromCharCode(...bytes.slice(0, 4)) !== "RIFF" || String.fromCharCode(...bytes.slice(8, 12)) !== "WAVE") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 12;
  let fmt: { offset: number; size: number } | null = null;
  let data: { offset: number; size: number } | null = null;
  while (p + 8 <= bytes.length) {
    const id = String.fromCharCode(bytes[p], bytes[p + 1], bytes[p + 2], bytes[p + 3]);
    const size = view.getUint32(p + 4, true);
    const offset = p + 8;
    if (id === "fmt ") fmt = { offset, size };
    if (id === "data") { data = { offset, size: Math.min(size, bytes.length - offset) }; break; }
    p = offset + size + (size % 2);
  }
  return fmt && data ? { fmt, data } : null;
}

function unpackWav49Block(c: Uint8Array, off: number): number[][] {
  let i = off;
  let sr: number;
  const frames = [Array(76).fill(0), Array(76).fill(0)];
  let p = frames[0];
  let pi = 0;

  sr = c[i++]; p[pi++] = sr & 0x3f; sr >>= 6; sr |= c[i++] << 2; p[pi++] = sr & 0x3f; sr >>= 6; sr |= c[i++] << 4; p[pi++] = sr & 0x1f; sr >>= 5; p[pi++] = sr & 0x1f; sr >>= 5; sr |= c[i++] << 2; p[pi++] = sr & 0x0f; sr >>= 4; p[pi++] = sr & 0x0f; sr >>= 4; sr |= c[i++] << 2; p[pi++] = sr & 0x07; sr >>= 3; p[pi++] = sr & 0x07; sr >>= 3;
  for (let f = 0; f < 4; f++) {
    sr |= c[i++] << 4; p[pi++] = sr & 0x7f; sr >>= 7; p[pi++] = sr & 0x03; sr >>= 2; p[pi++] = sr & 0x03; sr >>= 2; sr |= c[i++] << 1; p[pi++] = sr & 0x3f; sr >>= 6; p[pi++] = sr & 0x07;
    sr = c[i++]; p[pi++] = sr & 0x07; sr >>= 3; p[pi++] = sr & 0x07; sr >>= 3; sr |= c[i++] << 2; p[pi++] = sr & 0x07; sr >>= 3; p[pi++] = sr & 0x07; sr >>= 3; p[pi++] = sr & 0x07; sr >>= 3; sr |= c[i++] << 1; p[pi++] = sr & 0x07; sr >>= 3; p[pi++] = sr & 0x07; sr >>= 3; p[pi++] = sr & 0x07;
    sr = c[i++]; p[pi++] = sr & 0x07; sr >>= 3; p[pi++] = sr & 0x07; sr >>= 3; sr |= c[i++] << 2; p[pi++] = sr & 0x07; sr >>= 3; p[pi++] = sr & 0x07; sr >>= 3;
  }

  p = frames[1]; pi = 0;
  sr |= c[i++] << 4; p[pi++] = sr & 0x3f; sr >>= 6; p[pi++] = sr & 0x3f; sr = c[i++]; p[pi++] = sr & 0x1f; sr >>= 5; sr |= c[i++] << 3; p[pi++] = sr & 0x1f; sr >>= 5; p[pi++] = sr & 0x0f; sr >>= 4; sr |= c[i++] << 2; p[pi++] = sr & 0x0f; sr >>= 4; p[pi++] = sr & 0x07; sr >>= 3; p[pi++] = sr & 0x07;
  for (let f = 0; f < 4; f++) {
    sr = c[i++]; p[pi++] = sr & 0x7f; sr >>= 7; sr |= c[i++] << 1; p[pi++] = sr & 0x03; sr >>= 2; p[pi++] = sr & 0x03; sr >>= 2; sr |= c[i++] << 5; p[pi++] = sr & 0x3f; sr >>= 6; p[pi++] = sr & 0x07; sr >>= 3; p[pi++] = sr & 0x07; sr >>= 3; sr |= c[i++] << 1; p[pi++] = sr & 0x07; sr >>= 3; p[pi++] = sr & 0x07; sr >>= 3; p[pi++] = sr & 0x07;
    sr = c[i++]; p[pi++] = sr & 0x07; sr >>= 3; p[pi++] = sr & 0x07; sr >>= 3; sr |= c[i++] << 2; p[pi++] = sr & 0x07; sr >>= 3; p[pi++] = sr & 0x07; sr >>= 3; p[pi++] = sr & 0x07; sr >>= 3; sr |= c[i++] << 1; p[pi++] = sr & 0x07; sr >>= 3; p[pi++] = sr & 0x07; sr >>= 3; p[pi++] = sr & 0x07;
  }
  return frames;
}

function packVoipFrame(p: number[]) {
  const b = new Uint8Array(33);
  b[0] = 0xd0 | (p[0] >> 2);
  b[1] = ((p[0] & 3) << 6) | p[1];
  b[2] = (p[2] << 3) | (p[3] >> 2);
  b[3] = ((p[3] & 3) << 6) | (p[4] << 2) | (p[5] >> 2);
  b[4] = ((p[5] & 3) << 6) | (p[6] << 3) | p[7];
  let bi = 5;
  let pi = 8;
  for (let f = 0; f < 4; f++) {
    const nc = p[pi++], bc = p[pi++], mc = p[pi++], xm = p[pi++];
    const x = Array.from({ length: 13 }, () => p[pi++]);
    b[bi++] = (nc << 1) | (bc >> 1);
    b[bi++] = ((bc & 1) << 7) | (mc << 5) | (xm >> 1);
    b[bi++] = ((xm & 1) << 7) | (x[0] << 4) | (x[1] << 1) | (x[2] >> 2);
    b[bi++] = ((x[2] & 3) << 6) | (x[3] << 3) | x[4];
    b[bi++] = (x[5] << 5) | (x[6] << 2) | (x[7] >> 1);
    b[bi++] = ((x[7] & 1) << 7) | (x[8] << 4) | (x[9] << 1) | (x[10] >> 2);
    b[bi++] = ((x[10] & 3) << 6) | (x[11] << 3) | x[12];
  }
  return b;
}

function writePcmWav(pcm: Uint8Array, sampleRate: number) {
  const out = new Uint8Array(44 + pcm.length);
  const view = new DataView(out.buffer);
  const put = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i); };
  put(0, "RIFF"); view.setUint32(4, 36 + pcm.length, true); put(8, "WAVE"); put(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); put(36, "data"); view.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

function convertMsGsmWavToPcm(bytes: Uint8Array) {
  const chunks = readWavChunks(bytes);
  if (!chunks) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const format = view.getUint16(chunks.fmt.offset, true);
  if (format !== 0x31) return null;
  const sampleRate = view.getUint32(chunks.fmt.offset + 4, true) || 8000;
  const blockAlign = view.getUint16(chunks.fmt.offset + 12, true) || 65;
  if (blockAlign < 65) return null;
  const blocks = Math.floor(chunks.data.size / blockAlign);
  const pcm = new Uint8Array(blocks * 640);
  const decoder = new GSMDecoder();
  decoder.decoderInit();
  let outOffset = 0;
  for (let b = 0; b < blocks; b++) {
    const frames = unpackWav49Block(bytes, chunks.data.offset + b * blockAlign);
    for (const params of frames) {
      const frame = packVoipFrame(params);
      const framePcm = new Uint8Array(320);
      if (decoder.decodeFrame(frame, 0, framePcm, 0)) {
        pcm.set(framePcm, outOffset);
        outOffset += 320;
      }
    }
  }
  return writePcmWav(pcm.slice(0, outOffset), sampleRate);
}

async function audioResponse(
  upstream: Response,
  meta: any,
  extra: Record<string, string | null | undefined> = {},
  opts: { callDbId?: string | null; preferUrl?: boolean } = {},
) {
  const input = new Uint8Array(await upstream.arrayBuffer());
  const converted = convertMsGsmWavToPcm(input);
  const body = converted ?? input;
  const contentType = converted ? "audio/wav" : (upstream.headers.get("Content-Type") ?? "audio/mpeg");

  // Cache to storage. Await when the caller wants a URL, otherwise fire-and-forget.
  if (opts.preferUrl && opts.callDbId) {
    const path = await persistRecording(opts.callDbId, body, contentType);
    if (path) {
      const url = await signCachedUrl(path);
      if (url) return json({ success: true, available: true, reason: "cached", url, recording_url: url, cached: true, path, content_type: contentType, bytes: body.byteLength });
    }
  } else if (opts.callDbId) {
    try { (globalThis as any).EdgeRuntime?.waitUntil?.(persistRecording(opts.callDbId, body, contentType)); }
    catch { /* best-effort */ }
  }

  const headers = recordingHeaders(upstream, meta, {
    ...extra,
    "Content-Type": contentType,
    "Content-Length": String(body.byteLength),
    "X-NS-Transcoded": converted ? "gsm-ms-to-pcm" : null,
  });
  headers["Content-Type"] = contentType;
  headers["Content-Length"] = String(body.byteLength);
  return new Response(body, { status: 200, headers });
}

async function streamFromUrl(
  audioUrl: string,
  meta: any,
  extra: Record<string, string | null | undefined>,
  attempts: any[],
  opts: { callDbId?: string | null; preferUrl?: boolean } = {},
) {
  const cfg = await getNsRuntimeConfig();
  const fullUrl = audioUrl.startsWith("http")
    ? audioUrl
    : `${cfg.baseUrl}${audioUrl.startsWith("/") ? "" : "/"}${audioUrl.replace(/^\/?ns-api\/v2\/?/, "")}`;
  // Signed ucstack/file-access-url URLs must be fetched without NS bearer.
  let a = await fetch(fullUrl);
  attempts.push({ url: audioUrl.startsWith("http") ? "file-access-url-noauth" : fullUrl, status: a.status, ct: a.headers.get("Content-Type") ?? "" });
  if (!a.ok && !audioUrl.startsWith("http")) {
    a = await fetch(fullUrl, { headers: { Authorization: `Bearer ${cfg.apiKey}`, Accept: "audio/*" } });
    attempts.push({ url: "audio-url-bearer", status: a.status, ct: a.headers.get("Content-Type") ?? "" });
  }
  if (!a.ok || !a.body) return null;
  return audioResponse(a, meta, extra, opts);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let cfg;
  try { cfg = await getNsRuntimeConfig(); } catch (e) { return unavailable("ns_not_configured", { error: (e as Error).message, message: (e as Error).message }); }

  let body: any = {};
  try { body = await req.json(); } catch { /* GET/empty */ }
  const url = new URL(req.url);
  const call_db_id = body.call_db_id ?? url.searchParams.get("call_db_id");
  let ns_callid: string | null = body.ns_callid ?? url.searchParams.get("ns_callid");
  let ns_extension: string | null = body.ns_extension ?? url.searchParams.get("ns_extension");
  let row: any = null;
  let domain = String(body.domain ?? url.searchParams.get("domain") ?? cfg.domain);
  const attempts: any[] = [];
  const preferUrl = body?.prefer_url === true || url.searchParams.get("prefer_url") === "1";

  if ((!ns_callid || !ns_extension || preferUrl) && call_db_id) {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data } = await admin
      .from("planipret_phone_calls")
      .select("id, user_id, ns_call_id, ns_callid, ns_orig_callid, ns_term_callid, ns_domain, extension, metadata, recording_url, recording_storage_path, started_at, duration_seconds, from_number, to_number")
      .eq("id", call_db_id)
      .maybeSingle();
    row = data;
    domain = row?.ns_domain || row?.metadata?.domain || domain;
    ns_callid = ns_callid || row?.ns_callid || row?.ns_orig_callid || row?.ns_term_callid
      || row?.metadata?.["call-orig-call-id"] || row?.metadata?.["call-term-call-id"] || row?.metadata?.["call-parent-cdr-id"] || null;
    ns_extension = ns_extension || row?.extension || row?.metadata?.["call-orig-user"]?.toString() || null;

    // Fastest path: recording is already cached in our own storage.
    if (row?.recording_storage_path) {
      const signed = await signCachedUrl(row.recording_storage_path);
      if (signed) {
        if (preferUrl) return json({ success: true, available: true, reason: "cached", url: signed, recording_url: signed, cached: true, path: row.recording_storage_path });
        const s = await fetch(signed);
        if (s.ok) {
          const bytes = new Uint8Array(await s.arrayBuffer());
          return new Response(bytes, {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": s.headers.get("Content-Type") ?? "audio/mpeg",
              "Content-Length": String(bytes.byteLength),
              "Cache-Control": "private, max-age=3600",
              "X-NS-Source": "storage-cache",
            },
          });
        }
      }
    }

    // If DB already has a fully-resolved http recording_url, short-circuit.
    if (row?.recording_url && String(row.recording_url).startsWith("http")) {
      const direct = await streamFromUrl(row.recording_url, row.metadata?.ns_recording ?? null, { "X-NS-Source": "cached" }, attempts, { callDbId: call_db_id, preferUrl });
      if (direct) return direct;
    }
  }

  const ids: string[] = [];
  pushId(ids, ns_callid);
  pushId(ids, body.ns_orig_callid ?? url.searchParams.get("ns_orig_callid"));
  pushId(ids, body.ns_term_callid ?? url.searchParams.get("ns_term_callid"));
  addIds(ids, row?.metadata, row, { id: ns_callid });
  addIdsFromPath(ids, row?.metadata?.transcription_path ?? row?.metadata?.["prefilled-transcription-api"]);

  const cdrMatches = await hydrateCdrs(row, domain, ids, attempts);
  for (const m of cdrMatches) addIds(ids, m.cdr);

  if (!ids.length) {
    return unavailable("missing_callid", {
      error: "MISSING_CALLID",
      message: "Identifiant NS-API introuvable pour cet appel. Relancez la synchronisation CDR.",
      call_db_id, ns_callid, ns_extension, attempts,
    });
  }

  const headers = { Authorization: `Bearer ${cfg.apiKey}`, Accept: "audio/*, application/json" };
  const D = encodeURIComponent(domain);
  const E = ns_extension ? encodeURIComponent(ns_extension) : null;

  const paths: Array<{ path: string; lookupId: string }> = [];
  const storedPath = normalizeNsPath(row?.metadata?.recording_api_path);
  if (storedPath) paths.push({ path: storedPath, lookupId: ns_callid ?? ids[0] });
  for (const id of ids) {
    const enc = encodeURIComponent(id);
    paths.push({ path: `/domains/${D}/recordings/${enc}`, lookupId: id });
    if (E) paths.push({ path: `/domains/${D}/users/${E}/recordings/${enc}`, lookupId: id });
    paths.push({ path: `/domains/${D}/recordings?callid=${enc}`, lookupId: id });
  }

  let recordingMeta: any = null;

  for (const { path: p, lookupId } of Array.from(new Map(paths.map((x) => [`${x.path}|${x.lookupId}`, x])).values())) {
    const target = `${cfg.baseUrl}${p}`;
    try {
      const r = await fetch(target, { headers });
      const ct = r.headers.get("Content-Type") ?? "";
      const attempt: any = { url: p, status: r.status, ct, lookup_id: lookupId };
      attempts.push(attempt);

      if (r.ok && (ct.startsWith("audio") || ct.includes("octet-stream"))) {
        if (!r.body) continue;
        return audioResponse(r, recordingMeta, { "X-NS-CallID": lookupId, "X-NS-Source-Path": p }, { callDbId: call_db_id, preferUrl });
      }
      if (r.ok) {
        const rawText = await r.text();
        attempt.body_preview = rawText.slice(0, 500);
        let parsed: any = null;
        try { parsed = rawText ? JSON.parse(rawText) : null; } catch { parsed = null; }
        const recording = Array.isArray(parsed) ? parsed[0] : parsed;
        if (recording && typeof recording === "object") {
          attempt.fields_found = Object.keys(recording);
        }
        if (recording && !recordingMeta) recordingMeta = recording;
        const audioUrl = pickAudioUrl(recording);
        attempt.audio_url_extracted = audioUrl;
        if (audioUrl) {
          const streamed = await streamFromUrl(audioUrl, recording, { "X-NS-CallID": lookupId, "X-NS-Source-Path": p }, attempts, { callDbId: call_db_id, preferUrl });
          if (streamed) return streamed;
        }
      }
    } catch (e) {
      attempts.push({ url: p, error: (e as Error).message });
    }
  }

  if (recordingMeta) {
    return unavailable("no_file_access_url", {
      error: "NO_FILE_ACCESS_URL",
      message: "L'enregistrement existe mais l'URL d'accès n'est pas disponible (traitement en cours ou fichier vide).",
      ns_callid, ns_extension, domain,
      attempted_ids: ids,
      recording_status: recordingMeta["call-recording-status"] ?? null,
      file_size_kb: recordingMeta["file-size-kilobytes"] ?? null,
      duration_sec: recordingMeta["file-duration-seconds"] ?? null,
      recording_meta: recordingMeta,
      attempts,
    });
  }

  // NOTE: do NOT flip has_recording=false here. NetSapiens can respond empty
  // while the recording is still being finalized, or when the orig/term call-id
  // we probed doesn't yet match the CDR. Auto-marking permanently hid the
  // "Load recording" flow for calls that ARE recorded (all lines are auto-recorded).
  return unavailable("recording_not_found", {
    error: "RECORDING_NOT_FOUND",
    message: cdrMatches.length
      ? "Aucun enregistrement retourné par NetSapiens pour cet appel (traitement en cours, expiré, ou call-id désynchronisé). Relancez la synchronisation CDR puis réessayez."
      : "NetSapiens n'a retourné aucun enregistrement pour cet appel. Vérifiez la synchronisation CDR puis réessayez.",
    ns_callid, ns_extension, domain, attempted_ids: ids, cdr_matches: cdrMatches.map((m) => ({ score: m.score, path: m.path })), attempts,
    possible_causes: [
      "Le fichier est encore en cours de traitement côté NetSapiens (réessayer dans quelques minutes)",
      "Le ns_callid stocké ne correspond pas à la paire orig/term réelle — resynchroniser le CDR",
      "Le fichier a expiré ou été purgé côté NetSapiens (rare, uniquement pour d'anciens appels)",
    ],
  });
});
