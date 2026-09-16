import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { MS365_DELEGATED_SCOPES, microsoftOAuthErrorMessage, readMs365Config, requestMicrosoftToken } from "../_shared/ms365.ts";
import { linkBrokerIdByEmail } from "../_shared/maestro-broker-directory.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function redirectAllowed(value: string): boolean {
  if (value === "capacitor://localhost/auth/microsoft/callback") return true;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") &&
      (url.pathname === "/auth/microsoft/callback" || url.pathname === "/auth/ms365/callback");
  } catch {
    return false;
  }
}

function normalizeEmail(value: unknown): string | null {
  const email = String(value ?? "").trim().toLowerCase();
  return /.+@.+\..+/.test(email) ? email : null;
}

/**
 * Profiles provisioned before Microsoft SSO may only be associated through
 * their Supabase Auth user. Search every bounded Auth page, not just page 1,
 * so an authorized broker is never rejected merely because the tenant has
 * more than 200 accounts. The helper is read-only and cannot create access.
 */
async function findAuthUserByEmail(admin: any, email: string) {
  const wanted = email.trim().toLowerCase();
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    const users = data?.users ?? [];
    const hit = users.find((user: any) => String(user?.email ?? "").trim().toLowerCase() === wanted);
    if (hit?.id) return hit;
    if (users.length < 200) break;
  }
  return null;
}

/**
 * A legacy portal account may use a different primary email. Associate it
 * only when Microsoft returns one unique matching full name and the profile
 * has no Microsoft address belonging to another person. No account is ever
 * created by this fallback; ambiguous results remain blocked for admin review.
 */
async function findUniqueLegacyProfileByName(admin: any, displayName: unknown, msEmail: string) {
  const name = String(displayName ?? "").trim();
  if (!name) return null;
  const { data, error } = await admin
    .from("planipret_profiles")
    .select("id,user_id,email,login_email,full_name,mobile_app_enabled,status,ms365_email")
    .ilike("full_name", name)
    .limit(3);
  if (error) return null;
  const candidates = (data ?? []).filter((p: any) => {
    const existing = normalizeEmail(p?.ms365_email);
    return Boolean(p?.user_id) && (!existing || existing === msEmail);
  });
  return candidates.length === 1 ? candidates[0] : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { code, redirect_uri, code_verifier } = await req.json().catch(() => ({}));
    if (!code || !redirect_uri) return json({ success: false, error: "missing code/redirect_uri" }, 400);
    if (!redirectAllowed(String(redirect_uri))) return json({ success: false, error: "redirect_uri_not_allowed" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const cfg = await readMs365Config(admin);
    if (!cfg.clientId) return json({ success: false, error: "MS365 non configuré" }, 500);

    const token = await requestMicrosoftToken(cfg, {
      grant_type: "authorization_code",
      code: String(code),
      redirect_uri: String(redirect_uri),
      scope: MS365_DELEGATED_SCOPES,
      ...(code_verifier ? { code_verifier: String(code_verifier) } : {}),
    }, { preferPublic: cfg.authMode === "public" || (cfg.authMode === "auto" && Boolean(code_verifier)) });

    if (!token.ok) {
      return json({
        success: false,
        error: microsoftOAuthErrorMessage(token.data),
        details: token.data,
        auth_mode: token.usedClientSecret ? "confidential" : "public",
      }, 400);
    }

    const msToken = token.data;
    const meRes = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName", {
      headers: { Authorization: `Bearer ${msToken.access_token}` },
    });
    const me = await meRes.json().catch(() => ({}));
    const msEmail = normalizeEmail(me?.mail) ?? normalizeEmail(me?.userPrincipalName);
    if (!msEmail) return json({ success: false, error: "microsoft_email_missing" }, 400);

    let { data: profile, error: profileError } = await admin
      .from("planipret_profiles")
      .select("id,user_id,email,login_email,full_name,mobile_app_enabled,status,ms365_email")
      .or(`email.ilike.${msEmail},login_email.ilike.${msEmail},ms365_email.ilike.${msEmail}`)
      .limit(1)
      .maybeSingle();

    if (profileError) return json({ success: false, error: profileError.message }, 500);

    // Fallback: the Microsoft address may differ from the portal email.
    // Look the user up in auth by the Microsoft email, then by alias table.
    if (!profile?.user_id) {
      const match = await findAuthUserByEmail(admin, msEmail);
      if (match?.id) {
        const { data: byUser } = await admin
          .from("planipret_profiles")
          .select("id,user_id,email,login_email,full_name,mobile_app_enabled,status,ms365_email")
          .eq("user_id", match.id)
          .limit(1)
          .maybeSingle();
        if (byUser?.user_id) profile = byUser;
      }
    }

    if (!profile?.user_id) {
      const legacy = await findUniqueLegacyProfileByName(admin, me?.displayName, msEmail);
      if (legacy?.user_id) profile = legacy;
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
    if (authUserError || !authUser?.user?.email) return json({ success: false, error: "auth_user_missing" }, 403);

    await admin.from("planipret_profiles").update({
      ms365_access_token: msToken.access_token,
      ms365_refresh_token: msToken.refresh_token,
      ms365_scopes: msToken.scope ?? MS365_DELEGATED_SCOPES,
      ms365_token_expiry: new Date(Date.now() + Number(msToken.expires_in ?? 3600) * 1000).toISOString(),
      ms365_email: msEmail,
      ms365_display_name: me?.displayName ?? null,
      auth_method: "microsoft",
    }).eq("id", profile.id);

    // Link the broker's Maestro telecom id from their Microsoft email.
    try {
      const { data: prof2 } = await admin
        .from("planipret_profiles")
        .select("id, email, ms365_email, extension, phone, maestro_broker_id")
        .eq("id", profile.id)
        .maybeSingle();
      if (prof2) await linkBrokerIdByEmail(admin, prof2 as any);
    } catch (e) { console.warn("[ms365-auth-session] maestro link failed", (e as Error).message); }

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
    console.error("[ms365-auth-session]", (error as Error)?.message, (error as Error)?.stack);
    return json({ success: false, error: String((error as Error)?.message ?? error) }, 500);
  }
});
