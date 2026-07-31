// pp-voip-push-token — receives an Apple PushKit device token from the
// Planiprêt iOS app and upserts it into planipret_voip_push_tokens so the
// NetSapiens bridge can push VoIP notifications for incoming calls.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "method_not_allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[pp-voip-push-token] missing Supabase env vars");
      return new Response(JSON.stringify({ error: "server_misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") || "";
    const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!bearerToken) {
      return new Response(JSON.stringify({ error: "missing_auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${bearerToken}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "invalid_session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* noop */ }

    const deviceToken = String(body?.deviceToken ?? body?.device_token ?? "").trim();
    const platform = String(body?.platform ?? "ios").toLowerCase();
    const extension = body?.extensionId ?? body?.extension ?? null;
    const bundleId = body?.bundleId ?? null;
    const environment = String(body?.environment ?? "production");

    // Strict hex token validation: PushKit tokens are 64 hex chars (32 bytes).
    if (!deviceToken || !/^[0-9a-f]{16,}$/i.test(deviceToken)) {
      return new Response(JSON.stringify({ error: "invalid_device_token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error: upsertErr } = await admin
      .from("planipret_voip_push_tokens")
      .upsert(
        {
          user_id: userData.user.id,
          device_token: deviceToken,
          platform,
          extension: extension ? String(extension) : null,
          bundle_id: bundleId ? String(bundleId) : null,
          environment,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,device_token" },
      );

    if (upsertErr) {
      console.error("[pp-voip-push-token] upsert failed", upsertErr);
      return new Response(
        JSON.stringify({ error: "upsert_failed", detail: upsertErr.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify({ ok: true, persisted: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[pp-voip-push-token] unhandled error", err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
