import { lazy, type ComponentType } from "react";

/**
 * React.lazy with automatic in-memory retry (exponential backoff) and a
 * one-time hard reload when a dynamic import keeps failing — typically after
 * a redeploy invalidated the previous chunk hash. Prevents white screens on
 * flaky mobile networks or stale caches.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  key?: string,
) {
  return lazy(async () => {
    const storageKey = `__pp_lazy_retry_${key ?? factory.toString().slice(0, 80)}`;
    const attempts = 3;
    let lastErr: unknown;

    for (let i = 0; i < attempts; i++) {
      try {
        const mod = await factory();
        try { sessionStorage.removeItem(storageKey); } catch {}
        return mod;
      } catch (err) {
        lastErr = err;
        // small backoff before retry (200ms, 600ms)
        await new Promise((r) => setTimeout(r, 200 * Math.pow(3, i)));
      }
    }

    const msg = String((lastErr as any)?.message ?? lastErr ?? "");
    const isChunkError =
      /Importing a module script failed/i.test(msg) ||
      /Failed to fetch dynamically imported module/i.test(msg) ||
      /ChunkLoadError/i.test(msg) ||
      /error loading dynamically imported module/i.test(msg);

    if (isChunkError && typeof window !== "undefined") {
      let alreadyTried = false;
      try { alreadyTried = sessionStorage.getItem(storageKey) === "1"; } catch {}
      if (!alreadyTried) {
        try { sessionStorage.setItem(storageKey, "1"); } catch {}
        window.location.reload();
        return new Promise<never>(() => {});
      }
    }
    throw lastErr;
  });
}
