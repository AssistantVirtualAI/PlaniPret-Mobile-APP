/**
 * ppPageCache — Universal sessionStorage page-data cache for Planiprêt Mobile.
 *
 * Strategy:
 *  - Each page stores its last-fetched data in sessionStorage under a key
 *    like `pp.page.<name>.<userId>`.
 *  - On mount, the page reads from cache first → instant first paint.
 *  - A background refresh runs silently; when done it updates the cache and
 *    the UI state.
 *  - TTL: 90 seconds (soft). After TTL the cache is still shown but a
 *    background refresh is triggered automatically.
 *  - Hard TTL: 10 minutes. After that, the cache is ignored and a full
 *    blocking fetch runs.
 *
 * Usage:
 *   const { cached, save } = usePageCache<MyData>("calls", userId);
 *   // On mount: if (cached) setData(cached);
 *   // After fetch: save(freshData);
 */

const SOFT_TTL_MS = 90_000;   // 90 s — background refresh
const HARD_TTL_MS = 600_000;  // 10 min — blocking fetch

type CacheEntry<T> = {
  data: T;
  at: number;
};

function storageKey(name: string, userId: string): string {
  return `pp.page.${name}.${userId}`;
}

export function readPageCache<T>(name: string, userId: string): { data: T; stale: boolean } | null {
  if (!userId) return null;
  try {
    const raw = sessionStorage.getItem(storageKey(name, userId));
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    const age = Date.now() - entry.at;
    if (age > HARD_TTL_MS) {
      sessionStorage.removeItem(storageKey(name, userId));
      return null;
    }
    return { data: entry.data, stale: age > SOFT_TTL_MS };
  } catch {
    return null;
  }
}

export function writePageCache<T>(name: string, userId: string, data: T): void {
  if (!userId) return;
  try {
    const entry: CacheEntry<T> = { data, at: Date.now() };
    sessionStorage.setItem(storageKey(name, userId), JSON.stringify(entry));
  } catch {
    // sessionStorage full or unavailable — silently ignore
  }
}

export function invalidatePageCache(name: string, userId: string): void {
  if (!userId) return;
  try { sessionStorage.removeItem(storageKey(name, userId)); } catch {}
}

/**
 * React hook — wraps readPageCache / writePageCache.
 *
 * Returns:
 *  - `cached`: the cached data (or null)
 *  - `stale`: true if the cache is older than SOFT_TTL_MS
 *  - `save(data)`: write fresh data to cache
 *  - `invalidate()`: remove the cache entry
 */
export function usePageCache<T>(name: string, userId: string | undefined) {
  const uid = userId ?? "";
  const cached = uid ? readPageCache<T>(name, uid) : null;
  return {
    cached: cached?.data ?? null,
    stale: cached?.stale ?? true,
    save: (data: T) => writePageCache(name, uid, data),
    invalidate: () => invalidatePageCache(name, uid),
  };
}
