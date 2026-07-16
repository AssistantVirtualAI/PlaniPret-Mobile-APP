/**
 * Generic in-memory cache + in-flight dedup for supabase.functions.invoke.
 *
 * - TTL (default 60s): repeat calls within TTL return cached value instantly.
 * - Dedup: parallel callers share a single network request.
 * - Stale-while-revalidate: if `swr` is true, returns stale value immediately
 *   and refreshes in the background.
 *
 * Usage:
 *   const data = await invokeCached("pp-admin-ava-elevenlabs", { body: { action: "list" } });
 *   invalidateEdgeCache("pp-admin-ava-elevenlabs");
 */
import { supabase } from "@/integrations/supabase/client";

type Entry = { at: number; value: any };
type Options = {
  body?: any;
  ttlMs?: number;
  swr?: boolean;
  key?: string; // override cache key (default: fn + JSON(body))
  force?: boolean;
};

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<any>>();

function makeKey(fn: string, body: any, override?: string): string {
  if (override) return override;
  try { return `${fn}::${JSON.stringify(body ?? null)}`; }
  catch { return `${fn}::[unserializable]`; }
}

export async function invokeCached<T = any>(fn: string, opts: Options = {}): Promise<T> {
  const { body, ttlMs = 60_000, swr = false, force = false } = opts;
  const key = makeKey(fn, body, opts.key);
  const now = Date.now();
  const hit = cache.get(key);
  const fresh = hit && now - hit.at < ttlMs;

  if (!force && fresh) return hit!.value as T;
  if (!force && swr && hit) {
    // Return stale immediately, refresh in background (no throw).
    void refresh(fn, body, key).catch(() => {});
    return hit.value as T;
  }

  const pending = inflight.get(key);
  if (pending && !force) return pending as Promise<T>;

  const p = refresh(fn, body, key);
  return p as Promise<T>;
}

async function refresh(fn: string, body: any, key: string): Promise<any> {
  const p = (async () => {
    const { data, error } = await supabase.functions.invoke(fn, { body });
    if (error) throw error;
    cache.set(key, { at: Date.now(), value: data });
    return data;
  })();
  inflight.set(key, p);
  try { return await p; }
  finally { inflight.delete(key); }
}

export function invalidateEdgeCache(fnOrPrefix?: string): void {
  if (!fnOrPrefix) { cache.clear(); return; }
  for (const k of cache.keys()) {
    if (k === fnOrPrefix || k.startsWith(fnOrPrefix + "::")) cache.delete(k);
  }
}

export function peekEdgeCache<T = any>(fn: string, body?: any, keyOverride?: string): T | null {
  const key = makeKey(fn, body, keyOverride);
  const hit = cache.get(key);
  return hit ? (hit.value as T) : null;
}

/** Fire-and-forget prefetch. Warms the cache without blocking the caller. */
export function prefetchEdge(fn: string, opts: Options = {}): void {
  if (peekEdgeCache(fn, opts.body, opts.key)) return;
  void invokeCached(fn, opts).catch(() => {});
}
