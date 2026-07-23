export const MS365_DELEGATED_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  "User.ReadBasic.All",
  "User.Read.All",
  "Contacts.Read",
  "Contacts.ReadWrite",
  "People.Read",
  "Mail.ReadWrite",
  "Mail.Send",
  "MailboxSettings.Read",
  "Calendars.ReadWrite",
  "Chat.Read",
  "Chat.ReadBasic",
  "Chat.ReadWrite",
  "ChatMessage.Send",
  "Channel.ReadBasic.All",
  "ChannelMessage.Read.All",
  "ChannelMessage.Send",
  "Team.ReadBasic.All",
  "Presence.Read.All",
  "Files.ReadWrite",
  "Files.ReadWrite.All",
  "Sites.ReadWrite.All",
  "Organization.Read.All",
  "Application.Read.All",
].join(" ");

export type Ms365Config = {
  clientId: string;
  clientSecret: string;
  tenant: string;
  authMode: "auto" | "public" | "confidential";
  raw: Record<string, string>;
};

export async function readMs365Config(admin: any): Promise<Ms365Config> {
  const [{ data: secret }, { data: cfg }] = await Promise.all([
    admin.from("planipret_integration_secrets").select("config").in("provider", ["microsoft", "ms365"]).limit(1).maybeSingle(),
    admin.from("planipret_integration_config").select("config_data").eq("integration_key", "ms365").maybeSingle(),
  ]);
  const raw = { ...((cfg?.config_data ?? {}) as Record<string, string>), ...((secret?.config ?? {}) as Record<string, string>) };
  const authModeRaw = String(raw.auth_mode ?? raw.client_type ?? "auto").toLowerCase();
  const publicFlag = raw.public_client === "true" || raw.is_public_client === "true" || raw.no_client_secret === "true";
  return {
    clientId: raw.client_id ?? raw.client_secret_id ?? Deno.env.get("MICROSOFT_CLIENT_ID") ?? "",
    clientSecret: raw.client_secret ?? Deno.env.get("MICROSOFT_CLIENT_SECRET") ?? "",
    tenant: raw.tenant_id ?? Deno.env.get("MICROSOFT_TENANT_ID") ?? "common",
    authMode: publicFlag ? "public" : authModeRaw === "public" || authModeRaw === "confidential" ? authModeRaw : "auto",
    raw,
  };
}

function parseMicrosoftError(data: any): string {
  return String(data?.error_description ?? data?.error ?? "");
}

export function isPublicClientSecretError(data: any): boolean {
  return /AADSTS700025|client is public|client_secret should be presented|client_assertion/i.test(parseMicrosoftError(data));
}

export function isConfidentialClientSecretRequiredError(data: any): boolean {
  return /AADSTS7000218|client_secret.*required|client_assertion.*required|must contain.*client_secret|invalid_client/i.test(parseMicrosoftError(data));
}

export function microsoftOAuthErrorMessage(details: any) {
  const description = String(details?.error_description ?? "");
  if (isPublicClientSecretError(details)) {
    return "Microsoft indique que cette App Registration est un client public. La connexion a été relancée sans client secret; si l'erreur revient, reconnectez Microsoft pour générer un code PKCE valide.";
  }
  if (details?.suberror === "consent_required" || details?.error_codes?.includes(65001) || description.includes("AADSTS65001")) {
    return "Microsoft demande un consentement pour les permissions demandées. Un administrateur Microsoft doit approuver l'application AVA Soft Phone, ou autoriser le consentement utilisateur dans Entra.";
  }
  if (description.includes("AADSTS50011") || /redirect_uri/i.test(description)) {
    return "L'adresse de redirection Microsoft ne correspond pas exactement à celle configurée dans Entra.";
  }
  if (description.includes("AADSTS9002325") || /PKCE|code_verifier/i.test(description)) {
    return "Microsoft exige PKCE pour ce client public. Recommencez la connexion Microsoft depuis l'application.";
  }
  return description || details?.error || "Échec OAuth Microsoft";
}

export async function requestMicrosoftToken(
  cfg: Ms365Config,
  params: Record<string, string>,
  options: { preferPublic?: boolean; allowPublicRetry?: boolean } = {},
): Promise<{ ok: boolean; status: number; data: any; usedClientSecret: boolean; retriedPublic: boolean }> {
  const shouldUseSecret = !options.preferPublic && cfg.authMode !== "public" && !!cfg.clientSecret;
  const run = async (useSecret: boolean) => {
    const body = new URLSearchParams({ ...params, client_id: cfg.clientId });
    if (useSecret) body.set("client_secret", cfg.clientSecret);
    const response = await fetch(`https://login.microsoftonline.com/${cfg.tenant}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const text = await response.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    return { ok: response.ok, status: response.status, data, usedClientSecret: useSecret };
  };

  const first = await run(shouldUseSecret);
  if (!first.ok && first.usedClientSecret && options.allowPublicRetry !== false && isPublicClientSecretError(first.data)) {
    const second = await run(false);
    return { ...second, retriedPublic: true };
  }
  if (!first.ok && !first.usedClientSecret && cfg.authMode !== "public" && !!cfg.clientSecret && isConfidentialClientSecretRequiredError(first.data)) {
    const second = await run(true);
    return { ...second, retriedPublic: false };
  }
  return { ...first, retriedPublic: false };
}

export async function refreshMicrosoftAccessToken(admin: any, profile: any, scopes = MS365_DELEGATED_SCOPES): Promise<string | null> {
  if (!profile?.ms365_refresh_token) return null;
  const cfg = await readMs365Config(admin);
  if (!cfg.clientId) return null;
  const token = await requestMicrosoftToken(cfg, {
    grant_type: "refresh_token",
    refresh_token: profile.ms365_refresh_token,
    scope: scopes,
  }, { preferPublic: cfg.authMode === "public" });
  if (!token.ok) {
    console.error("[ms365] refresh failed", token.status, JSON.stringify(token.data));
    return null;
  }
  await admin.from("planipret_profiles").update({
    ms365_access_token: token.data.access_token,
    ms365_refresh_token: token.data.refresh_token ?? profile.ms365_refresh_token,
    ms365_scopes: token.data.scope ?? scopes,
    ms365_token_expiry: new Date(Date.now() + Number(token.data.expires_in ?? 3600) * 1000).toISOString(),
  }).eq("id", profile.id);
  return token.data.access_token as string;
}