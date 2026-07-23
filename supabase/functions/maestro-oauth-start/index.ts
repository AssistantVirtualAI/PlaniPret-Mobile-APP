// maestro-oauth-start — authenticated. Generates a state, links it to the
// current broker, returns the authorize URL. Use this instead of building the
// URL client-side so the callback can resolve which user connected.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getMaestroOAuthEnv, isMaestroOAuthConfigured } from "../_shared/maestro-oauth.ts";

const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return j({ error: "unauthorized" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return j({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({} as any));
    const origin = body?.origin ?? req.headers.get("origin") ?? "https://avastatistic.ca";
    const redirectUri = body?.redirect_uri ?? `${origin}/auth/maestro/callback`;

    const env = getMaestroOAuthEnv();
    if (!isMaestroOAuthConfigured(env)) return j({ error: "not_configured" }, 200);

    // Validate authorize URL is absolute + https to avoid Safari "invalid address"
    let authorizeBase: URL;
    try {
      authorizeBase = new URL(env.authUrl);
    } catch {
      console.error("[maestro-oauth-start] MAESTRO_OAUTH_AUTHORIZE_URL invalid:", env.authUrl);
      return j({ error: "authorize_url_invalid", detail: "MAESTRO_OAUTH_AUTHORIZE_URL secret is not a valid absolute URL" }, 500);
    }
    if (authorizeBase.protocol !== "https:") {
      return j({ error: "authorize_url_not_https", detail: `authorize URL must be https, got ${authorizeBase.protocol}` }, 500);
    }

    const platform = body?.platform ?? "web"; // "web" | "mobile"
    const isMobile = platform === "mobile";

    // For web, refuse non-https redirect_uri — Maestro would echo it and Safari
    // would then fail to open the returned page ("l'adresse n'est pas valide").
    if (!isMobile) {
      try {
        const r = new URL(redirectUri);
        if (r.protocol !== "https:") {
          return j({ error: "redirect_uri_not_https", detail: `web redirect_uri must be https, got ${redirectUri}` }, 400);
        }
      } catch {
        return j({ error: "redirect_uri_invalid", detail: `redirect_uri is not a valid URL: ${redirectUri}` }, 400);
      }
    }

    const clientId = isMobile ? env.mobileClientId : env.clientId;

    // PKCE pour le client mobile (client_id=3) — généré avant l'insert
    let codeVerifier: string | null = null;
    let codeChallenge: string | null = null;
    if (isMobile) {
      const arr = new Uint8Array(32);
      crypto.getRandomValues(arr);
      codeVerifier = btoa(String.fromCharCode(...arr))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
      const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
      codeChallenge = btoa(String.fromCharCode(...new Uint8Array(hashBuf)))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    }

    // Un seul insert — code_verifier inclus directement si mobile
    const state = crypto.randomUUID();
    await admin.from("planipret_maestro_oauth_states").insert({
      state,
      user_id: u.user.id,
      redirect_uri: redirectUri,
      ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
    });

    const url = new URL(env.authUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    if (env.scope) url.searchParams.set("scope", env.scope);
    url.searchParams.set("state", state);
    if (isMobile && codeChallenge) {
      url.searchParams.set("code_challenge", codeChallenge);
      url.searchParams.set("code_challenge_method", "S256");
    }

    const finalUrl = url.toString();
    console.log("[maestro-oauth-start]", {
      platform,
      client_id: clientId,
      redirect_uri: redirectUri,
      authorize_host: authorizeBase.host,
    });

    return j({ ok: true, authorize_url: finalUrl, state, redirect_uri: redirectUri, platform });

  } catch (e) {
    console.error("[maestro-oauth-start]", e);
    return j({ error: (e as Error).message }, 500);
  }
});
