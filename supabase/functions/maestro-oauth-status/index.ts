// maestro-oauth-status — authenticated. Returns the connection status for the
// current broker (reads planipret_profiles) and falls back to the global secret
// store for legacy pre-per-user tokens.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getMaestroOAuthEnv, isMaestroOAuthConfigured } from "../_shared/maestro-oauth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const env = getMaestroOAuthEnv();
  const configured = isMaestroOAuthConfigured(env);

  const authHeader = req.headers.get("Authorization") ?? "";
  let userId: string | null = null;
  if (authHeader.startsWith("Bearer ")) {
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u } = await userClient.auth.getUser();
    userId = u?.user?.id ?? null;
  }

  const origin = req.headers.get("origin") ?? "https://avastatistic.ca";
  const redirectUri = `${origin}/auth/maestro/callback`;

  // Per-user status (preferred)
  let status: "connected" | "pending" | "not_configured" | "disconnected" | "error" = "disconnected";
  let lastConnectedAt: string | null = null;
  let expiresIn: number | null = null;
  let maestroBrokerId: string | null = null;
  let maestroEmail: string | null = null;
  let lastError: { message: string; at: string | null; http_status?: number } | null = null;
  let pendingCount = 0;

  if (userId) {
    const { data: prof } = await admin
      .from("planipret_profiles")
      .select("maestro_broker_id, maestro_email, maestro_broker_token, maestro_token_expires_at, maestro_last_sync_at, maestro_connected")
      .eq("user_id", userId)
      .maybeSingle();
    if (prof?.maestro_broker_token) {
      status = "connected";
      lastConnectedAt = (prof as any).maestro_last_sync_at ?? null;
      const expAt = (prof as any).maestro_token_expires_at ? Date.parse((prof as any).maestro_token_expires_at) : 0;
      expiresIn = expAt ? Math.max(0, Math.floor((expAt - Date.now()) / 1000)) : null;
      maestroBrokerId = (prof as any).maestro_broker_id ?? null;
      maestroEmail = (prof as any).maestro_email ?? null;
    }
  }

  // Fallback to global legacy tokens if nothing per-user
  if (status !== "connected") {
    const { data: connected } = await admin
      .from("planipret_integration_secrets")
      .select("value, updated_at")
      .eq("provider", "maestro_oauth")
      .order("updated_at", { ascending: false })
      .limit(1);
    if (connected && connected.length > 0) {
      status = "connected";
      lastConnectedAt = (connected[0] as any).updated_at ?? null;
      try {
        const parsed = JSON.parse((connected[0] as any).value ?? "{}");
        expiresIn = parsed?.expires_in ?? null;
      } catch { /* ignore */ }
    }
  }

  const { data: pending } = await admin
    .from("planipret_integration_secrets")
    .select("key_name")
    .eq("provider", "maestro_oauth_pending")
    .limit(5);
  pendingCount = pending?.length ?? 0;

  const { data: errRows } = await admin
    .from("planipret_integration_secrets")
    .select("value, updated_at")
    .eq("provider", "maestro_oauth_error")
    .order("updated_at", { ascending: false })
    .limit(1);
  if (errRows && errRows.length > 0) {
    try {
      const parsed = JSON.parse((errRows[0] as any).value ?? "{}");
      lastError = { message: parsed?.error ?? "Erreur inconnue", at: (errRows[0] as any).updated_at, http_status: parsed?.http_status };
    } catch { lastError = { message: "Erreur inconnue", at: (errRows[0] as any).updated_at }; }
  }
  if (status !== "connected" && lastError) status = "error";
  else if (status !== "connected" && !configured) status = "not_configured";
  else if (status !== "connected" && pendingCount > 0) status = "pending";

  return new Response(JSON.stringify({
    status,
    configured,
    last_connected_at: lastConnectedAt,
    expires_in: expiresIn,
    pending_count: pendingCount,
    redirect_uri: redirectUri,
    maestro_broker_id: maestroBrokerId,
    maestro_email: maestroEmail,
    last_error: lastError,
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
