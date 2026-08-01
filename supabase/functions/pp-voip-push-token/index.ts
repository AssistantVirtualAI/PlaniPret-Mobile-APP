// pp-voip-push-token — receives an Apple PushKit device token from the
// Planiprêt iOS app and upserts it into planipret_voip_push_tokens so the
// NetSapiens bridge can push VoIP notifications for incoming calls.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "backend_not_configured" }, 503);

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return json({ error: "missing_auth" }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return json({ error: "invalid_session" }, 401);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const deviceToken = String(body?.deviceToken || body?.device_token || "").trim();
  const platform = String(body?.platform || "ios").toLowerCase();
  const extension = body?.extensionId || body?.extension || null;
  const bundleId = body?.bundleId || null;
  const environment = body?.environment || "production";

  if (platform !== "ios" && platform !== "android") return json({ error: "invalid_platform" }, 400);
  // iOS PushKit tokens are hex; Android FCM tokens are longer opaque strings.
  const tokenValid = platform === "ios"
    ? /^[a-fA-F0-9]{32,512}$/.test(deviceToken)
    : /^[\w:.~-]{64,4096}$/.test(deviceToken);
  if (!tokenValid) return json({ error: "invalid_device_token" }, 400);
  if (environment !== "production" && environment !== "sandbox") return json({ error: "invalid_environment" }, 400);
  if (extension && String(extension).length > 64) return json({ error: "invalid_extension" }, 400);
  if (bundleId && String(bundleId).length > 255) return json({ error: "invalid_bundle_id" }, 400);

  const admin = createClient(supabaseUrl, serviceKey);
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
    return json({ error: "upsert_failed" }, 500);
  }

  return json({ ok: true, persisted: true }, 200);
  } catch (error) {
    console.error("[pp-voip-push-token] unhandled", error instanceof Error ? error.message : String(error));
    return json({ error: "internal_error" }, 500);
  }
});
