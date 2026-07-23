// Health check for softphone-credentials lookup.
// Verifies env vars, service-role DB access, current-user lookup,
// and extension-300 fallback. Never returns the SIP password.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const mask = (v?: string | null) =>
  !v ? null : v.length <= 4 ? "****" : `${"*".repeat(Math.max(0, v.length - 2))}${v.slice(-2)}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const reqId = crypto.randomUUID().slice(0, 8);
  const log = (...args: unknown[]) => console.log(`[softphone-health ${reqId}]`, ...args);
  const checks: Record<string, unknown> = {};
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    checks.env = {
      ok: !!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY),
      hasUrl: !!SUPABASE_URL,
      hasServiceKey: !!SUPABASE_SERVICE_ROLE_KEY,
    };
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ ok: false, error: "MISSING_ENV", checks }, 500);
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Service-role DB reachability
    const { error: pingErr } = await supabaseAdmin
      .from("pbx_softphone_users")
      .select("extension", { count: "exact", head: true });
    checks.service_role_db = { ok: !pingErr, error: pingErr?.message || null };

    // Current user lookup (optional — only if Authorization provided)
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      const user = userData?.user || null;
      checks.current_user = {
        ok: !!user,
        user_id: user?.id || null,
        email: user?.email || null,
        error: userErr?.message || null,
      };
      if (user) {
        const { data: sp, error: spErr } = await supabaseAdmin
          .from("pbx_softphone_users")
          .select("extension, display_name, sip_password, wss_url, sip_domain, account_status, portal_user_id")
          .eq("portal_user_id", user.id)
          .maybeSingle();
        checks.current_user_lookup = {
          ok: !!sp,
          found: !!sp,
          extension: sp?.extension || null,
          has_password: !!sp?.sip_password,
          masked_password: mask(sp?.sip_password),
          wss_url: sp?.wss_url || null,
          sip_domain: sp?.sip_domain || null,
          account_status: sp?.account_status || null,
          error: spErr?.message || null,
        };
      }
    } else {
      checks.current_user = { ok: false, skipped: true, reason: "no Authorization header" };
    }

    // Extension 300 fallback
    const { data: ext300, error: ext300Err } = await supabaseAdmin
      .from("pbx_softphone_users")
      .select("extension, display_name, sip_password, wss_url, sip_domain, account_status, portal_user_id")
      .eq("extension", "300")
      .maybeSingle();
    checks.extension_300 = {
      ok: !!ext300 && !!ext300.sip_password,
      found: !!ext300,
      display_name: ext300?.display_name || null,
      has_password: !!ext300?.sip_password,
      masked_password: mask(ext300?.sip_password),
      wss_url: ext300?.wss_url || null,
      sip_domain: ext300?.sip_domain || null,
      account_status: ext300?.account_status || null,
      linked_to_user: !!ext300?.portal_user_id,
      error: ext300Err?.message || null,
    };

    const ok = Object.values(checks).every((c) =>
      typeof c === "object" && c !== null && (c as any).ok !== false
    );
    log("result", { ok, checks });
    return json({ ok, checks }, ok ? 200 : 503);
  } catch (err) {
    console.error(`[softphone-health ${reqId}] fatal`, err);
    return json({ ok: false, error: String(err), checks }, 500);
  }
});
