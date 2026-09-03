// pp-appreview-sms-setup — ensures the App Review demo extension has a DID
// attached as an SMS-capable number in NetSapiens, and reports the state of
// the messaging endpoints used by the mobile Messages tab.
// Admin-only.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const NS_API_KEY = Deno.env.get("NS_API_KEY");
  const NS_BASE = Deno.env.get("NS_API_BASE_URL") ?? "https://voice.ava-telecom.ca/ns-api/v2";

  const setupToken = Deno.env.get("APPREVIEW_SETUP_TOKEN");
  const providedToken = req.headers.get("x-setup-token");
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  if (!(setupToken && providedToken && providedToken === setupToken)) {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const { data: userData } = await admin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);
    const { data: isAdmin } = await admin.rpc("is_planipret_admin", { _user_id: userData.user.id });
    if (isAdmin !== true) return json({ error: "Forbidden" }, 403);
  }

  if (!NS_API_KEY) return json({ error: "ns_api_key_missing" }, 500);

  const body = await req.json().catch(() => ({} as any));
  const ext = String(body?.extension ?? "1999");
  const domain = String(body?.domain ?? Deno.env.get("NS_DEFAULT_DOMAIN") ?? "planipret.ca");

  const H = { Authorization: `Bearer ${NS_API_KEY}`, "Content-Type": "application/json", Accept: "application/json" };
  const call = async (path: string, init: RequestInit = {}) => {
    const r = await fetch(`${NS_BASE}${path}`, { ...init, headers: H });
    const text = await r.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { ok: r.ok, status: r.status, data };
  };

  const userBase = `/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(ext)}`;
  const out: Record<string, any> = { extension: ext, domain };

  // 1. DID assigned to this extension in our DB
  const { data: didRow } = await admin
    .from("planipret_did_assignments")
    .select("phone_number_e164,phone_number_digits")
    .eq("extension", ext)
    .maybeSingle();
  out.did = didRow ?? null;
  const digits = String(didRow?.phone_number_digits ?? "").replace(/\D/g, "");

  // 2. Current SMS numbers in NS
  out.smsnumbers_before = await call(`${userBase}/smsnumbers`);

  // 3. Attach the DID as an SMS number if it isn't already there
  if (digits) {
    const list = Array.isArray(out.smsnumbers_before.data)
      ? out.smsnumbers_before.data
      : (out.smsnumbers_before.data?.smsnumbers ?? []);
    const already = (list ?? []).some((n: any) =>
      String(n?.["from-number"] ?? n?.number ?? n ?? "").replace(/\D/g, "").endsWith(digits.slice(-10)));
    if (!already) {
      out.attach = await call(`${userBase}/smsnumbers`, {
        method: "POST",
        body: JSON.stringify({ "from-number": digits, number: digits, application: "user", user: ext, domain }),
      });
      out.smsnumbers_after = await call(`${userBase}/smsnumbers`);
    } else {
      out.attach = { skipped: "already_attached" };
    }
  }

  // 4. Probe the endpoint the Messages tab uses
  out.messagesessions = await call(`${userBase}/messagesessions?limit=5`);

  return json({ success: true, ...out });
});
