// maestro-oauth-status — authenticated. Returns the connection status for the
// current broker (reads planipret_profiles). A shared legacy token is never
// considered a connection because it cannot prove which broker owns it.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getMaestroOAuthEnv, getUserMaestroAccessToken, isMaestroOAuthConfigured } from "../_shared/maestro-oauth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const env = getMaestroOAuthEnv();
  const configured = isMaestroOAuthConfigured(env);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ connected: false, error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: u } = await admin.auth.getUser(authHeader.slice(7));
  const userId = u?.user?.id ?? null;
  if (!userId) {
    return new Response(JSON.stringify({ connected: false, error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  let authReason: string | null = null;


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

  {
    const { data: profRows } = await admin
      .from("planipret_profiles")
      .select("id, user_id, maestro_broker_id, maestro_email, maestro_broker_token, maestro_token_expires_at, maestro_last_sync_at, maestro_connected")
      .or(`user_id.eq.${userId},id.eq.${userId}`)
      .limit(2);
    const prof = ((profRows ?? []) as any[]).find((r) => r.user_id === userId) ?? (profRows ?? [])[0] ?? null;
    // Validation is purely local: a present, positive-integer broker id = connected.
    const rawBrokerId = (prof as any)?.maestro_broker_id ?? null;
    const brokerIdStr = rawBrokerId !== null && rawBrokerId !== undefined ? String(rawBrokerId).trim() : "";
    maestroBrokerId = /^\d+$/.test(brokerIdStr) && Number(brokerIdStr) > 0 ? brokerIdStr : null;
    maestroEmail = (prof as any)?.maestro_email ?? null;
    const validToken = prof?.maestro_broker_token
      ? await getUserMaestroAccessToken(admin, userId)
      : null;
    const identityVerified = Boolean(maestroBrokerId);
    if (validToken && identityVerified) {
      status = "connected";
      lastConnectedAt = (prof as any).maestro_last_sync_at ?? null;
      const expAt = (prof as any).maestro_token_expires_at ? Date.parse((prof as any).maestro_token_expires_at) : 0;
      expiresIn = expAt ? Math.max(0, Math.floor((expAt - Date.now()) / 1000)) : null;

    } else if (!prof) {
      authReason = "no_profile_row";
    } else {
      authReason = validToken ? "maestro_identity_unverified" : (maestroBrokerId ? "oauth_expired_reconnect_required" : "no_token");
    }

  }

  const { data: pending } = await admin
    .from("planipret_maestro_oauth_states")
    .select("state")
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString())
    .limit(5);
  pendingCount = pending?.length ?? 0;

  if (status === "connected") lastError = null;
  if (status !== "connected" && lastError) status = "error";
  else if (status !== "connected" && !configured) status = "not_configured";
  else if (status !== "connected" && pendingCount > 0) status = "pending";

  return new Response(JSON.stringify({
    status,
    connected: status === "connected",
    configured,
    user_id: userId,
    reason: status === "connected" ? null : (authReason ?? (configured ? "disconnected" : "not_configured")),
    last_connected_at: lastConnectedAt,
    expires_in: expiresIn,
    pending_count: pendingCount,
    redirect_uri: redirectUri,
    broker_id: maestroBrokerId,
    email: maestroEmail,
    maestro_broker_id: maestroBrokerId,
    maestro_email: maestroEmail,
    token_present: status === "connected" || authReason === "maestro_identity_unverified",
    identity_verified: Boolean(maestroBrokerId),
    last_error: lastError,

  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
