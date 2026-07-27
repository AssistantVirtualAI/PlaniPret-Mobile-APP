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
  const r = await fetch(env.tokenUrl, {
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
  const r = await fetch(env.tokenUrl, {
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
  await admin.from("planipret_profiles").update(patch).eq("user_id", userId);
}

export async function getUserMaestroAccessToken(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: prof } = await admin
    .from("planipret_profiles")
    .select("maestro_broker_token, maestro_refresh_token, maestro_token_expires_at, maestro_oauth_client")
    .eq("user_id", userId)
    .maybeSingle();
  if (!prof?.maestro_broker_token) return null;

  const expAt = prof.maestro_token_expires_at ? Date.parse(prof.maestro_token_expires_at as string) : 0;
  const stillFresh = expAt && expAt - Date.now() > 60_000;
  if (stillFresh) return prof.maestro_broker_token as string;

  if (!prof.maestro_refresh_token) return prof.maestro_broker_token as string;
  const env = getMaestroOAuthEnv();
  if (!isMaestroOAuthConfigured(env)) return prof.maestro_broker_token as string;

  const isMobile = (prof as any).maestro_oauth_client === "mobile";
  const refreshed = await refreshAccessToken(env, prof.maestro_refresh_token as string, isMobile);
  if (!refreshed.ok || !refreshed.data) {
    console.warn("[maestro-oauth] refresh failed", refreshed.status, refreshed.error);
    return prof.maestro_broker_token as string;
  }
  await persistTokenSet(admin, userId, refreshed.data, isMobile);
  return refreshed.data.access_token;
}

export async function fetchMaestroUserProfile(env: MaestroOAuthEnv, accessToken: string) {
  const base = Deno.env.get("MAESTRO_TELECOM_BASE_URL") ?? Deno.env.get("MAESTRO_API_BASE_URL") ?? "";
  if (!base) return null;
  const root = base.replace(/\/$/, "");

  // The Maestro Telecom API requires ?machine=1 on all endpoints.
  // /user (singular) is the auto-resolved "me" endpoint — returns the profile
  // of the authenticated user based on the Bearer OAuth token.
  // Without ?machine=1, the API may return the machine account (e.g. Carlo, id=67)
  // instead of the authenticated broker.
  //
  // Additionally, try to extract the user id from the JWT payload to call
  // GET /users/{id}?machine=1 directly, which is the most reliable approach.
  let jwtUserId: string | null = null;
  try {
    const payload = JSON.parse(atob(accessToken.split(".")[1]));
    const rawId = payload?.sub ?? payload?.id ?? payload?.user_id ?? null;
    if (rawId && /^\d+$/.test(String(rawId))) jwtUserId = String(rawId);
  } catch { /* ignore */ }

  const candidates: string[] = [];
  if (jwtUserId) candidates.push(`${root}/users/${jwtUserId}?machine=1`);
  candidates.push(
    `${root}/user?machine=1`,
    `${root}/users/me?machine=1`,
    `${root}/me?machine=1`,
  );

  for (const url of candidates) {
    try {
      const r = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      });
      if (r.ok) {
        const data = await r.json();
        // Validate: the returned id must match the JWT sub if we have it
        const returnedId = String(data?.id ?? data?.user?.id ?? data?.user_id ?? "");
        if (jwtUserId && returnedId && returnedId !== jwtUserId) {
          console.warn(`[maestro-oauth] /user returned id=${returnedId} but JWT sub=${jwtUserId} — skipping`);
          continue;
        }
        return data;
      }
    } catch (e) {
      console.warn(`[maestro-oauth] fetch ${url} failed`, (e as Error).message);
    }
  }
  return null;
}
