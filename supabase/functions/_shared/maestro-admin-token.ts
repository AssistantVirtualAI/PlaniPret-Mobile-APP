// Optional server-side ADMIN scope for the Maestro Commission Reports API.
//
// The per-broker OAuth tokens are strictly token-owner scoped, so a firm-wide
// view requires an admin-scoped credential issued by Planiprêt. Two ways to
// provide it (both optional — everything degrades gracefully when absent):
//
//   MAESTRO_ADMIN_ACCESS_TOKEN                     → static bearer token
//   MAESTRO_ADMIN_CLIENT_ID + MAESTRO_ADMIN_CLIENT_SECRET → client_credentials
//
// The client_credentials token is cached in memory until 60s before expiry.

import { getMaestroOAuthEnv } from "./maestro-oauth.ts";

let cached: { token: string; exp: number } | null = null;

export type AdminTokenResult = {
  token: string | null;
  source: "static" | "client_credentials" | "none";
  reason?: string;
};

export async function getMaestroAdminAccessToken(): Promise<AdminTokenResult> {
  const stat = Deno.env.get("MAESTRO_ADMIN_ACCESS_TOKEN");
  if (stat && stat.trim()) return { token: stat.trim(), source: "static" };

  // Prefer dedicated firm credentials, but also probe the existing confidential
  // web OAuth client. Some Maestro tenants grant that client firm-wide
  // client_credentials access and previously it was ignored entirely.
  const id = Deno.env.get("MAESTRO_ADMIN_CLIENT_ID") ?? Deno.env.get("MAESTRO_OAUTH_CLIENT_ID");
  const secret = Deno.env.get("MAESTRO_ADMIN_CLIENT_SECRET") ?? Deno.env.get("MAESTRO_OAUTH_CLIENT_SECRET");
  if (!id || !secret) {
    return { token: null, source: "none", reason: "admin_scope_not_configured" };
  }

  if (cached && cached.exp > Date.now() + 60_000) {
    return { token: cached.token, source: "client_credentials" };
  }

  const env = getMaestroOAuthEnv();
  try {
    const r = await fetch(env.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: id,
        client_secret: secret,
        scope: Deno.env.get("MAESTRO_ADMIN_SCOPE") ?? "api",
      }).toString(),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data?.access_token) {
      return {
        token: null,
        source: "none",
        reason: `admin_token_error:${r.status}:${String(data?.error_description ?? data?.error ?? "")}`.slice(0, 200),
      };
    }
    cached = {
      token: String(data.access_token),
      exp: Date.now() + (Number(data.expires_in ?? 3600) * 1000),
    };
    return { token: cached.token, source: "client_credentials" };
  } catch (e) {
    return { token: null, source: "none", reason: `admin_token_exception:${String((e as Error).message).slice(0, 160)}` };
  }
}
