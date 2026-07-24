import { Capacitor } from "@capacitor/core";

export const MS365_DELEGATED_SCOPES =
  "openid profile email offline_access User.Read User.ReadBasic.All User.Read.All Contacts.Read Contacts.ReadWrite People.Read Mail.ReadWrite Mail.Send MailboxSettings.Read Calendars.ReadWrite Chat.Read Chat.ReadBasic Chat.ReadWrite ChatMessage.Send Channel.ReadBasic.All ChannelMessage.Read.All ChannelMessage.Send Team.ReadBasic.All Presence.Read.All Files.ReadWrite Files.ReadWrite.All Sites.ReadWrite.All Organization.Read.All Application.Read.All";

export const MS365_WEB_CALLBACK_PATH = "/auth/microsoft/callback";
export const MS365_NATIVE_REDIRECT_URI = "capacitor://localhost/auth/microsoft/callback";

// ─── Storage keys ────────────────────────────────────────────────────────────
// On iOS, sessionStorage/localStorage may be wiped when SFSafariViewController
// closes and the app resumes. We therefore ALWAYS write to three places:
//   1. sessionStorage (fastest, lost on app suspend)
//   2. localStorage   (survives background, may be lost on iOS low-memory)
//   3. @capacitor/preferences → NSUserDefaults (survives app suspend/resume)
//
// The verifier is stored under a SINGLE FIXED KEY (not state-dependent) so
// that URL-encoding differences in the `state` param returned by Microsoft
// can never cause a key mismatch.
const REDIRECT_STORAGE_KEY = "pp_ms365_redirect_uri";
const VERIFIER_STORAGE_KEY = "pp_ms365_code_verifier";
// We also keep a secondary slot so a concurrent auth attempt doesn't wipe the
// first one before the callback fires.
const VERIFIER_BACKUP_KEY  = "pp_ms365_code_verifier_bak";

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

// ─── Native storage helpers ──────────────────────────────────────────────────
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

// ─── Redirect URI ─────────────────────────────────────────────────────────────
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
    return (
      sessionStorage.getItem(REDIRECT_STORAGE_KEY) ||
      localStorage.getItem(REDIRECT_STORAGE_KEY) ||
      await getNativeItem(REDIRECT_STORAGE_KEY) ||
      getMs365RedirectUri()
    );
  } catch {
    return await getNativeItem(REDIRECT_STORAGE_KEY) || getMs365RedirectUri();
  }
}

export function clearRememberedMs365RedirectUri(): void {
  try { sessionStorage.removeItem(REDIRECT_STORAGE_KEY); } catch {}
  try { localStorage.removeItem(REDIRECT_STORAGE_KEY); } catch {}
  try { sessionStorage.removeItem(VERIFIER_STORAGE_KEY); } catch {}
  try { localStorage.removeItem(VERIFIER_STORAGE_KEY); } catch {}
  try { sessionStorage.removeItem(VERIFIER_BACKUP_KEY); } catch {}
  try { localStorage.removeItem(VERIFIER_BACKUP_KEY); } catch {}
  void removeNativeItem(REDIRECT_STORAGE_KEY);
  void removeNativeItem(VERIFIER_STORAGE_KEY);
  void removeNativeItem(VERIFIER_BACKUP_KEY);
  // Also clean up any legacy state-keyed entries
  try {
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith(`${VERIFIER_STORAGE_KEY}:`))
      .forEach((k) => { sessionStorage.removeItem(k); void removeNativeItem(k); });
  } catch {}
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(`${VERIFIER_STORAGE_KEY}:`))
      .forEach((k) => { localStorage.removeItem(k); void removeNativeItem(k); });
  } catch {}
}

/**
 * Retrieve the stored PKCE code_verifier.
 *
 * The `state` parameter is accepted for backward compatibility but is NOT used
 * as the primary lookup key. On iOS, the state value returned by Microsoft in
 * the redirect URL may differ from what was stored (URL-encoding, truncation)
 * which caused "Connexion interrompue" errors. We now use a fixed key only.
 *
 * Reading order (fastest → most reliable):
 *   sessionStorage → localStorage → @capacitor/preferences (primary key)
 *   sessionStorage → localStorage → @capacitor/preferences (backup key)
 */
export async function getRememberedMs365CodeVerifier(
  _state?: string | null,
): Promise<string | null> {
  // Primary fixed key
  try {
    const fromSession = sessionStorage.getItem(VERIFIER_STORAGE_KEY);
    if (fromSession) return fromSession;
    const fromLocal = localStorage.getItem(VERIFIER_STORAGE_KEY);
    if (fromLocal) return fromLocal;
  } catch {}
  const fromNative = await getNativeItem(VERIFIER_STORAGE_KEY);
  if (fromNative) return fromNative;

  // Backup key (written simultaneously as a safety copy)
  try {
    const fromSessionBak = sessionStorage.getItem(VERIFIER_BACKUP_KEY);
    if (fromSessionBak) return fromSessionBak;
    const fromLocalBak = localStorage.getItem(VERIFIER_BACKUP_KEY);
    if (fromLocalBak) return fromLocalBak;
  } catch {}
  return await getNativeItem(VERIFIER_BACKUP_KEY);
}

// ─── Build the authorization URL ─────────────────────────────────────────────
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

  // Use a simple alphanumeric state — no colons, no special chars — so that
  // URL-encoding by Microsoft's redirect can never change the value.
  const oauthState = (cfg.state ?? "pp") + "_" + createCodeVerifier().slice(0, 16).replace(/[^A-Za-z0-9]/g, "x");

  const verifier = createCodeVerifier();
  const challenge = await sha256Base64Url(verifier);

  // Write to ALL storage layers simultaneously
  try { sessionStorage.setItem(VERIFIER_STORAGE_KEY, verifier); sessionStorage.setItem(VERIFIER_BACKUP_KEY, verifier); } catch {}
  try { localStorage.setItem(VERIFIER_STORAGE_KEY, verifier); localStorage.setItem(VERIFIER_BACKUP_KEY, verifier); } catch {}
  // Native write is async — fire both in parallel
  await Promise.all([
    setNativeItem(VERIFIER_STORAGE_KEY, verifier),
    setNativeItem(VERIFIER_BACKUP_KEY, verifier),
  ]);

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: cfg.scopes ?? MS365_DELEGATED_SCOPES,
    prompt: cfg.prompt ?? "select_account",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: oauthState,
  });
  if (cfg.loginHint) params.set("login_hint", cfg.loginHint);

  return `https://login.microsoftonline.com/${cfg.tenant || "common"}/oauth2/v2.0/authorize?${params.toString()}`;
}

// ─── Open the authorization flow ─────────────────────────────────────────────
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
