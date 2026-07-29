import { Capacitor } from "@capacitor/core";

export const MS365_DELEGATED_SCOPES =
  "openid profile email offline_access User.Read User.ReadBasic.All User.Read.All Contacts.Read Contacts.ReadWrite People.Read Mail.ReadWrite Mail.Send MailboxSettings.Read Calendars.ReadWrite Chat.Read Chat.ReadBasic Chat.ReadWrite ChatMessage.Send Channel.ReadBasic.All ChannelMessage.Read.All ChannelMessage.Send Team.ReadBasic.All Presence.Read.All Files.ReadWrite Files.ReadWrite.All Sites.ReadWrite.All Organization.Read.All Application.Read.All";

export const MS365_WEB_CALLBACK_PATH = "/auth/microsoft/callback";
// Azure whitelists the Capacitor custom scheme for the mobile client so the
// WebView intercepts the callback directly and the app never leaves in-app
// Safari/Chrome. Keep in sync with Azure App Registration (Mobile/Desktop).
export const MS365_NATIVE_REDIRECT_URI = "capacitor://localhost/auth/microsoft/callback";

const REDIRECT_STORAGE_KEY = "pp_ms365_redirect_uri";
const VERIFIER_STORAGE_KEY = "pp_ms365_code_verifier";
const STATE_STORAGE_KEY = "pp_ms365_state";

function verifierKey(state?: string | null): string {
  return state ? `${VERIFIER_STORAGE_KEY}:${state}` : VERIFIER_STORAGE_KEY;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Base64Url(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64Url(new Uint8Array(hash));
}

function createCodeVerifier(): string {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function setNativeItem(key: string, value: string): Promise<void> {
  try {
    if (!Capacitor.isNativePlatform()) return;
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key, value });
  } catch {}
}

async function getNativeItem(key: string): Promise<string | null> {
  try {
    if (!Capacitor.isNativePlatform()) return null;
    const { Preferences } = await import("@capacitor/preferences");
    const { value } = await Preferences.get({ key });
    return value ?? null;
  } catch {
    return null;
  }
}

async function removeNativeItem(key: string): Promise<void> {
  try {
    if (!Capacitor.isNativePlatform()) return;
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.remove({ key });
  } catch {}
}

export function getMs365RedirectUri(): string {
  if (Capacitor.isNativePlatform()) return MS365_NATIVE_REDIRECT_URI;
  return `${window.location.origin}${MS365_WEB_CALLBACK_PATH}`;
}

export function rememberMs365RedirectUri(redirectUri: string): void {
  try { sessionStorage.setItem(REDIRECT_STORAGE_KEY, redirectUri); } catch {}
  try { localStorage.setItem(REDIRECT_STORAGE_KEY, redirectUri); } catch {}
  void setNativeItem(REDIRECT_STORAGE_KEY, redirectUri);
}

export async function getRememberedMs365RedirectUri(): Promise<string> {
  try {
    return sessionStorage.getItem(REDIRECT_STORAGE_KEY) || localStorage.getItem(REDIRECT_STORAGE_KEY) || await getNativeItem(REDIRECT_STORAGE_KEY) || getMs365RedirectUri();
  } catch {
    return await getNativeItem(REDIRECT_STORAGE_KEY) || getMs365RedirectUri();
  }
}

export function clearRememberedMs365RedirectUri(): void {
  try { sessionStorage.removeItem(REDIRECT_STORAGE_KEY); } catch {}
  try { localStorage.removeItem(REDIRECT_STORAGE_KEY); } catch {}
  try { sessionStorage.removeItem(VERIFIER_STORAGE_KEY); } catch {}
  try { localStorage.removeItem(VERIFIER_STORAGE_KEY); } catch {}
  try { sessionStorage.removeItem(STATE_STORAGE_KEY); } catch {}
  try { localStorage.removeItem(STATE_STORAGE_KEY); } catch {}
  void removeNativeItem(REDIRECT_STORAGE_KEY);
  void removeNativeItem(VERIFIER_STORAGE_KEY);
  void removeNativeItem(STATE_STORAGE_KEY);
  try {
    Object.keys(sessionStorage).filter((k) => k.startsWith(`${VERIFIER_STORAGE_KEY}:`)).forEach((k) => {
      sessionStorage.removeItem(k);
      void removeNativeItem(k);
    });
  } catch {}
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(`${VERIFIER_STORAGE_KEY}:`)).forEach((k) => {
      localStorage.removeItem(k);
      void removeNativeItem(k);
    });
  } catch {}
}

export async function getRememberedMs365CodeVerifier(state?: string | null): Promise<string | null> {
  let rememberedState: string | null = null;
  try { rememberedState = state || sessionStorage.getItem(STATE_STORAGE_KEY) || localStorage.getItem(STATE_STORAGE_KEY); } catch {}
  try {
    return sessionStorage.getItem(verifierKey(state)) ||
      localStorage.getItem(verifierKey(state)) ||
      (rememberedState ? sessionStorage.getItem(verifierKey(rememberedState)) : null) ||
      (rememberedState ? localStorage.getItem(verifierKey(rememberedState)) : null) ||
      sessionStorage.getItem(VERIFIER_STORAGE_KEY) ||
      localStorage.getItem(VERIFIER_STORAGE_KEY) ||
      (rememberedState ? await getNativeItem(verifierKey(rememberedState)) : null) ||
      (state ? await getNativeItem(verifierKey(state)) : null) ||
      await getNativeItem(VERIFIER_STORAGE_KEY);
  } catch {
    return (rememberedState ? await getNativeItem(verifierKey(rememberedState)) : null) ||
      (state ? await getNativeItem(verifierKey(state)) : null) ||
      await getNativeItem(VERIFIER_STORAGE_KEY);
  }
}

export async function buildMs365AuthorizeUrl(cfg: {
  clientId: string;
  tenant?: string | null;
  state?: string | null;
  prompt?: "select_account" | "consent" | "none";
  scopes?: string;
  loginHint?: string;
}): Promise<string> {
  const redirectUri = getMs365RedirectUri();
  rememberMs365RedirectUri(redirectUri);
  const oauthState = `${cfg.state ? `${cfg.state}:` : ""}${createCodeVerifier().slice(0, 18)}`;
  const verifier = createCodeVerifier();
  const challenge = await sha256Base64Url(verifier);
  try { sessionStorage.setItem(verifierKey(oauthState), verifier); sessionStorage.setItem(VERIFIER_STORAGE_KEY, verifier); } catch {}
  try { localStorage.setItem(verifierKey(oauthState), verifier); localStorage.setItem(VERIFIER_STORAGE_KEY, verifier); } catch {}
  try { sessionStorage.setItem(STATE_STORAGE_KEY, oauthState); localStorage.setItem(STATE_STORAGE_KEY, oauthState); } catch {}
  await setNativeItem(REDIRECT_STORAGE_KEY, redirectUri);
  await setNativeItem(STATE_STORAGE_KEY, oauthState);
  await setNativeItem(verifierKey(oauthState), verifier);
  await setNativeItem(VERIFIER_STORAGE_KEY, verifier);
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: cfg.scopes ?? MS365_DELEGATED_SCOPES,
    prompt: cfg.prompt ?? "select_account",
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  if (cfg.loginHint) params.set("login_hint", cfg.loginHint);
  params.set("state", oauthState);
  return `https://login.microsoftonline.com/${cfg.tenant || "common"}/oauth2/v2.0/authorize?${params.toString()}`;
}

export async function openMs365Authorize(cfg: {
  clientId: string;
  tenant?: string | null;
  state?: string | null;
  prompt?: "select_account" | "consent" | "none";
  scopes?: string;
  loginHint?: string;
}): Promise<void> {
  const url = await buildMs365AuthorizeUrl(cfg);
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      // On iOS/Android: use SFSafariViewController so the deep-link callback
      // (capacitor://localhost/auth/microsoft/callback) is properly intercepted
      // by App.addListener('appUrlOpen') in NativeDeepLinkBridge.
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url, presentationStyle: "fullscreen" });
      return;
    }
  } catch { /* fall through to web */ }
  // Web: direct navigation
  window.location.href = url;
}
/**
 * Async aliases kept in parity with the web app (`src/lib/ms365OAuth.ts`).
 * The mobile callback reads these after a deep-link relaunch, where the
 * WebView storage may have been recreated and only native Preferences hold
 * the PKCE state.
 */
export async function getRememberedMs365RedirectUriAsync(): Promise<string> {
  return getRememberedMs365RedirectUri();
}

export async function getRememberedMs365CodeVerifierAsync(
  state?: string | null,
): Promise<string | null> {
  return getRememberedMs365CodeVerifier(state);
}
