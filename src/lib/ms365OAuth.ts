import { Capacitor } from "@capacitor/core";

export const MS365_DELEGATED_SCOPES =
  "openid profile email offline_access User.Read User.ReadBasic.All User.Read.All Contacts.Read Contacts.ReadWrite People.Read Mail.ReadWrite Mail.Send MailboxSettings.Read Calendars.ReadWrite Chat.Read Chat.ReadBasic Chat.ReadWrite ChatMessage.Send Channel.ReadBasic.All ChannelMessage.Read.All ChannelMessage.Send Team.ReadBasic.All Presence.Read.All Files.ReadWrite Files.ReadWrite.All Sites.ReadWrite.All Organization.Read.All Application.Read.All";

export const MS365_WEB_CALLBACK_PATH = "/auth/microsoft/callback";
export const MS365_NATIVE_REDIRECT_URI = "capacitor://localhost/auth/microsoft/callback";

const REDIRECT_STORAGE_KEY = "pp_ms365_redirect_uri";
const VERIFIER_STORAGE_KEY = "pp_ms365_code_verifier";

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

// ─── Capacitor Preferences helpers (native persistent storage) ───────────────
// On iOS, localStorage/sessionStorage can be cleared when the app is suspended
// and Safari closes. @capacitor/preferences writes to NSUserDefaults which
// survives app suspension and SFSafariViewController closure.
async function nativeSet(key: string, value: string): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Preferences } = await import("@capacitor/preferences");
      await Preferences.set({ key, value });
    }
  } catch { /* non-blocking */ }
}

async function nativeGet(key: string): Promise<string | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Preferences } = await import("@capacitor/preferences");
      const { value } = await Preferences.get({ key });
      return value;
    }
  } catch { /* non-blocking */ }
  return null;
}

async function nativeRemove(key: string): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Preferences } = await import("@capacitor/preferences");
      await Preferences.remove({ key });
    }
  } catch { /* non-blocking */ }
}
// ─────────────────────────────────────────────────────────────────────────────

export function getMs365RedirectUri(): string {
  if (Capacitor.isNativePlatform()) return MS365_NATIVE_REDIRECT_URI;
  return `${window.location.origin}${MS365_WEB_CALLBACK_PATH}`;
}

export function rememberMs365RedirectUri(redirectUri: string): void {
  try { sessionStorage.setItem(REDIRECT_STORAGE_KEY, redirectUri); } catch {}
  try { localStorage.setItem(REDIRECT_STORAGE_KEY, redirectUri); } catch {}
  // Also persist natively (fire-and-forget)
  nativeSet(REDIRECT_STORAGE_KEY, redirectUri).catch(() => {});
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
  try { sessionStorage.removeItem(VERIFIER_STORAGE_KEY); } catch {}
  try { localStorage.removeItem(VERIFIER_STORAGE_KEY); } catch {}
  try {
    Object.keys(sessionStorage).filter((k) => k.startsWith(`${VERIFIER_STORAGE_KEY}:`)).forEach((k) => sessionStorage.removeItem(k));
  } catch {}
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(`${VERIFIER_STORAGE_KEY}:`)).forEach((k) => localStorage.removeItem(k));
  } catch {}
  // Clear native storage too
  nativeRemove(REDIRECT_STORAGE_KEY).catch(() => {});
  nativeRemove(VERIFIER_STORAGE_KEY).catch(() => {});
}

/**
 * Retrieve the PKCE code_verifier.
 * Priority: sessionStorage → localStorage → Capacitor Preferences (native).
 * This is async to support the native fallback on iOS.
 */
export async function getRememberedMs365CodeVerifierAsync(state?: string | null): Promise<string | null> {
  // 1. Try sessionStorage (fastest, web)
  try {
    const ss = sessionStorage.getItem(verifierKey(state)) || sessionStorage.getItem(VERIFIER_STORAGE_KEY);
    if (ss) return ss;
  } catch {}
  // 2. Try localStorage
  try {
    const ls = localStorage.getItem(verifierKey(state)) || localStorage.getItem(VERIFIER_STORAGE_KEY);
    if (ls) return ls;
  } catch {}
  // 3. Fallback to Capacitor Preferences (survives iOS app suspension)
  const stateKey = state ? verifierKey(state) : null;
  if (stateKey) {
    const nv = await nativeGet(stateKey);
    if (nv) return nv;
  }
  const nv = await nativeGet(VERIFIER_STORAGE_KEY);
  if (nv) return nv;
  return null;
}

/** Synchronous version kept for backward compatibility (web only) */
export function getRememberedMs365CodeVerifier(state?: string | null): string | null {
  try {
    return sessionStorage.getItem(verifierKey(state)) || localStorage.getItem(verifierKey(state)) || sessionStorage.getItem(VERIFIER_STORAGE_KEY) || localStorage.getItem(VERIFIER_STORAGE_KEY);
  } catch {
    return null;
  }
}

export async function buildMs365AuthorizeUrl(cfg: {
  clientId: string;
  tenant?: string | null;
  state?: string | null;
  prompt?: "select_account" | "consent" | "login" | "none";
  scopes?: string;
  loginHint?: string;
}): Promise<string> {
  const redirectUri = getMs365RedirectUri();
  rememberMs365RedirectUri(redirectUri);
  const oauthState = `${cfg.state ? `${cfg.state}:` : ""}${createCodeVerifier().slice(0, 18)}`;
  const verifier = createCodeVerifier();
  const challenge = await sha256Base64Url(verifier);
  // Store in all available storages for maximum resilience
  try { sessionStorage.setItem(verifierKey(oauthState), verifier); sessionStorage.setItem(VERIFIER_STORAGE_KEY, verifier); } catch {}
  try { localStorage.setItem(verifierKey(oauthState), verifier); localStorage.setItem(VERIFIER_STORAGE_KEY, verifier); } catch {}
  // Persist natively — this is the critical path for iOS (await to ensure it's written before Browser.open)
  await nativeSet(verifierKey(oauthState), verifier).catch(() => {});
  await nativeSet(VERIFIER_STORAGE_KEY, verifier).catch(() => {});
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
  prompt?: "select_account" | "consent" | "login" | "none";
  scopes?: string;
  loginHint?: string;
}): Promise<void> {
  const url = await buildMs365AuthorizeUrl(cfg);
  try {
    if (Capacitor.isNativePlatform()) {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url, presentationStyle: "fullscreen" });
      return;
    }
  } catch { /* fall through to web */ }
  window.location.href = url;
}
