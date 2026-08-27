// pp-ms-auth-callback
// Exchanges the Microsoft OAuth authorization code (PKCE) for tokens,
// links to the matching planipret_profiles row, and returns a magic-link
// hashed token the client uses with supabase.auth.verifyOtp to establish
// the Supabase session — bypassing the disabled `azure` provider.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  MS365_DELEGATED_SCOPES,
  microsoftOAuthErrorMessage,
  readMs365Config,
  requestMicrosoftToken,
} from "../_shared/ms365.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Configuration protection: accept every redirect URI shape the mobile/web
// clients can legitimately produce (custom scheme, capacitor, https), and
// reject anything else so a tampered redirect_uri can never be exchanged.
const NATIVE_SCHEMES = ["capacitor:", "planipret:", "ionic:"];
const CALLBACK_PATHS = ["/auth/microsoft/callback", "/auth/ms365/callback", "/auth/callback"];

function redirectAllowed(value: string): boolean {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  try {
    const url = new URL(raw);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const withHost = `/${[url.hostname, url.pathname].filter(Boolean).join("/")}`
      .replace(/\/+/g, "/")
      .replace(/\/+$/, "");
    const matchesPath = CALLBACK_PATHS.includes(path) || CALLBACK_PATHS.includes(withHost);
    if (NATIVE_SCHEMES.includes(url.protocol)) return matchesPath;
    if (url.protocol.startsWith("msauth")) return true;
    if (url.protocol === "https:" || url.protocol === "http:") return matchesPath;
    return false;
  } catch {
    return false;
  }
}

function normalizeEmail(value: unknown): string | null {
  const email = String(value ?? "").trim().toLowerCase();
  return /.+@.+\..+/.test(email) ? email : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { code, redirect_uri, code_verifier } = await req.json().catch(() => ({}));
    if (!code || !redirect_uri) {
      return json({ success: false, error: "missing code/redirect_uri" }, 400);
    }
    if (!redirectAllowed(String(redirect_uri))) {
      return json({ success: false, error: "redirect_uri_not_allowed" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const cfg = await readMs365Config(admin);
    if (!cfg.clientId) return json({ success: false, error: "MS365 non configuré" }, 500);

    const token = await requestMicrosoftToken(cfg, {
      grant_type: "authorization_code",
      code: String(code),
      redirect_uri: String(redirect_uri),
      scope: MS365_DELEGATED_SCOPES,
      ...(code_verifier ? { code_verifier: String(code_verifier) } : {}),
    }, {
      preferPublic:
        cfg.authMode === "public" ||
        (cfg.authMode === "auto" && Boolean(code_verifier)),
    });

    if (!token.ok) {
      return json({
        success: false,
        error: microsoftOAuthErrorMessage(token.data),
        details: token.data,
        auth_mode: token.usedClientSecret ? "confidential" : "public",
      }, 400);
    }

    const msToken = token.data;
    const meRes = await fetch(
      "https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName",
      { headers: { Authorization: `Bearer ${msToken.access_token}` }, signal: AbortSignal.timeout(8000) },
    ).catch(() => null);
    if (!meRes) return json({ success: false, error: "microsoft_profile_timeout" }, 504);

    const me = await meRes.json().catch(() => ({}));
    const msEmail = normalizeEmail(me?.mail) ?? normalizeEmail(me?.userPrincipalName);
    if (!msEmail) return json({ success: false, error: "microsoft_email_missing" }, 400);

    let { data: profile, error: profileError } = await admin
      .from("planipret_profiles")
      .select("id,user_id,email,login_email,full_name,mobile_app_enabled,status")
      .or(`email.ilike.${msEmail},login_email.ilike.${msEmail},ms365_email.ilike.${msEmail}`)
      .limit(1)
      .maybeSingle();

    if (profileError) return json({ success: false, error: profileError.message }, 500);

    // Fallback: the Microsoft address may differ from the portal email.
    // Look the user up in auth by the Microsoft email, then by alias table.
    if (!profile?.user_id) {
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const match = list?.users?.find((u) => (u.email ?? "").toLowerCase() === msEmail);
      if (match?.id) {
        const { data: byUser } = await admin
          .from("planipret_profiles")
          .select("id,user_id,email,login_email,full_name,mobile_app_enabled,status")
          .eq("user_id", match.id)
          .limit(1)
          .maybeSingle();
        if (byUser?.user_id) profile = byUser;
      }
    }

    if (!profile?.user_id) {
      return json({
        success: false,
        error: "account_not_linked",
        email: msEmail,
        message: `Aucun compte du portail n'est associé à l'adresse Microsoft ${msEmail}. Demandez à un administrateur d'ajouter cette adresse à votre profil.`,
      }, 403);
    }
    if (profile.mobile_app_enabled === false) return json({ success: false, error: "mobile_access_disabled" }, 403);
    if (profile.status && ["inactive", "disabled", "banned", "suspended"].includes(String(profile.status).toLowerCase())) {
      return json({ success: false, error: "account_inactive" }, 403);
    }

    const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(profile.user_id);
    if (authUserError || !authUser?.user?.email) {
      return json({ success: false, error: "auth_user_missing" }, 403);
    }

    await admin.from("planipret_profiles").update({
      ms365_access_token: msToken.access_token,
      ms365_refresh_token: msToken.refresh_token,
      ms365_scopes: msToken.scope ?? MS365_DELEGATED_SCOPES,
      ms365_token_expiry: new Date(Date.now() + Number(msToken.expires_in ?? 3600) * 1000).toISOString(),
      ms365_email: msEmail,
      ms365_display_name: me?.displayName ?? null,
      auth_method: "microsoft",
    }).eq("id", profile.id);

    // Marque la session comme provenant de Microsoft : le portail refuse toute
    // session non-Microsoft, sinon l'utilisateur est renvoyé vers l'écran d'auth.
    try {
      await admin.auth.admin.updateUserById(profile.user_id, {
        user_metadata: {
          ...(authUser.user.user_metadata ?? {}),
          auth_provider: "microsoft",
          ms_oid: me?.id ?? null,
          ms365_email: msEmail,
          ms_display_name: me?.displayName ?? null,
          ms_last_login_at: new Date().toISOString(),
        },
      });
    } catch (e) {
      console.error("[pp-ms-auth-callback] stamp_metadata_failed", String((e as Error)?.message ?? e));
    }



    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: authUser.user.email,
    });
    if (linkError || !link?.properties?.hashed_token) {
      return json({ success: false, error: linkError?.message ?? "magic_link_failed" }, 500);
    }

    return json({
      success: true,
      email: authUser.user.email,
      token_hash: link.properties.hashed_token,
      account: { email: msEmail, name: me?.displayName ?? null },
      auth_mode: token.usedClientSecret ? "confidential" : "public",
    });
  } catch (error) {
    console.error("[pp-ms-auth-callback]", (error as Error)?.message, (error as Error)?.stack);
    return json({ success: false, error: String((error as Error)?.message ?? error) }, 500);
  }
});
