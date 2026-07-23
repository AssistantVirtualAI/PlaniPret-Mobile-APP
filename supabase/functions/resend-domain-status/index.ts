// Returns Resend verification status for a target domain (default ava-telecom.ca).
// GET / -> { domains: [...], target: { name, status, verified } }
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const TARGET_DEFAULT = "ava-telecom.ca";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) return json({ error: "RESEND_API_KEY not configured" }, 500);

    const url = new URL(req.url);
    const target = (url.searchParams.get("domain") || TARGET_DEFAULT).toLowerCase();

    const r = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${key}` },
    });
    const text = await r.text();
    if (!r.ok) return json({ error: `resend_${r.status}`, body: text.slice(0, 500) }, 502);
    let parsed: any = {};
    try { parsed = JSON.parse(text); } catch { /* ignore */ }
    const domains: any[] = Array.isArray(parsed?.data) ? parsed.data : (Array.isArray(parsed) ? parsed : []);
    const match = domains.find((d) => String(d?.name || "").toLowerCase() === target) || null;
    const status = match?.status || "not_found";
    const verified = status === "verified";
    return json({ target: { name: target, status, verified }, domains });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
