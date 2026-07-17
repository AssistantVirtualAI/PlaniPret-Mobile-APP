// Lightweight probe to detect if a Supabase OAuth provider is enabled without
// navigating the user. Uses a manual-redirect fetch: an enabled provider
// answers with 302 (opaqueredirect / status=0), a disabled one returns 400
// with error_code=validation_failed and body "provider is not enabled".
//
// Results are cached in sessionStorage for the tab's lifetime so we do not
// re-probe on every mount of the auth page.

export type ProviderStatus = "enabled" | "disabled" | "unknown";

const CACHE_PREFIX = "ava.auth.provider.v1:";

function readCache(provider: string): ProviderStatus | null {
  try {
    const v = sessionStorage.getItem(CACHE_PREFIX + provider);
    return v === "enabled" || v === "disabled" ? v : null;
  } catch { return null; }
}

function writeCache(provider: string, status: ProviderStatus) {
  try { sessionStorage.setItem(CACHE_PREFIX + provider, status); } catch {}
}

export async function checkProviderEnabled(provider: string, opts: { force?: boolean; timeoutMs?: number } = {}): Promise<ProviderStatus> {
  if (!opts.force) {
    const cached = readCache(provider);
    if (cached) return cached;
  }
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!base) return "unknown";
  const url = `${base}/auth/v1/authorize?provider=${encodeURIComponent(provider)}&redirect_to=${encodeURIComponent(window.location.origin)}`;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), opts.timeoutMs ?? 3500);
  try {
    const res = await fetch(url, { method: "GET", redirect: "manual", signal: controller.signal, mode: "cors" });
    // opaqueredirect (status 0/type "opaqueredirect") => enabled; 3xx also enabled
    if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
      writeCache(provider, "enabled");
      return "enabled";
    }
    if (res.status === 400 || res.status === 404) {
      writeCache(provider, "disabled");
      return "disabled";
    }
    // 2xx or other — treat as enabled to avoid hiding the button on false negatives.
    writeCache(provider, "enabled");
    return "enabled";
  } catch (e) {
    // Network / CORS / abort — do not cache, return unknown so the UI can retry later.
    console.warn(`[auth-probe] ${provider} check failed`, e);
    return "unknown";
  } finally {
    window.clearTimeout(timer);
  }
}
