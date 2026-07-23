// pp-admin-recording-resolve — On-demand recording URL resolver for a single
// planipret_phone_calls row. Admin-only. Calls NS-API v2
// /domains/{domain}/recordings/{callId}, extracts the file-access-url, stores
// it on the row, and returns it.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { nsBrokerFetch } from "../_shared/ns-broker.ts";

const NS_API_KEY = Deno.env.get("NS_API_KEY") ?? "";
const NS_API_BASE_URL = (Deno.env.get("NS_API_BASE_URL") ?? "https://voice.ava-telecom.ca/ns-api/v2").replace(/\/$/, "");
const NS_DEFAULT_DOMAIN = Deno.env.get("NS_DEFAULT_DOMAIN") ?? "planipret.ca";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const val = (raw: any, keys: string[], fb: any = null) => {
  for (const k of keys) {
    const v = raw?.[k];
    if (v !== undefined && v !== null && `${v}` !== "") return v;
  }
  return fb;
};

function pushCandidate(out: string[], raw: any) {
  const value = String(raw ?? "").trim();
  if (!value || value === "null" || value === "undefined" || out.includes(value)) return;
  // ns_call_id may be our local synthetic key: ext:start:from:to:duration.
  if (value.includes("sip:") || value.split(":").length > 3) return;
  out.push(value);
}

function lookupCallIds(...sources: any[]): string[] {
  const ids: string[] = [];
  const callIdKeys = [
    // NetSapiens recording endpoint expects call-id, not the local UUID.
    "call-id", "call_id", "callid",
    "call-orig-call-id", "orig-callid", "orig-call-id", "orig_callid",
    "call-term-call-id", "term-callid", "term-call-id", "term_callid",
    "call-through-call-id", "by-callid", "by_callid",
    "call-parent-call-id",
    // Last resort only: CDR id often 404s for recordings, but keep it for installs
    // where the recording API is keyed by CDR id.
    "call-parent-cdr-id", "cdr_id", "cdr-id", "id", "uuid",
  ];
  for (const source of sources) {
    if (!source) continue;
    for (const key of callIdKeys) pushCandidate(ids, source[key]);
  }
  return ids;
}

async function nsFetch(path: string) {
  const r = await fetch(`${NS_API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${NS_API_KEY}`, Accept: "application/json" },
  });
  const text = await r.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: r.ok, status: r.status, data };
}

async function responseJson(r: Response) {
  const text = await r.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: r.ok, status: r.status, data };
}

function accessUrl(raw: any): string | null {
  const first = Array.isArray(raw) ? raw[0] : raw;
  return val(first, ["file-access-url", "file_access_url", "recording_url", "recording-url", "url"], null);
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
  return s.replace(/^\/ns-api\/v2/i, "");
}

function transcriptionPath(raw: any): string | null {
  return normalizeNsPath(val(raw, ["transcription_path", "prefilled-transcription-api", "transcription_url", "transcription-url", "transcript_url", "transcript-url"], null));
}

function withQueryParam(path: string, key: string, value: string): string {
  const [base, query = ""] = path.split("?");
  const qs = new URLSearchParams(query);
  if (!qs.get(key)) qs.set(key, value);
  return `${base}?${qs.toString()}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    if (!NS_API_KEY) return json({ error: "NS_API_KEY missing" }, 500);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = auth.replace(/^Bearer\s+/i, "");
    if (token !== SUPABASE_SERVICE_ROLE_KEY) {
      const { data: userData } = await admin.auth.getUser(token);
      if (!userData?.user) return json({ error: "Unauthorized" }, 401);
      const { data: isAdmin } = await admin.rpc("is_planipret_admin", { _user_id: userData.user.id });
      const { data: isMember } = await admin.rpc("is_planipret_member", { _user_id: userData.user.id });
      if (isAdmin !== true && isMember !== true) return json({ error: "Forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const callRowId = body.call_row_id ?? body.id;
    const force = body.force === true;
    if (!callRowId) return json({ error: "call_row_id required" }, 400);

    const { data: row, error: rowErr } = await admin
      .from("planipret_phone_calls")
      .select("id, ns_call_id, ns_domain, extension, recording_url, metadata")
      .eq("id", callRowId)
      .maybeSingle();
    if (rowErr || !row) return json({ error: "call not found" }, 404);

    if (!force && row.recording_url && String(row.recording_url).startsWith("http")) {
      return json({ ok: true, recording_url: row.recording_url, cached: true });
    }

    const domain = row.ns_domain || NS_DEFAULT_DOMAIN;
    const meta: any = row.metadata ?? {};
    const nsRaw = meta.ns_recording ?? meta;
    const directUrl = val(nsRaw, [
      "file-access-url", "file_access_url", "recording_url", "recording-url",
      "recording", "recording-file", "recording_file", "download_url", "url",
    ], null);
    if (directUrl && String(directUrl).startsWith("http")) {
      await admin.from("planipret_phone_calls").update({
        recording_url: directUrl,
        metadata: { ...meta, recording_access_url_resolved: true, recording_resolution: { source: "metadata_direct_url" } },
      }).eq("id", row.id);
      return json({ ok: true, recording_url: directUrl, cached: false, source: "metadata_direct_url" });
    }

    const transcriptionAttempts: Array<{ path: string; status: number; ok: boolean; detail?: any }> = [];
    const txPath = transcriptionPath(nsRaw) ?? transcriptionPath(meta);
    const preliminaryIds = lookupCallIds(nsRaw, meta, { ns_call_id: row.ns_call_id });
    if (txPath) {
      const txPaths = [txPath, ...preliminaryIds.map((id) => withQueryParam(txPath, "callid", id))];
      for (const path of Array.from(new Set(txPaths))) {
        const tx = await nsFetch(path);
        transcriptionAttempts.push({ path, status: tx.status, ok: tx.ok, detail: tx.ok ? undefined : tx.data });
        if (tx.ok) {
          const txData = Array.isArray(tx.data) ? tx.data[0] : tx.data;
          nsRaw["call-id"] = nsRaw["call-id"] ?? txData?.["call-id"];
          nsRaw["geo-call-id"] = nsRaw["geo-call-id"] ?? txData?.["geo-call-id"];
          nsRaw["call-orig-call-id"] = nsRaw["call-orig-call-id"] ?? txData?.["call-orig-call-id"] ?? txData?.orig_callid;
          nsRaw["call-term-call-id"] = nsRaw["call-term-call-id"] ?? txData?.["call-term-call-id"] ?? txData?.term_callid;
          nsRaw["call-through-call-id"] = nsRaw["call-through-call-id"] ?? txData?.["call-through-call-id"] ?? txData?.by_callid;
          break;
        }
      }
    }

    const ids = lookupCallIds(nsRaw, meta, { ns_call_id: row.ns_call_id });
    if (!ids.length) return json({ ok: false, fallback: true, error: "NO_NS_CALL_ID", hint: "Aucun identifiant NetSapiens exploitable sur cet appel." }, 200);

    const attempts: Array<{ path: string; status: number; ok: boolean; detail?: any }> = [];
    let url: string | null = null;
    let sourcePath: string | null = null;
    const D = encodeURIComponent(domain);
    const E = row.extension ? encodeURIComponent(String(row.extension)) : null;
    const { data: brokerProfile } = row.extension ? await admin
      .from("planipret_profiles")
      .select("id, extension, ns_jwt, ns_refresh_token, ns_jwt_expires_at")
      .eq("extension", String(row.extension))
      .maybeSingle() : { data: null } as any;

    const fetchWithFallbackAuth = async (path: string) => {
      const out: Array<{ auth: string; ok: boolean; status: number; data: any }> = [];
      const apiKeyRes = await nsFetch(path);
      out.push({ auth: "api_key", ...apiKeyRes });
      if (!apiKeyRes.ok && brokerProfile) {
        try {
          const brokerRes = await nsBrokerFetch(admin, brokerProfile, path, { method: "GET" });
          out.push({ auth: "broker_jwt", ...(await responseJson(brokerRes)) });
        } catch (e) {
          out.push({ auth: "broker_jwt", ok: false, status: 0, data: { message: (e as Error).message } });
        }
      }
      return out;
    };

    for (const id of ids) {
      const paths = [
        `/domains/${D}/recordings/${encodeURIComponent(id)}`,
        ...(E ? [`/domains/${D}/users/${E}/recordings/${encodeURIComponent(id)}`] : []),
      ];
      for (const path of paths) {
        const results = await fetchWithFallbackAuth(path);
        for (const r of results) {
          attempts.push({ path: `${path} [${r.auth}]`, status: r.status, ok: r.ok, detail: r.ok ? undefined : r.data });
          if (!r.ok) continue;
          url = accessUrl(r.data);
          sourcePath = path;
          if (url) break;
        }
        if (url) break;
      }
      if (url) break;
    }

    if (!url) return json({
      ok: false,
      fallback: true,
      error: attempts.some((a) => a.status === 404) ? "RECORDING_NOT_FOUND" : "NO_ACCESS_URL",
      hint: "Aucune URL audio valide n'a été retournée. L'appel peut être non enregistré, l'archive peut être expirée, ou l'identifiant CDR n'est pas accepté par l'endpoint d'enregistrement.",
      attempted_ids: ids,
      attempts: [...transcriptionAttempts, ...attempts],
    }, 200);

    await admin.from("planipret_phone_calls").update({
      recording_url: url,
      metadata: { ...meta, recording_access_url_resolved: true, recording_api_path: sourcePath, recording_resolution: { attempted_ids: ids, attempts: [...transcriptionAttempts, ...attempts] } },
    }).eq("id", row.id);

    return json({ ok: true, recording_url: url, cached: false, source: sourcePath });
  } catch (e) {
    return json({ ok: false, fallback: true, error: "RECORDING_RESOLVE_FAILED", hint: (e as Error).message }, 200);
  }
});
