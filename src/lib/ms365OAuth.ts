import { Capacitor } from "@capacitor/core";

export const MS365_DELEGATED_SCOPES =
  "openid profile email offline_access User.Read User.ReadBasic.All Mail.ReadWrite Mail.Send MailboxSettings.Read Calendars.ReadWrite Chat.Read Chat.ReadBasic Chat.ReadWrite Channel.ReadBasic.All ChannelMessage.Read.All ChannelMessage.Send Team.ReadBasic.All Organization.Read.All Application.Read.All";

export const MS365_WEB_CALLBACK_PATH = "/auth/microsoft/callback";
// Scheme déclaré dans ios/App/App/Info.plist → CFBundleURLSchemes → "capacitor"
// Azure App Registration → Mobile and desktop applications → capacitor://localhost/auth/microsoft/callback
export const MS365_NATIVE_REDIRECT_URI = "capacitor://localhost/auth/microsoft/callback";

const REDIRECT_STORAGE_KEY = "pp_ms365_redirect_uri";

export function getMs365RedirectUri(): string {
  if (Capacitor.isNativePlatform()) return MS365_NATIVE_REDIRECT_URI;
  return `${window.location.origin}${MS365_WEB_CALLBACK_PATH}`;
}

export function rememberMs365RedirectUri(redirectUri: string): void {
  try { sessionStorage.setItem(REDIRECT_STORAGE_KEY, redirectUri); } catch {}
  try { localStorage.setItem(REDIRECT_STORAGE_KEY, redirectUri); } catch {}
}

export function getRememberedMs365RedirectUri(): string {
  try {
    return sessionStorage.getItem(REDIRECT_STORAGE_KEY) || localStorage.getItem(REDIRECT_STORAGE_KEY) || getMs365RedirectUri();
  } catch {
    return getMs365RedirectUri();
  }
}

export function clearRememberedMs365RedirectUri(): void {
  try { sessionStorage.removeItem(REDIRECT_STORAGE_KEY); } catch {}
  try { localStorage.removeItem(REDIRECT_STORAGE_KEY); } catch {}
}

export function buildMs365AuthorizeUrl(cfg: {
  clientId: string;
  tenant?: string | null;
  state?: string | null;
  prompt?: "select_account" | "consent" | "none";
}): string {
  const redirectUri = getMs365RedirectUri();
  rememberMs365RedirectUri(redirectUri);
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: MS365_DELEGATED_SCOPES,
    prompt: cfg.prompt ?? "select_account",
  });
  if (cfg.state) params.set("state", cfg.state);
  return `https://login.microsoftonline.com/${cfg.tenant || "common"}/oauth2/v2.0/authorize?${params.toString()}`;
}

export function openMs365Authorize(cfg: {
  clientId: string;
  tenant?: string | null;
  state?: string | null;
  prompt?: "select_account" | "consent" | "none";
}): void {
  const url = buildMs365AuthorizeUrl(cfg);
  if (Capacitor.isNativePlatform()) {
    // Ouvrir Safari externe — iOS intercepte le retour capacitor:// et le renvoie à la WebView
    window.open(url, "_system");
  } else {
    window.location.href = url;
  }
}