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

export async function persistTokenSet(
  admin: SupabaseClient,
  userId: string,
  tokens: MaestroTokenSet,
  isMobile = false,
) {
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
  await updateProfileByEitherKey(admin, userId, patch, "persistTokenSet");
}

/**
 * Reads match on `user_id` OR `id`; writes MUST use the same key resolution.
 * Filtering writes on `user_id` only silently updated zero rows when the
 * profile row is keyed by `id`, so every refreshed token was thrown away and
 * `maestro_token_expires_at` stayed permanently in the past.
 */
async function updateProfileByEitherKey(
  admin: SupabaseClient,
  userId: string,
  patch: Record<string, unknown>,
  label: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("planipret_profiles")
    .update(patch)
    .or(`user_id.eq.${userId},id.eq.${userId}`)
    .select("id");
  if (error) {
    console.error(`[maestro-oauth] ${label} update failed`, error.message);
    return false;
  }
  if (!data || data.length === 0) {
    console.error(`[maestro-oauth] ${label} matched ZERO profile rows`, { userId });
    return false;
  }
  return true;
}

export async function getUserMaestroAccessToken(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: prof } = await admin
    .from("planipret_profiles")
    .select("maestro_broker_token, maestro_refresh_token, maestro_token_expires_at, maestro_oauth_client")
    .or(`user_id.eq.${userId},id.eq.${userId}`)
    .maybeSingle();
  if (!prof?.maestro_broker_token) return null;

  // Maestro (Laravel Passport) can issue non-expiring tokens: the token
  // endpoint then returns no `expires_in` and we store NULL. NULL means
  // "no expiry", NOT "expired" — never force a refresh in that case.
  const rawExp = prof.maestro_token_expires_at as string | null;
  if (!rawExp) return prof.maestro_broker_token as string;

  const expAt = Date.parse(rawExp);
  if (!Number.isFinite(expAt)) return prof.maestro_broker_token as string;
  const stillFresh = expAt - Date.now() > 60_000;
  if (stillFresh) return prof.maestro_broker_token as string;

  // Never return a token that is known to be expired. Doing so made callers
  // repeatedly POST with the stale bearer while the UI still said connected.
  if (!prof.maestro_refresh_token) return expAt > Date.now() ? prof.maestro_broker_token as string : null;
  const env = getMaestroOAuthEnv();
  if (!isMaestroOAuthConfigured(env)) return null;

  const isMobile = (prof as any).maestro_oauth_client === "mobile";
  const refreshed = await refreshAccessToken(env, prof.maestro_refresh_token as string, isMobile);
  if (!refreshed.ok || !refreshed.data) {
    console.warn("[maestro-oauth] refresh failed", refreshed.status, refreshed.error);
    await updateProfileByEitherKey(admin, userId, {
      maestro_connected: false,
      maestro_broker_token: null,
    }, "refresh-failure");
    return null;
  }
  await persistTokenSet(admin, userId, refreshed.data, isMobile);
  return refreshed.data.access_token;
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
