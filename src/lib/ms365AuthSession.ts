import { Capacitor, registerPlugin } from "@capacitor/core";

/**
 * iOS ASWebAuthenticationSession bridge.
 *
 * SFSafariViewController (@capacitor/browser) cannot follow a custom-scheme
 * redirect on its own: iOS shows "Ouvrir cette page dans « Planiprêt Mobile » ?"
 * and, when the user taps it, the app is re-opened through a deep link that can
 * lose the OAuth query/PKCE state. ASWebAuthenticationSession returns the
 * callback URL directly to JS, so the exchange happens in the same WebView
 * session with zero prompts.
 */
type PpAuthSessionPlugin = {
  start(options: { url: string; scheme: string; ephemeral?: boolean }): Promise<{ url?: string; cancelled?: boolean }>;
};

const PpAuthSession = registerPlugin<PpAuthSessionPlugin>("PpAuthSession");

export function schemeFromRedirectUri(redirectUri: string): string {
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(redirectUri);
  return match ? match[1] : "capacitor";
}

export function canUseNativeAuthSession(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

/** Reusable native OAuth session for any custom-scheme callback (Maestro too). */
export async function startNativeOAuthSession(url: string, redirectUri: string, ephemeral = false): Promise<string | null> {
  if (!canUseNativeAuthSession()) return null;
  const res = await PpAuthSession.start({ url, scheme: schemeFromRedirectUri(redirectUri), ephemeral });
  if (res?.cancelled) return null;
  return res?.url ?? null;
}

/**
 * Returns the raw callback URL, or null when the native session is
 * unavailable / cancelled (caller should fall back to the browser flow).
 */
export async function startNativeAuthSession(url: string, redirectUri: string): Promise<string | null> {
  if (!canUseNativeAuthSession()) return null;
  try {
    return await startNativeOAuthSession(url, redirectUri);
  } catch (e) {
    console.warn("[ms365] native auth session unavailable", (e as Error)?.message ?? e);
    return null;
  }
}
