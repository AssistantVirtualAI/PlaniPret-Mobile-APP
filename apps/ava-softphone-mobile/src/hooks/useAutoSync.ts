/**
 * useAutoSync — stale-while-revalidate data hook for mobile screens.
 *
 * Improvements over previous version:
 *  - Stale-while-revalidate: cached data is shown instantly; we only re-fetch
 *    when the cache is older than `staleTimeMs` (default 30s).
 *  - In-memory shared cache keyed by `cacheKey` (avoids re-parsing JSON, and
 *    lets multiple screens share the same payload synchronously).
 *  - Global in-flight de-duplication: if two components mount with the same
 *    `cacheKey`, only one network request runs and both receive the result.
 *  - Cross-instance broadcast: when one hook resolves, every mounted hook
 *    with the same `cacheKey` updates its state — no extra fetch needed.
 *  - Visibility / focus refresh respects `staleTimeMs` (no thrash on tab
 *    switches).
 *  - Abort-aware retries with bounded backoff.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { nextSyncId, syncBegin, syncSuccess, syncError, onSyncRefresh } from '../lib/syncStatus';
import { perf } from '../lib/perfMetrics';

const CACHE_PREFIX = 'ava.mobile.cache.';

type CacheEntry<T> = { v: T; at: number };

// ─── Module-level shared state ─────────────────────────────────────────────
const memCache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
type Listener<T> = (e: CacheEntry<T>) => void;
const listeners = new Map<string, Set<Listener<any>>>();

function readPersistedCache<T>(key: string): CacheEntry<T> | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Migrate from legacy plain-value format → wrap with at=0 so it's stale.
    if (parsed && typeof parsed === 'object' && 'v' in parsed && 'at' in parsed) {
      return parsed as CacheEntry<T>;
    }
    return { v: parsed as T, at: 0 };
  } catch { return null; }
}
function writePersistedCache<T>(key: string, entry: CacheEntry<T>) {
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry)); } catch {}
}
function getCache<T>(key: string | undefined): CacheEntry<T> | null {
  if (!key) return null;
  const mem = memCache.get(key) as CacheEntry<T> | undefined;
  if (mem) return mem;
  const disk = readPersistedCache<T>(key);
  if (disk) memCache.set(key, disk);
  return disk;
}
function setCache<T>(key: string | undefined, value: T) {
  const entry: CacheEntry<T> = { v: value, at: Date.now() };
  if (key) {
    memCache.set(key, entry);
    writePersistedCache(key, entry);
    const subs = listeners.get(key);
    if (subs) for (const fn of subs) { try { fn(entry); } catch {} }
  }
  return entry;
}
function subscribe<T>(key: string, fn: Listener<T>) {
  let set = listeners.get(key);
  if (!set) { set = new Set(); listeners.set(key, set); }
  set.add(fn);
  return () => { set!.delete(fn); if (set!.size === 0) listeners.delete(key); };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Pré-remplit le cache partagé (utilisé par le prefetch au boot). */
export function seedAutoSyncCache<T>(cacheKey: string, value: T) {
  setCache(cacheKey, value);
}


export function useAutoSync<T>(
  loader: (signal?: AbortSignal) => Promise<T>,
  opts: {
    intervalMs?: number;
    deps?: unknown[];
    cacheKey?: string;
    timeoutMs?: number;
    retries?: number;
    retryBaseMs?: number;
    staleTimeMs?: number;
  } = {},
) {
  const {
    intervalMs = 15 * 60_000, // 15 min default (was 2 min) — reduces server load & BLF issues
    deps = [],
    cacheKey,
    timeoutMs = 10_000,
    retries = 1,
    retryBaseMs = 600,
    staleTimeMs = 60_000,
  } = opts;

  const initialEntry = getCache<T>(cacheKey);
  const [data, setData] = useState<T | null>(initialEntry?.v ?? null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(initialEntry?.at ?? null);

  const mounted = useRef(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const abortRef = useRef<AbortController | null>(null);
  const syncIdRef = useRef<string>(cacheKey || nextSyncId());

  const runLoader = useCallback(async (signal: AbortSignal): Promise<T> => {
    let attempt = 0;
    let lastErr: unknown = null;
    while (attempt <= retries) {
      const ac = new AbortController();
      const onAbort = () => ac.abort();
      signal.addEventListener('abort', onAbort);
      const timeout = setTimeout(() => ac.abort(), timeoutMs);
      try {
        const v = await loaderRef.current(ac.signal);
        clearTimeout(timeout);
        signal.removeEventListener('abort', onAbort);
        return v;
      } catch (e) {
        clearTimeout(timeout);
        signal.removeEventListener('abort', onAbort);
        lastErr = e;
        if (signal.aborted) throw e;
        attempt++;
        if (attempt > retries) break;
        await sleep(retryBaseMs * Math.pow(2, attempt - 1));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }, [retries, retryBaseMs, timeoutMs]);

  const refresh = useCallback(async (force = true) => {
    if (!mounted.current) return;
    const metricKey = cacheKey || 'anonymous';
    // Skip if cache is fresh enough.
    if (!force && cacheKey) {
      const entry = getCache<T>(cacheKey);
      if (entry && Date.now() - entry.at < staleTimeMs) {
        perf.hit(metricKey);
        setData(entry.v); setLastSyncedAt(entry.at); setError(null);
        return;
      }
    }
    perf.miss(metricKey);
    const sid = syncIdRef.current;
    syncBegin(sid);
    setLoading(true);
    const startedAt = performance.now();

    // Dedupe by cacheKey across instances.
    if (cacheKey && inflight.has(cacheKey)) {
      perf.dedupe();
      try {
        const v = (await inflight.get(cacheKey)) as T;
        if (!mounted.current) return;
        perf.timing(metricKey, performance.now() - startedAt);
        setData(v); setLastSyncedAt(Date.now()); setError(null); setLoading(false);
        syncSuccess(sid);
      } catch (e: any) {
        if (!mounted.current) return;
        perf.error();
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err); setLoading(false); syncError(sid, err.message || 'sync failed');
      }
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    perf.request();
    const promise = runLoader(ac.signal);
    if (cacheKey) inflight.set(cacheKey, promise as Promise<unknown>);
    try {
      const v = await promise;
      if (cacheKey) inflight.delete(cacheKey);
      const entry = setCache(cacheKey, v);
      if (!mounted.current) return;
      perf.timing(metricKey, performance.now() - startedAt);
      setData(entry.v); setLastSyncedAt(entry.at); setError(null); setLoading(false);
      syncSuccess(sid);
    } catch (e: any) {
      if (cacheKey) inflight.delete(cacheKey);
      if (!mounted.current) return;
      if (ac.signal.aborted) { syncError(sid, 'aborted'); setLoading(false); return; }
      perf.error();
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err); setLoading(false); syncError(sid, err.message || 'sync failed');
    }
  }, [cacheKey, runLoader, staleTimeMs]);

  useEffect(() => {
    mounted.current = true;

    // Subscribe to broadcasts from other instances sharing this cacheKey.
    let unsubBus = () => {};
    if (cacheKey) {
      unsubBus = subscribe<T>(cacheKey, (entry) => {
        if (!mounted.current) return;
        setData(entry.v); setLastSyncedAt(entry.at); setError(null);
      });
    }

    // Show cached immediately; only fetch if stale.
    refresh(false);

    let timer: ReturnType<typeof setInterval> | null = null;
    let unsubAppState: () => void = () => {};
    const start = () => { if (!timer) timer = setInterval(() => refresh(true), intervalMs); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    start();

    const maybeRefresh = () => {
      const entry = cacheKey ? getCache<T>(cacheKey) : null;
      if (!entry || Date.now() - entry.at > staleTimeMs) refresh(true);
    };

    (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (Capacitor.isNativePlatform()) {
          const { App } = await import('@capacitor/app');
          const sub = await App.addListener('appStateChange', (s) => {
            if (s.isActive) { maybeRefresh(); start(); } else stop();
          });
          unsubAppState = () => sub.remove();
        } else {
          const onFocus = () => { maybeRefresh(); start(); };
          const onBlur = () => stop();
          const onVis = () => {
            if (document.visibilityState === 'visible') { maybeRefresh(); start(); }
            else stop();
          };
          window.addEventListener('focus', onFocus);
          window.addEventListener('blur', onBlur);
          document.addEventListener('visibilitychange', onVis);
          unsubAppState = () => {
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('blur', onBlur);
            document.removeEventListener('visibilitychange', onVis);
          };
        }
      } catch { /* ignore */ }
    })();

    const unsubManual = onSyncRefresh(() => refresh(true));

    return () => {
      mounted.current = false;
      stop();
      unsubBus();
      unsubAppState();
      unsubManual();
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, lastSyncedAt, refresh: () => refresh(true) };
}
