// ns-test-transcription — probes every plausible NS-API transcription endpoint
// with Jean-Eric Gagnon's known callid (ext 1040) so we can see exactly what
// NS-API returns and which field carries the transcript.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const NS_API_KEY = Deno.env.get("NS_API_KEY");
const NS_API_BASE_URL = (Deno.env.get("NS_API_BASE_URL") ?? "https://voice.ava-telecom.ca/ns-api/v2").replace(/\/$/, "");
const NS_DOMAIN = Deno.env.get("NS_DEFAULT_DOMAIN") ?? Deno.env.get("NS_API_DOMAIN") ?? "planipret.ca";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!NS_API_KEY) {
    return new Response(JSON.stringify({ error: "NS_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }

  const KNOWN_CALLID = body.ns_callid ?? "17831064240aca36359ebecdb64751714dec961ff5";
  const KNOWN_EXT = body.ns_extension ?? "1040";
  const D = encodeURIComponent(NS_DOMAIN);
  const C = encodeURIComponent(KNOWN_CALLID);
  const E = encodeURIComponent(KNOWN_EXT);

  const endpoints = [
    `${NS_API_BASE_URL}/domains/${D}/users/${E}/recordings/${C}`,
    `${NS_API_BASE_URL}/domains/${D}/transcriptions`,
    `${NS_API_BASE_URL}/domains/${D}/transcriptions?limit=1`,
    `${NS_API_BASE_URL}/domains/${D}/transcriptions?callid=${C}`,
    `${NS_API_BASE_URL}/domains/${D}/transcriptions?call-id=${C}`,
    `${NS_API_BASE_URL}/domains/${D}/transcriptions?orig-callid=${C}`,
    `${NS_API_BASE_URL}/domains/${D}/users/${E}/transcriptions`,
    `${NS_API_BASE_URL}/domains/${D}/users/${E}/transcriptions/${C}`,
    `${NS_API_BASE_URL}/domains/${D}/cdrs/${C}`,
    `${NS_API_BASE_URL}/domains/${D}/users/${E}/cdrs?limit=1`,
  ];

  const nsH = { Authorization: `Bearer ${NS_API_KEY}`, Accept: "application/json" };
  const results: any[] = [];

  for (const url of endpoints) {
    try {
      const r = await fetch(url, { headers: nsH });
      const ct = r.headers.get("Content-Type") || "";
      const raw = await r.text();
      let parsed: any = null;
      try { parsed = JSON.parse(raw); } catch { parsed = raw; }
      const isArr = Array.isArray(parsed);
      const firstItem = isArr ? parsed[0] : (parsed && typeof parsed === "object" ? parsed : null);
      results.push({
        url,
        status: r.status,
        content_type: ct,
        body_type: isArr ? "array" : typeof parsed,
        body_length: isArr ? parsed.length : (typeof parsed === "string" ? parsed.length : (firstItem ? Object.keys(firstItem).length : 0)),
        fields: firstItem && typeof firstItem === "object" ? Object.keys(firstItem) : [],
        body_preview: (typeof raw === "string" ? raw : JSON.stringify(parsed)).slice(0, 600),
      });
    } catch (e: any) {
      results.push({ url, error: e?.message ?? String(e) });
    }
  }

  return new Response(JSON.stringify({ callid: KNOWN_CALLID, extension: KNOWN_EXT, domain: NS_DOMAIN, results }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
