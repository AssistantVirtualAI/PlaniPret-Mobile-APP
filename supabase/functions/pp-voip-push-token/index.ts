// pp-voip-push-token — receives an Apple PushKit device token from the
// Planiprêt iOS app and upserts it into planipret_voip_push_tokens so the
// NetSapiens bridge can push VoIP notifications for incoming calls.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return new Response(JSON.stringify({ error: "missing_auth" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "invalid_session" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* noop */ }

  const deviceToken = String(body?.deviceToken || body?.device_token || "").trim();
  const platform = String(body?.platform || "ios").toLowerCase();
  const extension = body?.extensionId || body?.extension || null;
  const bundleId = body?.bundleId || null;
  const environment = body?.environment || "production";

  if (!deviceToken || deviceToken.length < 8) {
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
        environment: String(environment),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,device_token" },
    );

  if (upsertErr) {
    console.error("[pp-voip-push-token] upsert failed", upsertErr);
    return new Response(JSON.stringify({ error: "upsert_failed", detail: upsertErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
