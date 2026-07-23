// pp-admin-ns-sync — Admin-level NS-API sync for Planiprêt users, CDRs,
// recordings and messages. Returns quickly; heavy backfill runs in background.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const AVA_ORG_ID = "17d6507f-a9ca-409d-8e49-371d50332615";
const NS_API_KEY = Deno.env.get("NS_API_KEY") ?? "";
const NS_API_BASE_URL = (Deno.env.get("NS_API_BASE_URL") ?? "https://voice.ava-telecom.ca/ns-api/v2").replace(/\/$/, "");
const NS_DEFAULT_DOMAIN = Deno.env.get("NS_DEFAULT_DOMAIN") ?? "planipret.ca";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

let _logClient: ReturnType<typeof createClient> | null = null;
function logClient() {
  if (!_logClient) _logClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  return _logClient;
}
function logNsRequest(entry: {
  method: string; path: string; full_url: string; status: number; duration_ms: number; ok: boolean; error?: string | null;
}) {
  try {
    const [pathOnly, qs] = entry.path.split("?");
    const query_params: Record<string, string> = {};
    if (qs) for (const [k, v] of new URLSearchParams(qs)) query_params[k] = v;
    // fire & forget
    logClient().from("planipret_ns_request_log").insert({
      function_name: "pp-admin-ns-sync",
      method: entry.method,
      path: pathOnly,
      query_params: qs ? query_params : null,
      full_url: entry.full_url,
      status: entry.status,
      duration_ms: entry.duration_ms,
      ok: entry.ok,
      error: entry.error ?? null,
    }).then(() => {}, () => {});
  } catch { /* ignore */ }
}

async function nsFetch(path: string) {
  const fullUrl = `${NS_API_BASE_URL}${path}`;
  const t0 = Date.now();
  console.log(`[pp-admin-ns-sync][NS] GET ${path}`);
  try {
    const res = await fetch(fullUrl, {
      headers: { Authorization: `Bearer ${NS_API_KEY}`, Accept: "application/json" },
    });
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    logNsRequest({ method: "GET", path, full_url: fullUrl, status: res.status, duration_ms: Date.now() - t0, ok: res.ok, error: res.ok ? null : String(text).slice(0, 300) });
    return { ok: res.ok, status: res.status, data, text };
  } catch (e) {
    logNsRequest({ method: "GET", path, full_url: fullUrl, status: 0, duration_ms: Date.now() - t0, ok: false, error: (e as Error).message });
    throw e;
  }
}

async function fetchAll(basePath: string, pageSize = 200, maxPages = 30) {
  const all: any[] = [];
  const seen = new Set<string>();
  let warning: string | null = null;
  for (let i = 0; i < maxPages; i++) {
    const sep = basePath.includes("?") ? "&" : "?";
    const r = await nsFetch(`${basePath}${sep}limit=${pageSize}&start=${i * pageSize + 1}`);
    if (!r.ok) {
      warning = `HTTP ${r.status}: ${String(r.text ?? "").slice(0, 180)}`;
      break;
    }
    const arr = Array.isArray(r.data) ? r.data : (r.data?.data ?? r.data?.users ?? r.data?.cdrs ?? r.data?.messages ?? r.data?.items ?? []);
    let added = 0;
    for (const item of arr) {
      const key = String(
        val(item, [
          "call_id", "call-id", "cdr_id", "cdr-id", "orig-callid", "orig_callid",
          "message_id", "message-id", "recording_id", "recording-id",
          "id", "uuid", "user", "extension", "subscriber_login", "user_id",
        ], JSON.stringify(item).slice(0, 300)),
      );
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(item);
      added++;
    }
    if (added === 0) break;
    if (arr.length < pageSize) break;
  }
  return { data: all, warning };
}

function val(raw: any, keys: string[], fallback: any = null) {
  for (const k of keys) {
    const v = raw?.[k];
    if (v !== undefined && v !== null && `${v}` !== "") return v;
  }
  return fallback;
}

function numVal(raw: any, keys: string[], fallback = 0): number {
  const v = val(raw, keys, fallback);
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeNsPath(path: string | null): string | null {
  if (!path) return null;
  const trimmed = String(path).trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http")) {
    try {
      const u = new URL(trimmed);
      const idx = u.pathname.indexOf("/ns-api/v2");
      return `${idx >= 0 ? u.pathname.slice(idx + "/ns-api/v2".length) : u.pathname}${u.search}`;
    } catch { return trimmed; }
  }
  return trimmed.replace(/^\/ns-api\/v2/i, "");
}

function recordingLookupCallIds(c: any): string[] {
  const keys = [
    "call-id", "call_id", "callid",
    "call-orig-call-id", "orig-callid", "orig-call-id", "orig_callid",
    "call-term-call-id", "term-callid", "term-call-id", "term_callid",
    "call-through-call-id", "by-callid", "by_callid",
    "call-parent-call-id",
    "call-parent-cdr-id", "cdr_id", "cdr-id", "id", "uuid",
  ];
  const ids: string[] = [];
  for (const key of keys) {
    const id = String(c?.[key] ?? "").trim();
    if (!id || id === "null" || id === "undefined" || id.includes("sip:") || id.split(":").length > 3 || ids.includes(id)) continue;
    ids.push(id);
  }
  return ids;
}

function recordingApiPath(domain: string, c: any): string | null {
  const d = encodeURIComponent(domain || String(val(c, ["domain"], NS_DEFAULT_DOMAIN)));
  const callId = recordingLookupCallIds(c)[0];
  return callId ? `/domains/${d}/recordings/${encodeURIComponent(callId)}` : null;
}

function recordingAccessUrl(raw: any): string | null {
  const first = Array.isArray(raw) ? raw[0] : raw;
  return val(first, ["file-access-url", "file_access_url", "recording_url", "recording-url", "url"], null);
}

async function fetchRecordingAccessUrl(domain: string, c: any): Promise<string | null> {
  const d = encodeURIComponent(domain || String(val(c, ["domain"], NS_DEFAULT_DOMAIN)));
  const ext = String(val(c, ["user", "orig-user", "term-user", "extension", "subscriber", "call-orig-user", "call-term-user", "call-through-user"], "")).trim();
  for (const id of recordingLookupCallIds(c)) {
    const paths = [
      `/domains/${d}/recordings/${encodeURIComponent(id)}`,
      ...(ext ? [`/domains/${d}/users/${encodeURIComponent(ext)}/recordings/${encodeURIComponent(id)}`] : []),
    ];
    for (const path of paths) {
      const r = await nsFetch(path);
      if (!r.ok) continue;
      const url = recordingAccessUrl(r.data);
      if (url) return url;
    }
  }
  return null;
}

function toIso(v: unknown): string | null {
  if (!v) return null;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizePhone(v: unknown): string | null {
  const s = String(v ?? "").replace(/^sip:/i, "").split("@")[0].replace(/[<>\"']/g, "").trim();
  return s || null;
}

function pickDirection(c: any, ext?: string): "inbound" | "outbound" | "missed" {
  const dRaw = val(c, ["direction", "call_direction", "call-direction", "call-direction-text", "type"], "");
  const d = String(dRaw).toLowerCase();
  const disp = String(val(c, ["release-text", "call-disconnect-reason-text", "call-disposition", "disposition", "status", "result"], "")).toLowerCase();
  const answered = val(c, ["time-answer", "answer_time", "answer-time", "answered_at", "answered-at", "call-answer-datetime", "call-batch-answer-datetime"]);
  if (disp.includes("miss") || disp.includes("no answer") || disp.includes("no-answer") || (!answered && disp.includes("cancel"))) return "missed";
  if (d.includes("out") || d === "1" || d === "outbound") return "outbound";
  if (d.includes("in") || d === "0" || d === "inbound") return "inbound";
  const orig = String(val(c, ["orig-user", "from-user", "from_user", "user", "call-orig-user"], ""));
  const term = String(val(c, ["term-user", "to-user", "to_user", "call-term-user"], ""));
  if (ext && orig === ext && term !== ext) return "outbound";
  return "inbound";
}

function recordingUrl(c: any): string | null {
  return val(c, [
    "recording_url", "recording-url", "recording", "recording_file", "recording-file",
    "recording_download_url", "recording-download-url", "call-recording-url", "call-recording-uri",
    "audio_url", "audio-url", "download_url", "url",
  ]);
}

function transcriptionPath(c: any): string | null {
  return normalizeNsPath(val(c, ["prefilled-transcription-api", "transcription_url", "transcription-url", "transcript_url", "transcript-url"]));
}

function transcriptText(t: any): string | null {
  if (!t) return null;
  const direct = val(t, ["transcript", "text", "body", "call-intelligence-transcript", "call-intelligence-summary"], null);
  if (direct) return String(direct);
  const segments = Array.isArray(t?.["call-intelligence-segments"]) ? t["call-intelligence-segments"] : (Array.isArray(t?.segments) ? t.segments : []);
  const lines = segments
    .map((seg: any) => String(val(seg, ["comment", "text", "transcript"], "")).trim())
    .filter(Boolean);
  return lines.length ? lines.join("\n") : null;
}

function nsCallId(c: any): string | null {
  const explicit = String(val(c, ["id", "call_id", "call-id", "callid", "cdr_id", "cdr-id", "uuid", "orig-callid", "orig-call-id", "orig_callid", "session_id", "session-id", "call-orig-call-id", "call-term-call-id", "call-parent-call-id"], "")).trim();
  if (explicit) return explicit;
  const ext = String(val(c, ["user", "orig-user", "term-user", "extension", "subscriber", "call-orig-user", "call-term-user", "call-through-user"], "")).trim();
  const started = String(val(c, ["time-start", "start-time", "start_time", "started_at", "date", "created_at", "call-start-datetime", "call-batch-start-datetime", "call-record-creation-datetime"], "")).trim();
  const from = String(val(c, ["orig-from-uri", "from", "from_number", "from-user", "caller_id_number", "call-orig-from-uri", "call-orig-from-user", "call-orig-caller-id"], "")).trim();
  const to = String(val(c, ["term-to-uri", "to", "to_number", "to-user", "destination", "call-term-to-uri", "call-orig-to-uri", "call-term-user", "call-orig-to-user"], "")).trim();
  const duration = String(val(c, ["duration", "time-talking", "billsec", "talk_time", "call-total-duration-seconds", "call-batch-total-duration-seconds", "call-talking-duration-seconds"], "0")).trim();
  return ext || started || from || to ? `${ext}:${started}:${from}:${to}:${duration}` : null;
}

function userExt(u: any): string {
  return String(val(u, ["user", "extension", "subscriber_login", "user_id", "id"], "")).trim();
}

function userEmail(u: any): string {
  return String(val(u, ["email", "email_address", "email-address"], "")).toLowerCase().trim();
}

function userName(u: any, ext: string) {
  const first = val(u, ["name-first-name", "first_name", "firstName"], "");
  const last = val(u, ["name-last-name", "last_name", "lastName"], "");
  return String(val(u, ["display_name", "display-name", "name"], `${first} ${last}`.trim()) || ext);
}

function isPlanipretBrokerUser(u: any) {
  const ext = userExt(u);
  const email = userEmail(u);
  const name = userName(u, ext).toLowerCase();
  const status = String(val(u, ["status", "presence"], "")).toLowerCase();
  const scope = String(val(u, ["scope", "user_scope", "user-scope"], "")).toLowerCase();
  return !!ext
    && !/^\d{7,}$/.test(ext)
    && !/@lemtel\.com$/i.test(email)
    && !["disabled", "suspended", "deleted", "inactive"].includes(status)
    && !["system", "system user", "anonymous", "conference", "voicemail", "operator"].includes(name)
    && !scope.includes("domain");
}

async function tryPaths(paths: string[]) {
  let last: any = null;
  for (const p of paths) {
    const r = await fetchAll(p, 200, 15);
    if (r.data.length) return { ...r, path: p };
    last = { ...r, path: p };
  }
  return last ?? { data: [], warning: "no_endpoint" };
}

async function upsertProfiles(admin: ReturnType<typeof createClient>, domain: string, users: any[]) {
  const { data: profiles } = await admin
    .from("planipret_profiles")
    .select("id,user_id,email,extension,ns_extension,full_name,metadata")
    .eq("organization_id", AVA_ORG_ID);

  const byExt = new Map<string, any>();
  const byEmail = new Map<string, any>();
  for (const p of profiles ?? []) {
    const ext = String(p.extension ?? p.ns_extension ?? "").trim();
    if (ext) byExt.set(ext, p);
    if (p.email) byEmail.set(String(p.email).toLowerCase().trim(), p);
  }

  let matched = 0;
  let created = 0;
  const patches: Array<{ id: string; patch: any }> = [];
  const inserts: any[] = [];
  for (const u of users) {
    const ext = userExt(u);
    if (!ext) continue;
    const email = userEmail(u);
    const name = userName(u, ext);
    const sipUser = String(val(u, ["login-username", "login_username", "sip_username"], ext));
    const existing = byExt.get(ext) ?? (email ? byEmail.get(email) : null);
    if (existing) {
      matched++;
      patches.push({
        id: existing.id,
        patch: {
          extension: existing.extension ?? ext,
          ns_extension: ext,
          ns_domain: domain,
          ns_sip_username: sipUser,
          ns_linked: existing.user_id ? true : false,
          ns_linked_at: existing.user_id ? new Date().toISOString() : null,
          full_name: existing.full_name ?? name,
          email: existing.email ?? (email || null),
          metadata: { ...(existing.metadata ?? {}), ns_user: u },
        },
      });
    } else {
      created++;
      inserts.push({
        organization_id: AVA_ORG_ID,
        user_id: null,
        full_name: name,
        email: email || null,
        extension: ext,
        ns_extension: ext,
        ns_domain: domain,
        ns_sip_username: sipUser,
        ns_linked: false,
        metadata: { ns_user: u, source: "pp-admin-ns-sync" },
      });
    }
  }

  for (let i = 0; i < patches.length; i += 25) {
    const chunk = patches.slice(i, i + 25);
    await Promise.all(chunk.map(({ id, patch }) =>
      admin.from("planipret_profiles").update(patch).eq("id", id)
    ));
  }
  let inserted = 0;
  const errors: string[] = [];
  for (let i = 0; i < inserts.length; i += 50) {
    const chunk = inserts.slice(i, i + 50);
    const { error } = await admin.from("planipret_profiles").insert(chunk);
    if (error) {
      errors.push(error.message);
      console.error("[upsertProfiles] insert error:", error.message);
    } else {
      inserted += chunk.length;
    }
  }
  return { matched, created, inserted, errors };
}

async function fetchTranscription(path: string | null) {
  if (!path) return { transcript: null, ai_summary: null, segments: null, raw: null };
  try {
    const r = await nsFetch(path);
    if (!r.ok) return { transcript: null, ai_summary: null, segments: null, raw: { error: `HTTP ${r.status}` } };
    const raw = r.data;
    const transcript = transcriptText(raw);
    return {
      transcript,
      ai_summary: val(raw, ["call-intelligence-summary", "summary", "ai_summary"], null),
      segments: raw?.["call-intelligence-segments"] ?? raw?.segments ?? null,
      raw,
    };
  } catch (e) {
    return { transcript: null, ai_summary: null, segments: null, raw: { error: (e as Error).message } };
  }
}

async function enrichTranscriptions(rows: any[]) {
  const candidates = rows.filter((r) => r.metadata?.["prefilled-transcription-api"] || r.metadata?.transcription_path);
  let enriched = 0;
  for (let i = 0; i < candidates.length; i += 8) {
    const chunk = candidates.slice(i, i + 8);
    await Promise.all(chunk.map(async (row) => {
      const path = row.metadata?.transcription_path ?? transcriptionPath(row.metadata);
      const t = await fetchTranscription(path);
      if (t.transcript || t.ai_summary || t.segments) {
        row.transcript = t.transcript;
        row.ai_summary = t.ai_summary;
        row.transcript_source = "netsapiens";
        row.transcript_segments = t.segments;
        row.metadata = { ...(row.metadata ?? {}), ns_transcription: t.raw };
        enriched++;
      }
    }));
  }
  return enriched;
}

async function syncCalls(admin: ReturnType<typeof createClient>, domain: string, users: any[], start: string, end: string) {
  const { data: profiles } = await admin
    .from("planipret_profiles")
    .select("id,extension,ns_extension")
    .eq("organization_id", AVA_ORG_ID);
  const extToProfile = new Map<string, string>();
  for (const p of profiles ?? []) {
    const ext = String(p.extension ?? p.ns_extension ?? "").trim();
    if (ext && p.id) extToProfile.set(ext, p.id as string);
  }

  const D = encodeURIComponent(domain);
  const qs = `datetime-start=${encodeURIComponent(start)}&datetime-end=${encodeURIComponent(end)}`;
  const legacyQs = `start-time=${encodeURIComponent(start)}&end-time=${encodeURIComponent(end)}`;
  let domainCdrs = await fetchAll(`/domains/${D}/cdrs?${qs}`, 200, 50);
  if (!domainCdrs.data.length) domainCdrs = await fetchAll(`/domains/${D}/cdrs?${legacyQs}`, 200, 50);
  if (!domainCdrs.data.length) domainCdrs = await fetchAll(`/cdrs?domain=${D}&${qs}`, 200, 50);
  const rawItems: Array<{ item: any; ext?: string }> = [];
  for (const c of domainCdrs.data) {
    rawItems.push({ item: c, ext: String(val(c, ["user", "orig-user", "term-user", "extension", "call-orig-user", "call-term-user", "call-through-user"], "")) || undefined });
  }

  if (rawItems.length === 0) {
    const extensions = Array.from(new Set(users.map(userExt).filter(Boolean)));
    for (let i = 0; i < extensions.length; i += 12) {
      const chunk = extensions.slice(i, i + 12);
      const results = await Promise.all(chunk.map(async (ext) => {
        const r = await fetchAll(`/domains/${D}/users/${encodeURIComponent(ext)}/cdrs?${qs}`, 200, 10);
        return { ext, data: r.data, warning: r.warning };
      }));
      for (const r of results) for (const item of r.data) rawItems.push({ item, ext: r.ext });
    }
  }

  const rows: any[] = [];
  for (const { item: c, ext: fallbackExt } of rawItems) {
    const id = nsCallId(c);
    if (!id) continue;
    const ext = String(val(c, ["user", "orig-user", "term-user", "extension", "subscriber", "call-orig-user", "call-term-user", "call-through-user"], fallbackExt ?? "")).trim();
    const started = toIso(val(c, ["time-start", "start-time", "start_time", "started_at", "date", "created_at", "call-start-datetime", "call-batch-start-datetime", "call-record-creation-datetime"]));
    const transcription = transcriptionPath(c);
    rows.push({
      user_id: extToProfile.get(ext) ?? null,
      organization_id: AVA_ORG_ID,
      ns_call_id: id,
      ns_domain: domain,
      extension: ext || null,
      direction: pickDirection(c, ext),
      status: String(val(c, ["release-text", "call-disconnect-reason-text", "call-disposition", "disposition", "status"], val(c, ["call-answer-datetime", "time-answer"], null) ? "completed" : "missed")).toLowerCase(),
      from_number: normalizePhone(val(c, ["orig-from-uri", "from", "from_number", "from-user", "caller_id_number", "call-orig-from-uri", "call-orig-from-user", "call-orig-caller-id"])),
      from_name: val(c, ["orig-from-name", "from_name", "caller_id_name", "call-orig-from-name"]),
      to_number: normalizePhone(val(c, ["term-to-uri", "to", "to_number", "to-user", "destination", "call-term-to-uri", "call-orig-to-uri", "call-term-user", "call-orig-to-user", "call-orig-request-user"])),
      to_name: val(c, ["term-to-name", "to_name", "call-term-to-name"]),
      started_at: started,
      answered_at: toIso(val(c, ["time-answer", "answer-time", "answer_time", "answered_at", "call-answer-datetime", "call-batch-answer-datetime"])),
      ended_at: toIso(val(c, ["time-release", "end-time", "end_time", "ended_at", "call-disconnect-datetime"])),
      duration_seconds: numVal(c, ["duration", "time-talking", "billsec", "talk_time", "call-total-duration-seconds", "call-batch-total-duration-seconds", "call-talking-duration-seconds"], 0),
      recording_url: recordingUrl(c),
      transcript_source: transcription ? "netsapiens" : null,
      ns_callid: val(c, ["call-parent-cdr-id", "call-orig-call-id", "call-term-call-id", "call-parent-call-id", "id"]),
      ns_orig_callid: val(c, ["call-orig-call-id", "orig-callid", "orig-call-id"]),
      ns_term_callid: val(c, ["call-term-call-id", "term-callid", "term-call-id"]),
      metadata: { ...c, transcription_path: transcription, recording_api_path: recordingApiPath(domain, c) },
    });
  }

  const transcriptions = await enrichTranscriptions(rows);

  let upserted = 0;
  let errors: string[] = [];
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await admin.from("planipret_phone_calls").upsert(chunk, { onConflict: "ns_call_id" });
    if (error) errors.push(error.message);
    else upserted += chunk.length;
  }
  return { fetched: rawItems.length, mapped: rows.length, upserted, recordings: rows.filter((r) => r.recording_url).length, transcriptions, warnings: domainCdrs.warning ? [domainCdrs.warning] : [], errors };
}

async function syncMessages(admin: ReturnType<typeof createClient>, domain: string, start: string, end: string, users: any[] = []) {
  const D = encodeURIComponent(domain);
  // Per NS-API docs (docs.ns-api.com/reference), SMS lives under:
  //   GET /ns-api/v2/domains/{domain}/users/{user}/messagesessions
  //   GET /ns-api/v2/domains/{domain}/users/{user}/messagesessions/{session}/messages
  // Some servers also expose a flat /domains/{domain}/messages aggregator; we try that
  // first as a fast-path, then fall back to per-user session enumeration.
  // curl equivalent: GET https://{server}/ns-api/v2/domains/{D}/users/{ext}/messagesessions
  let r = await tryPaths([
    `/domains/${D}/messages?start-time=${encodeURIComponent(start)}&end-time=${encodeURIComponent(end)}`,
    `/domains/${D}/sms?start-time=${encodeURIComponent(start)}&end-time=${encodeURIComponent(end)}`,
  ]);
  if (!r.data.length) {
    const sessions = await fetchAll(`/domains/${D}/messagesessions`, 200, 30);
    const collected: any[] = [];
    for (const s of sessions.data) {
      const ext = String(val(s, ["user", "extension"], "")).trim();
      const sid = String(val(s, ["messagesession-id", "session_id", "session-id", "id"], "")).trim();
      const last = toIso(val(s, ["messagesession-last-datetime", "messagesession-last-timestamp", "updated_at"], null));
      if (!ext || !sid) continue;
      if (last && (last < start || last > end)) continue;
      const msgs = await fetchAll(`/domains/${D}/users/${encodeURIComponent(ext)}/messagesessions/${encodeURIComponent(sid)}/messages`, 100, 5);
      for (const m of msgs.data) collected.push({ ...m, user: ext, ns_session: s });
    }
    r = { data: collected, warning: collected.length ? null : (sessions.warning ?? "domain_messagesessions_empty") };
  }
  if (!r.data.length && users.length) {
    const collected: any[] = [];
    const sampleUsers = users; // scan every Planiprêt user so SMS appears on admin pages
    for (const u of sampleUsers) {
      const ext = userExt(u);
      if (!ext) continue;
      const E = encodeURIComponent(ext);
      const sessions = await tryPaths([`/domains/${D}/users/${E}/messagesessions`]);
      for (const s of sessions.data.slice(0, 25)) {
        const sid = String(s?.session_id ?? s?.id ?? s?.["session-id"] ?? "").trim();
        if (!sid) continue;
        const S = encodeURIComponent(sid);
        const msgs = await tryPaths([`/domains/${D}/users/${E}/messagesessions/${S}/messages`]);
        for (const m of msgs.data) collected.push({ ...m, user: ext });
      }
    }
    r = { data: collected, warning: collected.length ? null : "messages_per_session_empty" };
  }
  if (!r.data.length) return { fetched: 0, upserted: 0, warning: r.warning ?? "messages_endpoint_empty" };


  const { data: profiles } = await admin.from("planipret_profiles").select("id,extension,ns_extension").eq("organization_id", AVA_ORG_ID);
  const extToProfile = new Map<string, string>();
  for (const p of profiles ?? []) {
    const ext = String(p.extension ?? p.ns_extension ?? "").trim();
    if (ext && p.id) extToProfile.set(ext, p.id as string);
  }

  const rows = r.data.map((m: any) => {
    const ext = String(val(m, ["user", "extension", "subscriber", "from-user", "to-user", "source-user", "destination-user", "owner"], "")).trim();
    const mid = String(val(m, ["id", "message_id", "message-id", "uuid", "sms-id", "sms_id"], crypto.randomUUID())).trim();
    const fromUser = String(val(m, ["from-user-id", "from_user_id", "from-user"], ""));
    const dirRaw = String(val(m, ["direction", "type", "message-direction"], "inbound")).toLowerCase();
    const dir = dirRaw.includes("out") || (ext && fromUser.startsWith(`${ext}@`)) ? "outbound" : "inbound";
    const peer = dir === "outbound" ? normalizePhone(val(m, ["to", "to_number", "to-number", "destination", "destination-number"])) : normalizePhone(val(m, ["from", "from_number", "from-number", "source", "source-number"]));
    const sessionId = String(val(m, ["messagesession-id", "thread_id", "thread-id"], `${ext}:${peer ?? mid}`));
    return {
      user_id: extToProfile.get(ext) ?? null,
      organization_id: AVA_ORG_ID,
      ns_message_id: mid,
      thread_id: sessionId,
      direction: dir,
      from_number: normalizePhone(val(m, ["from", "from_number", "from-number", "source", "source-number", "from-user-id"])),
      to_number: normalizePhone(val(m, ["to", "to_number", "to-number", "destination", "destination-number", "terminating-number", "terminating-user-id", "dialed"])),
      body: val(m, ["body", "message", "text", "content", "message-text"], ""),
      media_urls: val(m, ["media_urls", "media-urls", "attachments", "media"], []),
      status: val(m, ["status", "delivery_status", "delivery-status"], null),
      sent_at: toIso(val(m, ["sent_at", "sent-at", "time", "created_at", "message-datetime", "timestamp", "date"])),
      metadata: { ...m, extension: ext },
    };
  });

  let upserted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await admin.from("planipret_phone_messages").upsert(chunk, { onConflict: "ns_message_id" });
    if (!error) upserted += chunk.length;
  }
  return { fetched: rows.length, upserted, warning: null };
}

async function syncRecordings(admin: ReturnType<typeof createClient>, domain: string, users: any[], start: string, end: string) {
  const { data: profiles } = await admin
    .from("planipret_profiles")
    .select("id,extension,ns_extension")
    .eq("organization_id", AVA_ORG_ID);
  const extToProfile = new Map<string, string>();
  for (const p of profiles ?? []) {
    const ext = String(p.extension ?? p.ns_extension ?? "").trim();
    if (ext && p.id) extToProfile.set(ext, p.id as string);
  }

  const D = encodeURIComponent(domain);
  const rawItems: Array<{ item: any; ext?: string }> = [];
  const qs = `datetime-start=${encodeURIComponent(start)}&datetime-end=${encodeURIComponent(end)}`;
  const legacyQs = `start-time=${encodeURIComponent(start)}&end-time=${encodeURIComponent(end)}`;
  const domainRecordings = await tryPaths([
    `/domains/${D}/cdrs/recordings?${qs}`,
    `/domains/${D}/cdrs/recordings?${legacyQs}`,
    `/domains/${D}/recordings?${legacyQs}`,
    `/domains/${D}/call-recordings?${legacyQs}`,
    `/domains/${D}/recorded-calls?${legacyQs}`,
  ]);
  for (const r of domainRecordings.data ?? []) rawItems.push({ item: r, ext: String(val(r, ["user", "extension", "orig-user", "term-user", "call-orig-user", "call-term-user", "call-through-user"], "")) || undefined });

  if (rawItems.length === 0) {
    const extensions = Array.from(new Set(users.map(userExt).filter(Boolean)));
    for (let i = 0; i < extensions.length; i += 16) {
      const chunk = extensions.slice(i, i + 16);
      const results = await Promise.all(chunk.map(async (ext) => {
        const r = await tryPaths([
          `/domains/${D}/users/${encodeURIComponent(ext)}/cdrs/recordings?${qs}`,
          `/domains/${D}/users/${encodeURIComponent(ext)}/cdrs/recordings?${legacyQs}`,
          `/domains/${D}/users/${encodeURIComponent(ext)}/recordings?${legacyQs}`,
          `/domains/${D}/users/${encodeURIComponent(ext)}/call-recordings?${legacyQs}`,
          `/domains/${D}/users/${encodeURIComponent(ext)}/recorded-calls?${legacyQs}`,
        ]);
        return { ext, data: r.data ?? [], warning: r.warning };
      }));
      for (const r of results) for (const item of r.data) rawItems.push({ item, ext: r.ext });
    }
  }

  const rows: any[] = [];
  for (const { item: rec, ext: fallbackExt } of rawItems) {
    // Try explicit id keys first, then fall back to the synthetic
    // ext:started:from:to:duration key syncCalls uses — same NS-API v2 CDR
    // shape, so recordings and CDRs share stable ids.
    const explicitId = String(val(rec, ["call_id", "call-id", "cdr_id", "cdr-id", "orig-callid", "orig_callid", "session_id", "session-id", "id", "uuid", "recording_id", "recording-id", "call-orig-call-id", "call-term-call-id", "call-parent-call-id"], "")).trim();
    const id = explicitId || nsCallId(rec);
    if (!id) continue;
    const ext = String(val(rec, ["user", "extension", "orig-user", "term-user", "subscriber", "call-orig-user", "call-term-user", "call-through-user"], fallbackExt ?? "")).trim();
    const apiPath = recordingApiPath(domain, { ...rec, user: ext });
    const url = recordingUrl(rec);
    const started = toIso(val(rec, ["time-start", "start-time", "start_time", "started_at", "date", "created_at", "recorded_at", "recorded-at", "call-start-datetime", "call-batch-start-datetime", "call-record-creation-datetime"]));
    rows.push({
      user_id: extToProfile.get(ext) ?? null,
      organization_id: AVA_ORG_ID,
      ns_call_id: id,
      ns_domain: domain,
      extension: ext || null,
      direction: pickDirection(rec, ext),
      status: String(val(rec, ["release-text", "call-disconnect-reason-text", "call-disposition", "disposition", "status"], "completed")).toLowerCase(),
      from_number: normalizePhone(val(rec, ["orig-from-uri", "from", "from_number", "from-user", "caller_id_number", "call-orig-from-uri", "call-orig-from-user", "call-orig-caller-id"])),
      from_name: val(rec, ["orig-from-name", "from_name", "caller_id_name", "call-orig-from-name"]),
      to_number: normalizePhone(val(rec, ["term-to-uri", "to", "to_number", "to-user", "destination", "call-term-to-uri", "call-orig-to-uri", "call-term-user", "call-orig-to-user", "call-orig-request-user"])),
      to_name: val(rec, ["term-to-name", "to_name", "call-term-to-name"]),
      started_at: started,
      duration_seconds: numVal(rec, ["duration", "time-talking", "billsec", "talk_time", "recording_seconds", "call-total-duration-seconds", "call-batch-total-duration-seconds", "call-talking-duration-seconds"], 0),
      recording_url: url,
      ns_callid: val(rec, ["call-parent-cdr-id", "call-orig-call-id", "call-term-call-id", "call-parent-call-id", "id"]),
      ns_orig_callid: val(rec, ["call-orig-call-id", "orig-callid", "orig-call-id"]),
      ns_term_callid: val(rec, ["call-term-call-id", "term-callid", "term-call-id"]),
      metadata: { ns_recording: rec, recording_api_path: apiPath },
    });
  }

  for (let i = 0; i < rows.length; i += 8) {
    await Promise.all(rows.slice(i, i + 8).map(async (row) => {
      if (row.recording_url?.startsWith("http")) return;
      const accessUrl = await fetchRecordingAccessUrl(domain, row.metadata?.ns_recording ?? row.metadata ?? row);
      if (accessUrl) {
        row.recording_url = accessUrl;
        row.metadata = { ...(row.metadata ?? {}), recording_access_url_resolved: true };
      }
    }));
  }

  let upserted = 0;
  const errors: string[] = [];
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const ids = chunk.map((r) => r.ns_call_id).filter(Boolean);
    const { data: existing, error: exErr } = await admin
      .from("planipret_phone_calls")
      .select("id, ns_call_id, metadata")
      .in("ns_call_id", ids);
    if (exErr) {
      errors.push(exErr.message);
      continue;
    }
    const byNs = new Map((existing ?? []).map((r: any) => [r.ns_call_id, r]));
    const inserts = chunk.filter((r) => !byNs.has(r.ns_call_id));
    const updates = chunk.filter((r) => byNs.has(r.ns_call_id));
    if (inserts.length) {
      const { error } = await admin.from("planipret_phone_calls").insert(inserts);
      if (error) errors.push(error.message);
      else upserted += inserts.length;
    }
    await Promise.all(updates.map((r) => {
      const old = byNs.get(r.ns_call_id) as any;
      return admin.from("planipret_phone_calls").update({
        recording_url: r.recording_url,
        metadata: { ...(old?.metadata ?? {}), ...(r.metadata ?? {}) },
      }).eq("id", old.id);
    }));
    upserted += updates.length;
  }

  // Backfill: for any existing calls in the window that still have no recording_url,
  // try to resolve it directly via NS-API using the call metadata already stored.
  let backfilled = 0;
  const { data: pending } = await admin
    .from("planipret_phone_calls")
    .select("id, ns_call_id, extension, from_number, to_number, started_at, duration_seconds, metadata")
    .eq("organization_id", AVA_ORG_ID)
    .eq("ns_domain", domain)
    .is("recording_url", null)
    .gte("started_at", start)
    .lte("started_at", end)
    .order("started_at", { ascending: false })
    .limit(200);
  for (let i = 0; i < (pending ?? []).length; i += 8) {
    const chunk = (pending ?? []).slice(i, i + 8);
    await Promise.all(chunk.map(async (row: any) => {
      const meta = row.metadata ?? {};
      // Prefer a call id we already extracted, else synthesize from raw NS data
      const nsRaw = meta.ns_recording ?? meta;
      const url = await fetchRecordingAccessUrl(domain, { ...nsRaw, user: row.extension });
      if (url) {
        await admin.from("planipret_phone_calls").update({
          recording_url: url,
          metadata: { ...meta, recording_access_url_resolved: true },
        }).eq("id", row.id);
        backfilled++;
      }
    }));
  }

  return { fetched: rawItems.length, upserted, recordings: rows.length, backfilled, warning: domainRecordings.warning, errors };
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    if (!NS_API_KEY) return json({ error: "NS_API_KEY missing in backend secrets" }, 500);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: userData } = await admin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);
    const { data: isAdmin } = await admin.rpc("is_planipret_admin", { _user_id: userData.user.id });
    const { data: isMember } = await admin.rpc("is_planipret_member", { _user_id: userData.user.id });
    if (isAdmin !== true && isMember !== true) return json({ error: "Forbidden" }, 403);

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const domain = String(body.domain ?? NS_DEFAULT_DOMAIN).trim();
    const end = body.end ?? new Date().toISOString();
    const start = body.start ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    if (!domain) return json({ error: "NS domain not configured" }, 412);
    const usersRes = await fetchAll(`/domains/${encodeURIComponent(domain)}/users`, 200, 30);
    if (!usersRes.data.length) return json({ error: "NS users fetch failed", warning: usersRes.warning }, 502);
    const brokerUsers = usersRes.data.filter(isPlanipretBrokerUser);

    const profileSync = await upsertProfiles(admin, domain, brokerUsers);

    // Record run start (background completion updates it)
    const { data: runRow } = await admin
      .from("planipret_edge_function_runs")
      .insert({
        function_name: "pp-admin-ns-sync",
        status: "running",
        triggered_by: userData.user.id,
        summary: { domain, users_total: brokerUsers.length, profiles_matched: profileSync.matched, profiles_created: profileSync.created, start, end },
      })
      .select("id")
      .maybeSingle();
    const runId = runRow?.id as string | undefined;

    const bg = (async () => {
      try {
        const calls = await syncCalls(admin, domain, brokerUsers, start, end);
        const [recordings, messages] = await Promise.all([
          syncRecordings(admin, domain, brokerUsers, start, end),
          syncMessages(admin, domain, start, end, brokerUsers),
        ]);
        const summary = { domain, users: brokerUsers.length, raw_users: usersRes.data.length, profiles: profileSync, calls, recordings, messages, start, end };
        console.log("[pp-admin-ns-sync] completed", JSON.stringify(summary));
        if (runId) await admin.from("planipret_edge_function_runs").update({ status: "success", finished_at: new Date().toISOString(), summary }).eq("id", runId);
      } catch (e) {
        const msg = (e as Error).message;
        console.error("[pp-admin-ns-sync] background error", msg);
        if (runId) await admin.from("planipret_edge_function_runs").update({ status: "error", finished_at: new Date().toISOString(), error: msg }).eq("id", runId);
      }
    })();
    // @ts-ignore EdgeRuntime global exists in deployed edge runtime.
    if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
      // @ts-ignore
      (EdgeRuntime as any).waitUntil(bg);
    }

    return json({
      ok: true,
      status: "queued",
      run_id: runId,
      domain,
      users_total: brokerUsers.length,
      raw_users_total: usersRes.data.length,
      extensions: brokerUsers.map(userExt).filter(Boolean).length,
      profiles_matched: profileSync.matched,
      profiles_created: profileSync.created,
      cdr: { status: "queued_in_background", start, end },
      recordings: { status: "queued_in_background" },
      messages: { status: "queued_in_background" },
      warning: usersRes.warning,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});