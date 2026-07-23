import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const NS_API_KEY = Deno.env.get("NS_API_KEY");
  const NS_API_BASE_URL = Deno.env.get("NS_API_BASE_URL") ?? "https://voice.ava-telecom.ca/ns-api/v2";
  const NS_DOMAIN = Deno.env.get("NS_DEFAULT_DOMAIN") ?? Deno.env.get("NS_API_DOMAIN") ?? "planipret.ca";

  if (!NS_API_KEY) {
    return new Response(JSON.stringify({ error: "NS_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const headers = { Authorization: `Bearer ${NS_API_KEY}`, Accept: "application/json" };
  const attempts: any[] = [];

  const paths = [
    `/domains/${encodeURIComponent(NS_DOMAIN)}/cdrs?limit=1`,
    `/domains/~/cdrs?limit=1`,
    `/domains/${encodeURIComponent(NS_DOMAIN)}/cdrs`,
  ];

  let cdr: any = null;
  let raw: any = null;
  for (const p of paths) {
    const url = `${NS_API_BASE_URL}${p}`;
    try {
      const res = await fetch(url, { headers });
      const text = await res.text();
      let parsed: any = null;
      try { parsed = JSON.parse(text); } catch {}
      attempts.push({ url, status: res.status, sample: text.slice(0, 300) });
      if (res.ok && parsed) {
        const first = Array.isArray(parsed) ? parsed[0] : parsed?.data?.[0] ?? parsed;
        if (first && typeof first === "object") {
          cdr = first;
          raw = parsed;
          break;
        }
      }
    } catch (e) {
      attempts.push({ url, error: (e as Error).message });
    }
  }

  return new Response(
    JSON.stringify({
      ns_domain: NS_DOMAIN,
      base_url: NS_API_BASE_URL,
      all_cdr_fields: cdr ? Object.keys(cdr) : [],
      cdr_raw: cdr,
      raw_sample: Array.isArray(raw) ? { count: raw.length } : null,
      attempts,
    }, null, 2),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
