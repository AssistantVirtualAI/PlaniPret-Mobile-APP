// ns-debug-real-cdr — diagnostic: find the real recording URL format
// Fetches recent CDRs, tries every possible callid field against multiple
// recording endpoint variants (v2 user-scoped, v2 domain-scoped, v1 legacy).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const NS_API_KEY = Deno.env.get("NS_API_KEY") ?? "";
const NS_API_BASE_URL = Deno.env.get("NS_API_BASE_URL") ?? "https://voice.ava-telecom.ca/ns-api/v2";
const NS_DOMAIN = Deno.env.get("NS_DEFAULT_DOMAIN") ?? "planipret.ca";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!NS_API_KEY) return json({ error: "NS_API_KEY not configured" }, 500);

  const nsH = { Authorization: `Bearer ${NS_API_KEY}`, Accept: "application/json" };

  const cdrRes = await fetch(`${NS_API_BASE_URL}/domains/${encodeURIComponent(NS_DOMAIN)}/cdrs?limit=20`, { headers: nsH });
  let cdrs: any;
  try { cdrs = await cdrRes.json(); } catch { cdrs = null; }

  const list: any[] = Array.isArray(cdrs) ? cdrs : (cdrs?.data ?? cdrs?.cdrs ?? []);
  const recorded = list.filter((c: any) => parseInt(c?.duration || c?.["call-duration"] || "0") > 30);
  const sample = recorded[0] || list[0] || null;

  const recording_endpoint_tests: Record<string, any> = {};
  const v1_recording_endpoint_tests: Record<string, any> = {};

  if (sample) {
    const possibleIds = [
      sample["orig-callid"], sample["term-callid"], sample["call-id"],
      sample["callid"], sample["id"], sample["session-id"], sample["cdr-id"],
    ].filter(Boolean);
    const ext = sample["orig-sub"] || sample["term-sub"] || sample["orig-user"] || sample["term-user"] || "1040";

    for (const id of possibleIds) {
      const idStr = String(id);
      const variants = Array.from(new Set([idStr, encodeURIComponent(idStr), idStr.split("@")[0], encodeURIComponent(idStr.split("@")[0])]));
      for (const v of variants) {
        const targets = [
          { label: `v2/users/${ext}/${v}`, url: `${NS_API_BASE_URL}/domains/${encodeURIComponent(NS_DOMAIN)}/users/${encodeURIComponent(ext)}/recordings/${v}` },
          { label: `v2/domain/${v}`, url: `${NS_API_BASE_URL}/domains/${encodeURIComponent(NS_DOMAIN)}/recordings/${v}` },
          { label: `v2/tilde/${v}`, url: `${NS_API_BASE_URL}/domains/~/users/~/recordings/${v}` },
        ];
        for (const t of targets) {
          try {
            const r = await fetch(t.url, { headers: nsH });
            const ct = r.headers.get("Content-Type") ?? "";
            const cl = r.headers.get("Content-Length") ?? "";
            // Drain body to avoid resource leak
            try { await r.arrayBuffer(); } catch { /* ignore */ }
            recording_endpoint_tests[`${idStr} | ${t.label}`] = { url: t.url, status: r.status, content_type: ct, content_length: cl, is_audio: ct.includes("audio") || ct.includes("octet-stream") };
          } catch (e) {
            recording_endpoint_tests[`${idStr} | ${t.label}`] = { url: t.url, error: (e as Error).message };
          }
        }
      }
    }

    // NS-API v1 legacy (Bearer only — no uid/pass in URL for security)
    const v1Base = NS_API_BASE_URL.replace(/\/v2\/?$/, "");
    const primaryId = sample["orig-callid"] || sample["term-callid"] || "";
    if (primaryId) {
      const encoded = encodeURIComponent(primaryId);
      const v1urls = [
        { label: "v1_callid", url: `${v1Base}/?object=recording&action=read&domain=${encodeURIComponent(NS_DOMAIN)}&callid=${encoded}` },
        { label: "v1_orig_callid", url: `${v1Base}/?object=recording&action=read&domain=${encodeURIComponent(NS_DOMAIN)}&orig-callid=${encoded}` },
      ];
      for (const t of v1urls) {
        try {
          const r = await fetch(t.url, { headers: nsH });
          const ct = r.headers.get("Content-Type") ?? "";
          const cl = r.headers.get("Content-Length") ?? "";
          try { await r.arrayBuffer(); } catch { /* ignore */ }
          v1_recording_endpoint_tests[t.label] = { url: t.url, status: r.status, content_type: ct, content_length: cl };
        } catch (e) {
          v1_recording_endpoint_tests[t.label] = { url: t.url, error: (e as Error).message };
        }
      }
    }
  }

  const successes = Object.entries(recording_endpoint_tests)
    .filter(([_, v]: any) => v?.status === 200 && (v?.is_audio || parseInt(v?.content_length || "0") > 1000))
    .map(([k, v]) => ({ key: k, ...(v as any) }));

  return json({
    total_cdrs: list.length,
    recorded_calls_found: recorded.length,
    successes,
    sample_cdr_all_fields: sample,
    all_field_names: sample ? Object.keys(sample) : [],
    recording_endpoint_tests,
    v1_recording_endpoint_tests,
    next_step: successes.length ? "Use the URL pattern in 'successes' as first attempt in ns-get-recording." : "No endpoint returned audio — check NS portal DevTools for the real URL format.",
  });
});
