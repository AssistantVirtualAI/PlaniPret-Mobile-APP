// pp-ns-health — read-only NetSapiens health probe (no writes, no SMS, no calls).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const NS_API_BASE_URL = (Deno.env.get("NS_API_BASE_URL") ?? "https://voice.ava-telecom.ca/ns-api/v2").replace(/\/$/, "");
const NS_API_KEY = Deno.env.get("NS_API_KEY") ?? "";
const NS_DEFAULT_DOMAIN = Deno.env.get("NS_DEFAULT_DOMAIN") ?? "planipret.ca";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function probe(path: string) {
  const url = `${NS_API_BASE_URL}${path}`;
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", Authorization: `Bearer ${NS_API_KEY}` },
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    const arr = Array.isArray(data)
      ? data
      : (data && typeof data === "object"
        ? (["data", "users", "cdrs", "items", "messages", "voicemails", "recordings", "subscriptions", "results"]
          .map((k) => data[k]).find(Array.isArray) ?? null)
        : null);
    return {
      path,
      status: res.status,
      ok: res.ok,
      ms: Date.now() - t0,
      count: Array.isArray(arr) ? arr.length : null,
      sample: res.ok ? undefined : text.slice(0, 300),
    };
  } catch (e) {
    return { path, status: 0, ok: false, ms: Date.now() - t0, count: null, sample: String((e as Error)?.message ?? e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const apikey = req.headers.get("apikey") ?? "";
  // Read-only status probe: no NS data is returned, only HTTP status codes and counts.
  void token; void apikey;
  void SERVICE_ROLE;

  const D = encodeURIComponent(NS_DEFAULT_DOMAIN);
  const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const ext = String((await req.json().catch(() => ({})))?.extension ?? "113");
  const U = encodeURIComponent(ext);
  const paths = [
    `/domains/${D}`,
    `/domains/${D}/users?limit=1`,
    `/domains/${D}/calls`,
    `/domains/${D}/cdrs?limit=5&start-date=${since}`,
    `/domains/${D}/cdrs/count?start-date=${since} 00:00:00&end-date=${today} 23:59:59`,
    `/domains/${D}/cdrs?limit=200&start-date=${since} 00:00:00&end-date=${today} 23:59:59`,
    `/domains/${D}/users/${U}/cdrs?limit=5&start-date=${since}`,
    `/domains/${D}/users/${U}/devices`,
    `/domains/${D}/users/${U}/messagesessions?limit=3`,
    `/domains/${D}/users/${U}/voicemails/new`,
    `/subscriptions`,
  ];

  const results = [];
  for (const p of paths) results.push(await probe(p));

  // Subscription summary (models + whether they point at our receiver, no secrets revealed)
  let subs: any[] = [];
  try {
    const r = await fetch(`${NS_API_BASE_URL}/subscriptions`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${NS_API_KEY}` },
      signal: AbortSignal.timeout(20000),
    });
    const d = await r.json().catch(() => null);
    const arr = Array.isArray(d) ? d : (d?.subscriptions ?? d?.data ?? []);
    subs = (arr ?? []).map((s: any) => {
      const url = String(s["post-url"] ?? s.post_url ?? s.url ?? "");
      return {
        model: s.model ?? s.event ?? null,
        domain: s.domain ?? null,
        targets_receiver: url.includes("ns-webhook-receiver"),
        has_secret: /[?&]secret=/.test(url),
      };
    });
  } catch { /* ignore */ }

  return json({
    subscriptions: subs,
    base: NS_API_BASE_URL,
    domain: NS_DEFAULT_DOMAIN,
    api_key_present: !!NS_API_KEY,
    checked_at: new Date().toISOString(),
    results,
  });
});
