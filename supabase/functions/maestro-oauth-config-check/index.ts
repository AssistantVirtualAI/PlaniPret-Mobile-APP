// maestro-oauth-config-check — authenticated. Verifies Maestro OAuth env vars
// and reports the exact redirect_uri the app will send, so the admin can
// compare it against the value whitelisted in the Maestro console.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getMaestroOAuthEnv } from "../_shared/maestro-oauth.ts";

const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return j({ error: "unauthorized" }, 401);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return j({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({} as any));
    const platform: "web" | "mobile" = body?.platform === "mobile" ? "mobile" : "web";
    const origin = body?.origin ?? "https://avastatistic.ca";
    const redirectUri = body?.redirect_uri ?? `${origin}/auth/maestro/callback`;

    const env = getMaestroOAuthEnv();
    const checks: Array<{ id: string; label: string; ok: boolean; detail?: string }> = [];

    const push = (id: string, label: string, ok: boolean, detail?: string) =>
      checks.push({ id, label, ok, detail });

    // Authorize URL
    let authHost = "";
    let authOk = false;
    try {
      const u = new URL(env.authUrl);
      authHost = u.host;
      authOk = u.protocol === "https:";
      push("authorize_url", "MAESTRO_OAUTH_AUTHORIZE_URL absolue + https", authOk,
        authOk ? u.toString() : `protocole ${u.protocol}`);
    } catch {
      push("authorize_url", "MAESTRO_OAUTH_AUTHORIZE_URL absolue + https", false,
        env.authUrl ? `URL invalide: ${env.authUrl}` : "secret manquant");
    }

    // Token URL
    let tokenOk = false;
    try {
      const u = new URL(env.tokenUrl);
      tokenOk = u.protocol === "https:";
      push("token_url", "MAESTRO_OAUTH_TOKEN_URL absolue + https", tokenOk,
        tokenOk ? u.toString() : `protocole ${u.protocol}`);
    } catch {
      push("token_url", "MAESTRO_OAUTH_TOKEN_URL absolue + https", false,
        env.tokenUrl ? `URL invalide: ${env.tokenUrl}` : "secret manquant");
    }

    // Client IDs & secret
    push("client_id", "MAESTRO_OAUTH_CLIENT_ID (web)", !!env.clientId, env.clientId || "manquant");
    push("client_secret", "MAESTRO_OAUTH_CLIENT_SECRET (web)", !!env.clientSecret,
      env.clientSecret ? "présent" : "manquant");
    push("mobile_client_id", "MAESTRO_OAUTH_MOBILE_CLIENT_ID (mobile PKCE)", !!env.mobileClientId,
      env.mobileClientId || "manquant");
    push("scope", "MAESTRO_OAUTH_SCOPE", !!env.scope, env.scope || "manquant");

    // Redirect URI
    let redirOk = false;
    try {
      const r = new URL(redirectUri);
      redirOk = platform === "mobile" ? true : r.protocol === "https:";
      push("redirect_uri", "redirect_uri utilisable", redirOk,
        redirOk ? r.toString() : `protocole ${r.protocol} (web nécessite https)`);
    } catch {
      push("redirect_uri", "redirect_uri utilisable", false, `invalide: ${redirectUri}`);
    }

    const ready = checks.every((c) => c.ok);
    const effectiveClientId = platform === "mobile" ? env.mobileClientId : env.clientId;

    return j({
      ok: true,
      ready,
      platform,
      redirect_uri: redirectUri,
      effective_client_id: effectiveClientId,
      authorize_host: authHost,
      checks,
    });
  } catch (e) {
    console.error("[maestro-oauth-config-check]", e);
    return j({ error: (e as Error).message }, 500);
  }
});
