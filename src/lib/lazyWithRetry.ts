import { lazy, type ComponentType } from "react";

/**
 * Wraps React.lazy with a one-time hard reload when a dynamic import fails
 * (typically after a redeploy invalidated the previous chunk hash).
 *
 * Errors: "Importing a module script failed", "Failed to fetch dynamically imported module",
 * "ChunkLoadError".
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  key?: string,
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    const storageKey = `__lazy_retry_${key ?? factory.toString().slice(0, 80)}`;
    try {
      const mod = await factory();
      try { sessionStorage.removeItem(storageKey); } catch {}
      return mod;
    } catch (err: any) {
      const msg = String(err?.message ?? err ?? "");
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
          // Force a full reload to fetch the fresh index.html + new chunk hashes.
          window.location.reload();
          // Return a never-resolving promise to keep Suspense pending until reload.
          return new Promise<never>(() => {});
        }
      }
      throw err;
    }
  });
}
