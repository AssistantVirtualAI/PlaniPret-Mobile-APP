// Shared helper for per-broker Maestro OAuth tokens.
// Tokens live on planipret_profiles: maestro_broker_token (access),
// maestro_refresh_token, maestro_token_expires_at, maestro_scope,
// maestro_email, maestro_broker_id, maestro_connected.
//
// getUserMaestroAccessToken(admin, userId) returns a valid access token,
// transparently refreshing it if it is within 60s of expiry.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export interface MaestroOAuthEnv {
  authUrl: string;
  tokenUrl: string;
  clientId: string;        // Web client_id=2
  clientSecret: string;   // Web only
  scope: string;
  mobileClientId: string; // Mobile PKCE client_id=3
}

export function getMaestroOAuthEnv(): MaestroOAuthEnv {
  return {
    authUrl:        Deno.env.get("MAESTRO_OAUTH_AUTHORIZE_URL")       ?? "",
    tokenUrl:       Deno.env.get("MAESTRO_OAUTH_TOKEN_URL")           ?? "",
    clientId:       Deno.env.get("MAESTRO_OAUTH_CLIENT_ID")           ?? "2",
    clientSecret:   Deno.env.get("MAESTRO_OAUTH_CLIENT_SECRET")       ?? "",
    scope:          Deno.env.get("MAESTRO_OAUTH_SCOPE")               ?? "api",
    mobileClientId: Deno.env.get("MAESTRO_OAUTH_MOBILE_CLIENT_ID")   ?? "3",
  };
}

export function isMaestroOAuthConfigured(env: MaestroOAuthEnv) {
  // clientSecret only required for web flow; mobile PKCE has no secret
  return !!(env.authUrl && env.tokenUrl && env.clientId);
}

export interface MaestroTokenSet {
  access_token: string;
  refresh_token?: string | null;
  expires_in?: number | null;
  scope?: string | null;
  token_type?: string | null;
  [k: string]: unknown;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 10_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Web: includes client_secret
async function exchangeWeb(
  env: MaestroOAuthEnv,
  params: Record<string, string>,
): Promise<{ ok: boolean; status: number; data: MaestroTokenSet | null; error?: string }> {
  const body = new URLSearchParams({
    client_id: env.clientId,
    client_secret: env.clientSecret,
    ...params,
  });
  const r = await fetchWithTimeout(env.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body.toString(),
  });
  let data: any = null;
  try { data = await r.json(); } catch { /* ignore */ }
  if (!r.ok) {
    return { ok: false, status: r.status, data: null, error: data?.error_description ?? data?.error ?? `HTTP ${r.status}` };
  }
  return { ok: true, status: r.status, data: data as MaestroTokenSet };
}

// Mobile PKCE: no client_secret, uses mobileClientId
async function exchangeMobile(
  env: MaestroOAuthEnv,
  params: Record<string, string>,
): Promise<{ ok: boolean; status: number; data: MaestroTokenSet | null; error?: string }> {
  const body = new URLSearchParams({ client_id: env.mobileClientId, ...params });
  const r = await fetchWithTimeout(env.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body.toString(),
  });
  let data: any = null;
  try { data = await r.json(); } catch { /* ignore */ }
  if (!r.ok) return { ok: false, status: r.status, data: null, error: data?.error_description ?? data?.error ?? `HTTP ${r.status}` };
  return { ok: true, status: r.status, data: data as MaestroTokenSet };
}

export async function exchangeAuthorizationCode(
  env: MaestroOAuthEnv,
  code: string,
  redirectUri: string,
  codeVerifier?: string | null,
) {
  if (codeVerifier) {
    // Mobile PKCE
    return exchangeMobile(env, { grant_type: "authorization_code", code, code_verifier: codeVerifier, redirect_uri: redirectUri });
  }
  // Web standard
  return exchangeWeb(env, { grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

export async function refreshAccessToken(
  env: MaestroOAuthEnv,
  refreshToken: string,
  isMobile = false,
) {
  if (isMobile) return exchangeMobile(env, { grant_type: "refresh_token", refresh_token: refreshToken });
  return exchangeWeb(env, { grant_type: "refresh_token", refresh_token: refreshToken });
}

/**
 * Apply a patch to the broker profile using the SAME matching rule as the reads
 * below (`user_id` OR `id`).
 *
 * This asymmetry was a silent data-loss bug: reads accepted a profile found by
 * either column, while writes filtered on `user_id` only. When a profile row was
 * matched by `id` (because `user_id` was null or different), the refreshed token
 * was written to ZERO rows - and an UPDATE matching nothing is a SQL success, so
 * nothing was logged. Every call refreshed the token successfully and then threw
 * it away, leaving `maestro_token_expires_at` permanently in the past while the
 * diagnostics reported "Jeton expiré".
 *
 * Returns the number of rows actually written so callers can detect the failure.
 */
async function patchProfile(
  admin: SupabaseClient,
  userId: string,
  patch: Record<string, unknown>,
  context: string,
): Promise<number> {
  const { data, error } = await admin
    .from("planipret_profiles")
    .update(patch)
    .or(`user_id.eq.${userId},id.eq.${userId}`)
    .select("id");
  if (error) {
    console.error(`[maestro-oauth] ${context}: update failed`, error.message);
    return 0;
  }
  const rows = Array.isArray(data) ? data.length : 0;
  if (rows === 0) {
    console.error(
      `[maestro-oauth] ${context}: update matched NO row for ${userId} — ` +
      "token not persisted, check planipret_profiles.user_id/id",
    );
  }
  return rows;
}

export async function persistTokenSet(
  admin: SupabaseClient,
  userId: string,
  tokens: MaestroTokenSet,
  isMobile = false,
): Promise<boolean> {
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + (tokens.expires_in as number) * 1000).toISOString()
    : null;
  const patch: Record<string, unknown> = {
    maestro_broker_token: tokens.access_token,
    maestro_token_expires_at: expiresAt,
    maestro_connected: true,
    maestro_last_sync_at: new Date().toISOString(),
    maestro_oauth_client: isMobile ? "mobile" : "web",
  };
  if (tokens.refresh_token) patch.maestro_refresh_token = tokens.refresh_token;
  if (tokens.scope) patch.maestro_scope = tokens.scope;
  return (await patchProfile(admin, userId, patch, "persistTokenSet")) > 0;
}

/**
 * Refresh the access token unconditionally, ignoring `maestro_token_expires_at`.
 * Needed because Maestro can revoke a token before its recorded expiry (and the
 * column itself can be stale), which produced 401s while the app still believed
 * the token was fresh. Returns the new access token, or null when no refresh is
 * possible — in which case the user must relink via `maestro-oauth-start`.
 */
export async function forceRefreshMaestroToken(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: prof } = await admin
    .from("planipret_profiles")
    .select("maestro_refresh_token, maestro_oauth_client")
    .or(`user_id.eq.${userId},id.eq.${userId}`)
    .maybeSingle();
  const refreshToken = (prof as any)?.maestro_refresh_token as string | undefined;
  if (!refreshToken) {
    console.warn("[maestro-oauth] force refresh impossible: no refresh_token stored");
    return null;
  }
  const env = getMaestroOAuthEnv();
  if (!isMaestroOAuthConfigured(env)) {
    console.warn("[maestro-oauth] force refresh impossible: OAuth env not configured");
    return null;
  }
  const isMobile = (prof as any)?.maestro_oauth_client === "mobile";
  const refreshed = await refreshAccessToken(env, refreshToken, isMobile);
  if (!refreshed.ok || !refreshed.data?.access_token) {
    console.warn("[maestro-oauth] force refresh failed", refreshed.status, refreshed.error);
    // The refresh token itself is dead: clear the connected flag so the UI stops
    // claiming "connected" and can surface the relink button.
    await patchProfile(
      admin,
      userId,
      { maestro_connected: false, maestro_token_expires_at: new Date(0).toISOString() },
      "forceRefresh/disconnect",
    );
    return null;
  }
  await persistTokenSet(admin, userId, refreshed.data, isMobile);
  console.info("[maestro-oauth] force refresh succeeded");
  return refreshed.data.access_token as string;
}

/** Why a token is (or is not) usable. Lets callers report an accurate reason
 *  instead of collapsing every failure mode into "Jeton expiré". */
export type MaestroTokenReason =
  | "fresh"              // stored token still valid
  | "refreshed"          // refreshed and persisted successfully
  | "refresh_not_persisted" // refreshed but the DB write matched no row
  | "stale_no_refresh_token"
  | "stale_oauth_not_configured"
  | "refresh_rejected"   // Maestro refused the refresh token
  | "no_profile"
  | "no_token";

export interface MaestroTokenResult {
  token: string | null;
  /** True only when the token is known to be currently valid. */
  healthy: boolean;
  reason: MaestroTokenReason;
  expiresAt: string | null;
}

/**
 * Resolve the broker access token AND say how trustworthy it is.
 *
 * `getUserMaestroAccessToken` below returns the stored token as a last resort in
 * several failure modes, so a truthy return never meant "valid". Callers that
 * displayed health based on it (pp-ava-e2e-check, pp-connections-status) could
 * only ever report "Jeton expiré" when the column was empty - never when the
 * token was actually rejected. Use this function for any health reporting.
 */
export async function resolveMaestroAccessToken(
  admin: SupabaseClient,
  userId: string,
): Promise<MaestroTokenResult> {
  const { data: prof } = await admin
    .from("planipret_profiles")
    .select("maestro_broker_token, maestro_refresh_token, maestro_token_expires_at, maestro_oauth_client")
    .or(`user_id.eq.${userId},id.eq.${userId}`)
    .maybeSingle();
  if (!prof) return { token: null, healthy: false, reason: "no_profile", expiresAt: null };

  const expiresAt = (prof.maestro_token_expires_at as string | null) ?? null;
  const stored = (prof.maestro_broker_token as string | null) ?? null;
  if (!stored) return { token: null, healthy: false, reason: "no_token", expiresAt };

  const expAt = expiresAt ? Date.parse(expiresAt) : 0;
  if (expAt && expAt - Date.now() > 60_000) {
    return { token: stored, healthy: true, reason: "fresh", expiresAt };
  }

  if (!prof.maestro_refresh_token) {
    return { token: stored, healthy: false, reason: "stale_no_refresh_token", expiresAt };
  }
  const env = getMaestroOAuthEnv();
  if (!isMaestroOAuthConfigured(env)) {
    return { token: stored, healthy: false, reason: "stale_oauth_not_configured", expiresAt };
  }

  const isMobile = (prof as any).maestro_oauth_client === "mobile";
  const refreshed = await refreshAccessToken(env, prof.maestro_refresh_token as string, isMobile);
  if (!refreshed.ok || !refreshed.data?.access_token) {
    console.warn("[maestro-oauth] refresh failed", refreshed.status, refreshed.error);
    return { token: stored, healthy: false, reason: "refresh_rejected", expiresAt };
  }

  const persisted = await persistTokenSet(admin, userId, refreshed.data, isMobile);
  const newToken = refreshed.data.access_token as string;
  // The token itself is valid even when the DB write failed, but the caller must
  // know: on the next request the stale row will trigger another refresh.
  return persisted
    ? { token: newToken, healthy: true, reason: "refreshed", expiresAt }
    : { token: newToken, healthy: false, reason: "refresh_not_persisted", expiresAt };
}

/**
 * Backwards-compatible wrapper: returns a token to use for an API call.
 *
 * Do NOT use the truthiness of this result to report connection health - it
 * deliberately falls back to the stored token so an in-flight request still has
 * something to send. Use `resolveMaestroAccessToken` for health.
 */
export async function getUserMaestroAccessToken(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  return (await resolveMaestroAccessToken(admin, userId)).token;
}

export async function fetchMaestroUserProfile(env: MaestroOAuthEnv, accessToken: string) {
  const root = (
    Deno.env.get("MAESTRO_TELECOM_BASE_URL")
    ?? Deno.env.get("MAESTRO_API_BASE_URL")
    ?? "https://client-dev.planipret.com/telecom/api/v1"
  ).replace(/\/$/, "");
  // Confirmed with Scott: with an OAuth access token (no machine=1),
  // GET /user returns the authenticated broker profile { id, first_name, last_name, email }.
  try {
    const r = await fetchWithTimeout(`${root}/user`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    }, 6_000);
    if (r.ok) {
      const j = await r.json();
      if (j && typeof j === "object" && Object.keys(j).length > 0) return j;
      console.warn("[maestro-oauth] GET /user returned an empty object — token may be a machine key");
    } else {
      console.warn("[maestro-oauth] GET /user failed", r.status);
    }
  } catch (e) {
    console.warn("[maestro-oauth] GET /user error", (e as Error).message);
  }
  return null;
}
