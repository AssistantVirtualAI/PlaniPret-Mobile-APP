// ns-get-transcription — official NS-API v2 transcription fetch (Bearer NS_API_KEY).
// Uses the prefilled NS transcription path when present, then hydrates CDR
// orig/term call IDs because /transcriptions requires those for some calls.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FALLBACK_NS_API_BASE_URL = (Deno.env.get("NS_API_BASE_URL") ?? "https://voice.ava-telecom.ca/ns-api/v2").replace(/\/$/, "");
const FALLBACK_NS_DOMAIN = Deno.env.get("NS_DEFAULT_DOMAIN") ?? Deno.env.get("NS_API_DOMAIN") ?? "planipret.ca";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (p: any, s = 200) => new Response(JSON.stringify(p), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const val = (raw: any, keys: string[], fb: any = null) => {
  for (const k of keys) {
    const v = raw?.[k];
    if (v !== undefined && v !== null && `${v}` !== "") return v;
  }
  return fb;
};

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

function asArray(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  for (const k of ["data", "cdrs", "items", "results"]) {
    if (Array.isArray(data[k])) return data[k];
  }
  return [data];
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

async function nsJson(path: string, cfg: { baseUrl: string; apiKey: string }) {
  const r = await fetch(`${cfg.baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}`, Accept: "application/json" },
  });
  const rawText = await r.text();
  let data: any = null;
  try { data = JSON.parse(rawText); } catch { data = rawText; }
  return { ok: r.ok, status: r.status, data, rawText };
}

function extractTranscript(item: any): any {
  if (!item) return null;
  if (typeof item === "string") return item.length > 5 ? item : null;
  return item["transcription-text"]
    ?? item["transcript-text"]
    ?? item["call-intelligence-transcript"]
    ?? item["call-transcript"]
    ?? item["transcript"]
    ?? item["text"]
    ?? item["body"]
    ?? item["asr-text"]
    ?? item["sentiment-transcript"]
    ?? item["call-intelligence-segments"]
    ?? item.segments
    ?? null;
}

function parseTranscript(raw: any): Array<{ speaker: string; text: string }> {
  if (!raw) return [];
  if (typeof raw === "string") {
    return raw.split(/\r?\n/).filter((l) => l.trim()).map((line) => {
      const m = line.match(/^([^:]{1,40}):\s*(.+)$/);
      return m ? { speaker: m[1].trim(), text: m[2].trim() } : { speaker: "Speaker", text: line.trim() };
    });
  }
  if (Array.isArray(raw)) {
    return raw.map((s: any) => ({
      speaker: s.speaker ?? s.speaker_label ?? s.role ?? s.channel ?? s.name ?? "Speaker",
      text: s.text ?? s.content ?? s.transcript ?? s.comment ?? s["transcription-text"] ?? "",
    })).filter((s) => s.text);
  }
  if (raw.transcript) return parseTranscript(raw.transcript);
  if (raw.segments) return parseTranscript(raw.segments);
  return [];
}

function cdrMatchScore(cdr: any, row: any, knownIds: string[]) {
  let score = 0;
  const cIds: string[] = [];
  addIds(cIds, cdr);
  if (knownIds.some((id) => cIds.includes(id))) score += 100;
  if (row?.extension && ["call-orig-user", "call-term-user", "call-through-user"].some((k) => String(cdr?.[k] ?? "") === String(row.extension))) score += 20;
  const dur = Number(row?.duration_seconds ?? 0);
  const cDur = Number(val(cdr, ["call-talking-duration-seconds", "call-total-duration-seconds", "duration"], 0));
  if (dur && cDur && Math.abs(dur - cDur) <= 3) score += 20;
  const started = row?.started_at ? new Date(row.started_at).getTime() : 0;
  const cStartRaw = val(cdr, ["call-start-datetime", "call-batch-start-datetime", "start-time", "time-start", "started_at"], null);
  const cStart = cStartRaw ? new Date(cStartRaw).getTime() : 0;
  if (started && cStart && Math.abs(started - cStart) <= 120_000) score += 25;
  const from = normalizePhone(row?.from_number);
  const to = normalizePhone(row?.to_number);
  const cFrom = normalizePhone(val(cdr, ["call-orig-from-uri", "from", "from_number"], ""));
  const cTo = normalizePhone(val(cdr, ["call-term-to-uri", "call-orig-to-uri", "to", "to_number", "destination"], ""));
  if (from && cFrom && (from.endsWith(cFrom) || cFrom.endsWith(from))) score += 10;
  if (to && cTo && (to.endsWith(cTo) || cTo.endsWith(to))) score += 10;
  return score;
}

function transcriptionMatches(item: any, knownIds: string[], jobId: string) {
  if (!item || typeof item !== "object") return false;
  const itemIds: string[] = [];
  addIds(itemIds, item);
  if (itemIds.length && knownIds.some((id) => itemIds.includes(id))) return true;
  const itemJob = String(item?.["call-intelligence-job-id"] ?? item?.["job-id"] ?? item?.id ?? item?.["cdr-id"] ?? "").replace(/\.0$/, "").trim();
  return !!jobId && itemJob === jobId;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let cfg;
  try { cfg = await getNsRuntimeConfig(); } catch (e) { return json({ success: false, available: false, reason: "ns_not_configured", error: (e as Error).message }, 200); }

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const url = new URL(req.url);
  const call_db_id = body.call_db_id ?? url.searchParams.get("call_db_id");
  let ns_callid: string | null = body.ns_callid ?? url.searchParams.get("ns_callid") ?? url.searchParams.get("call_id");
  let ns_extension: string | null = body.ns_extension ?? url.searchParams.get("ns_extension");
  let row: any = null;
  let domain = String(body.domain ?? url.searchParams.get("domain") ?? cfg.domain);

  if (call_db_id) {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data } = await admin
      .from("planipret_phone_calls")
        .select("id, ns_call_id, ns_callid, ns_orig_callid, ns_term_callid, ns_domain, extension, metadata, started_at, duration_seconds, from_number, to_number")
      .eq("id", call_db_id)
      .maybeSingle();
    row = data;
    domain = row?.ns_domain || row?.metadata?.domain || domain;
    ns_callid = ns_callid || row?.ns_callid || row?.ns_orig_callid || row?.ns_term_callid || row?.metadata?.["call-parent-cdr-id"] || null;
    ns_extension = ns_extension || row?.extension || null;
  }

  const attempts: any[] = [];
  let transcript: any = null;
  const ids: string[] = [];
  pushId(ids, ns_callid);
  pushId(ids, body.ns_orig_callid ?? url.searchParams.get("ns_orig_callid"));
  pushId(ids, body.ns_term_callid ?? url.searchParams.get("ns_term_callid"));
  addIds(ids, row?.metadata, row);

  const cdrs: any[] = [];
  if (row?.started_at) {
    const D = encodeURIComponent(domain);
    const start = new Date(new Date(row.started_at).getTime() - 180_000).toISOString();
    const end = new Date(new Date(row.started_at).getTime() + (Number(row.duration_seconds ?? 0) + 180) * 1000).toISOString();
    const qs = `datetime-start=${encodeURIComponent(start)}&datetime-end=${encodeURIComponent(end)}&limit=200`;
    const paths = [`/domains/${D}/cdrs?${qs}`];
    if (row.extension) paths.push(`/domains/${D}/users/${encodeURIComponent(row.extension)}/cdrs?${qs}`);
    for (const p of paths) {
      try {
          const r = await nsJson(p, cfg);
        attempts.push({ url: p, status: r.status, kind: "cdr_lookup", body_preview: String(r.rawText).slice(0, 160) });
        if (!r.ok) continue;
          const rows = asArray(r.data)
            .map((cdr) => ({ score: cdrMatchScore(cdr, row, ids), cdr }))
            .filter((x) => x.score >= 60)
            .sort((a, b) => b.score - a.score);
        attempts.push({ url: p, kind: "cdr_matches", count: rows.length, top: rows.slice(0, 5).map((x) => ({ score: x.score, id: x.cdr?.id, orig: x.cdr?.["call-orig-call-id"], term: x.cdr?.["call-term-call-id"] })) });
        for (const m of rows.slice(0, 8)) {
          cdrs.push(m.cdr);
          addIds(ids, m.cdr);
        }
      } catch (e) {
        attempts.push({ url: p, error: (e as Error).message, kind: "cdr_lookup" });
      }
    }
  }

  const D = encodeURIComponent(domain);

  // Direct CDR-by-callid fetch (in case datetime lookup missed the right CDR)
  if (ns_callid) {
    const base = String(ns_callid).split("@")[0];
    for (const cid of Array.from(new Set([ns_callid, base]))) {
      try {
        const r = await nsJson(`/domains/${D}/cdrs/${encodeURIComponent(cid)}`, cfg);
        attempts.push({ url: `/domains/${D}/cdrs/${cid}`, status: r.status, kind: "cdr_by_callid", fields_found: r.ok && r.data && typeof r.data === "object" ? Object.keys(Array.isArray(r.data) ? r.data[0] ?? {} : r.data) : [] });
        if (r.ok) {
          const items = asArray(r.data);
          for (const cdr of items) {
            if (cdrMatchScore(cdr, row, ids) >= 60) {
              cdrs.push(cdr);
              addIds(ids, cdr);
            }
          }
        }
      } catch (e) {
        attempts.push({ url: `/domains/${D}/cdrs/${cid}`, error: (e as Error).message, kind: "cdr_by_callid" });
      }
    }
  }

  // NEW: check "prefilled-transcription-api" (and siblings) directly on each matched CDR.
  // Value may be a full URL, an NS-API path, or an inline transcript string.
  const inlineFields = ["prefilled-transcription-api", "transcription-text", "transcript-text", "call-transcript", "sentiment-transcript", "asr-text"];
  for (const cdr of cdrs) {
    if (transcript) break;
    for (const f of inlineFields) {
      const v = cdr?.[f];
      if (!v) continue;
      const s = String(v).trim();
      if (!s) continue;
      if (s.startsWith("http") || s.startsWith("/")) {
        const path = normalizeNsPath(s);
        if (!path) continue;
        try {
          const r = await nsJson(path, cfg);
          attempts.push({ url: path, status: r.status, kind: `prefilled:${f}`, body_preview: String(r.rawText).slice(0, 300) });
          if (r.ok) {
            const items = Array.isArray(r.data) ? r.data : [r.data];
            for (const item of items) {
              const itemJobId = String(item?.["call-intelligence-job-id"] ?? item?.["job-id"] ?? item?.id ?? item?.["cdr-id"] ?? "").replace(/\.0$/, "").trim();
              const cdrJobId = String(cdr?.["call-intelligence-job-id"] ?? cdr?.id ?? cdr?.["cdr-id"] ?? "").replace(/\.0$/, "").trim();
              if (item && typeof item === "object" && itemJobId && cdrJobId && itemJobId !== cdrJobId) continue;
              const found = extractTranscript(item);
              if (found) { transcript = found; break; }
            }
          }
        } catch (e) {
          attempts.push({ url: path, error: (e as Error).message, kind: `prefilled:${f}` });
        }
      } else if (s.length > 10) {
        transcript = s;
        attempts.push({ kind: `cdr_field:${f}`, body_preview: s.slice(0, 300) });
        break;
      }
    }
  }

  const queries: string[] = [];
  const prefilled = normalizeNsPath(row?.metadata?.transcription_path ?? row?.metadata?.["prefilled-transcription-api"]);
  if (prefilled) queries.push(prefilled);
  // Pull jobId from row metadata OR any matched CDR
  let jobId = String(row?.metadata?.["call-intelligence-job-id"] ?? "").replace(/\.0$/, "").trim();
  if (!jobId) {
    for (const cdr of cdrs) {
      const j = String(cdr?.["call-intelligence-job-id"] ?? cdr?.id ?? cdr?.["cdr-id"] ?? "").replace(/\.0$/, "").trim();
      if (j) { jobId = j; break; }
    }
  }
  const started = String(row?.metadata?.["call-start-datetime"] ?? row?.started_at ?? "");
  const yyyymm = started ? started.slice(0, 7).replace("-", "") : "";
  for (const cdr of cdrs) {
    const orig = String(val(cdr, ["call-orig-call-id", "orig-callid", "orig_callid"], "")).trim();
    const term = String(val(cdr, ["call-term-call-id", "term-callid", "term_callid"], "")).trim();
    if (jobId && (orig || term)) queries.push(`/domains/${D}/transcriptions?id=${encodeURIComponent(jobId)}${yyyymm ? `&date=${yyyymm}` : ""}&orig_callid=${encodeURIComponent(orig)}&term_callid=${encodeURIComponent(term)}`);
  }
  if (jobId) {
    for (const id of ids.slice(0, 10)) {
      const c = encodeURIComponent(id);
      const date = yyyymm ? `&date=${yyyymm}` : "";
      queries.push(`/domains/${D}/transcriptions?id=${encodeURIComponent(jobId)}${date}&orig_callid=${c}&term_callid=`);
      queries.push(`/domains/${D}/transcriptions?id=${encodeURIComponent(jobId)}${date}&orig_callid=&term_callid=${c}`);
      queries.push(`/domains/${D}/transcriptions?id=${encodeURIComponent(jobId)}${date}&callid=${c}`);
    }
  }
  if (ns_callid) {
    const c = encodeURIComponent(ns_callid);
    queries.push(`/domains/${D}/transcriptions?callid=${c}`);
    queries.push(`/domains/${D}/transcriptions?call-id=${c}`);
    queries.push(`/domains/${D}/transcriptions?orig-callid=${c}`);
    if (ns_extension) queries.push(`/domains/${D}/users/${encodeURIComponent(ns_extension)}/transcriptions?callid=${c}`);
  }
  for (const id of ids) {
    const c = encodeURIComponent(id);
    queries.push(`/domains/${D}/transcriptions?callid=${c}`);
    queries.push(`/domains/${D}/transcriptions?orig-callid=${c}`);
  }

  for (const q of transcript ? [] : Array.from(new Set(queries))) {
    try {
      const r = await nsJson(q, cfg);
      const data = r.data;
      const items = Array.isArray(data) ? data : (data && typeof data === "object" ? [data] : []);
      const fields_found = items[0] && typeof items[0] === "object" ? Object.keys(items[0]) : [];
      let transcript_found = false;
      let localTranscript: any = null;
      for (const item of items) {
        if (item && typeof item === "object" && !transcriptionMatches(item, ids, jobId)) continue;
        const found = extractTranscript(item);
        if (found) { localTranscript = found; transcript_found = true; break; }
      }
      attempts.push({
        url: q,
        status: r.status,
        items_count: items.length,
        fields_found,
        transcript_found,
        body_preview: String(r.rawText).slice(0, 300),
      });
      if (r.ok && localTranscript) { transcript = localTranscript; break; }
    } catch (e) {
      attempts.push({ url: q, error: (e as Error).message });
    }
  }

  if (!transcript) {
    return json({
      success: false,
      available: false,
      reason: "transcript_not_available",
      error: "TRANSCRIPT_NOT_AVAILABLE",
      message: "Transcription non disponible pour cet appel.",
      ns_callid, ns_extension, domain, attempts,
      action_required: "Demandez à Clinton d'activer PORTAL_VOICE_TRANSCRIPTION_SENTIMENT = yes sur planipret.ca",
    }, 200);
  }

  const segments = parseTranscript(transcript);
  if (call_db_id && segments.length) {
    try {
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
      const text = segments.map((s) => `${s.speaker}: ${s.text}`).join("\n");
      await admin.from("planipret_phone_calls").update({
        transcript: text,
        transcript_segments: segments,
        transcript_source: "netsapiens",
        transcript_fetched_at: new Date().toISOString(),
      }).eq("id", call_db_id);
    } catch { /* best-effort cache */ }
  }
  return json({ success: true, available: true, reason: "fresh", ns_callid, domain, segments, raw: transcript });
});
