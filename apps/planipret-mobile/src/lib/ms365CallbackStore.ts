import { Capacitor } from "@capacitor/core";

const CALLBACK_URL_KEY = "pp_ms365_callback_url";

/**
 * Persists the raw Microsoft OAuth callback URL both in localStorage and in
 * native Preferences. On iOS the app can be cold-started by the custom-scheme
 * deep link, which recreates the WebView (and therefore session/localStorage
 * can be empty before hydration). Preferences survive that relaunch, so the
 * callback screen can always recover `code`/`state` and finish the exchange
 * instead of bouncing the user back to the Microsoft sign-in screen.
 */
export async function rememberMs365CallbackUrl(rawUrl: string): Promise<void> {
  try { localStorage.setItem(CALLBACK_URL_KEY, rawUrl); } catch {}
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key: CALLBACK_URL_KEY, value: rawUrl });
  } catch {}
}

export async function clearMs365CallbackUrl(): Promise<void> {
  try { localStorage.removeItem(CALLBACK_URL_KEY); } catch {}
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.remove({ key: CALLBACK_URL_KEY });
  } catch {}
}

async function readStoredCallbackUrl(): Promise<string | null> {
  let stored: string | null = null;
  try { stored = localStorage.getItem(CALLBACK_URL_KEY); } catch {}
  if (stored) return stored;
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { Preferences } = await import("@capacitor/preferences");
    const { value } = await Preferences.get({ key: CALLBACK_URL_KEY });
    return value ?? null;
  } catch {
    return null;
  }
}

export type Ms365CallbackParams = {
  code: string | null;
  state: string | null;
  error: string | null;
};

/**
 * Returns the OAuth params from the current route, falling back to the
 * persisted deep-link URL when the router did not receive them (cold start).
 */
export async function recoverMs365CallbackParams(
  params: URLSearchParams,
): Promise<Ms365CallbackParams> {
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error_description") ?? params.get("error");
  if (code || error) return { code, state, error };

  const stored = await readStoredCallbackUrl();
  if (!stored) return { code: null, state, error: null };
  try {
    const url = new URL(stored);
    const search = url.searchParams;
    return {
      code: search.get("code"),
      state: search.get("state") ?? state,
      error: search.get("error_description") ?? search.get("error"),
    };
  } catch {
    return { code: null, state, error: null };
  }
}
