/**
 * Shared cache for pp-ns-contacts actions.
 *
 * - In-memory cache (fresh: <TTL_MS, stale: <STALE_MS) with in-flight dedup.
 * - sessionStorage persistence so `peekPpContacts` returns instantly after a
 *   back-navigation or hard remount within the same tab session.
 * - Controlled invalidation via `invalidatePpContacts(action?)`.
 */
import { supabase } from "@/integrations/supabase/client";

type Action = "list" | "shared" | "directory";
type Entry = { at: number; value: any[] };

const TTL_MS = 60_000;            // considered "fresh"
const STALE_MS = 15 * 60_000;     // still usable for instant render (SWR)
const SS_PREFIX = "pp.contacts.cache.v1:";

const cache = new Map<Action, Entry>();
const inflight = new Map<Action, Promise<any[]>>();

function ssKey(a: Action) { return SS_PREFIX + a; }

function loadFromSession(a: Action): Entry | null {
  try {
    const raw = sessionStorage.getItem(ssKey(a));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.at !== "number" || !Array.isArray(parsed.value)) return null;
    return parsed as Entry;
  } catch { return null; }
}
function saveToSession(a: Action, entry: Entry) {
  try { sessionStorage.setItem(ssKey(a), JSON.stringify(entry)); } catch {}
}
function clearSession(a?: Action) {
  try {
    if (a) sessionStorage.removeItem(ssKey(a));
    else (["list","shared","directory"] as Action[]).forEach((k) => sessionStorage.removeItem(ssKey(k)));
  } catch {}
}

function readEntry(a: Action): Entry | null {
  const mem = cache.get(a);
  if (mem) return mem;
  const ss = loadFromSession(a);
  if (ss) { cache.set(a, ss); return ss; }
  return null;
}

function keyFor(payload: any): any[] {
  return payload?.directory ?? payload?.contacts ?? [];
}

export async function getPpContacts(action: Action, opts: { limit?: number; force?: boolean } = {}): Promise<any[]> {
  const now = Date.now();
  if (!opts.force) {
    const hit = readEntry(action);
    if (hit && now - hit.at < TTL_MS) return hit.value;
    const pending = inflight.get(action);
    if (pending) return pending;
  }
  const p = (async () => {
    const { data, error } = await supabase.functions.invoke("pp-ns-contacts", {
      body: { action, limit: opts.limit ?? 500 },
    });
    const payload: any = data ?? {};
    if (error || payload?.error) throw new Error(payload?.error || error?.message || action);
    const value = keyFor(payload);
    const entry = { at: Date.now(), value };
    cache.set(action, entry);
    saveToSession(action, entry);
    return value;
  })();
  inflight.set(action, p);
  try {
    return await p;
  } finally {
    inflight.delete(action);
  }
}

export function invalidatePpContacts(action?: Action) {
  if (action) { cache.delete(action); clearSession(action); }
  else { cache.clear(); clearSession(); }
}

/**
 * Synchronous peek. Returns cached value (fresh OR stale-but-within-STALE_MS)
 * so pages can render instantly on mount after a back-navigation.
 * Returns null only if we truly have nothing usable.
 */
export function peekPpContacts(action: Action): any[] | null {
  const hit = readEntry(action);
  if (!hit) return null;
  if (Date.now() - hit.at >= STALE_MS) return null;
  return hit.value;
}

/** Fire-and-forget prefetch. */
export function prefetchPpContacts(actions: Action[] = ["list", "shared", "directory"], limit = 500): void {
  for (const action of actions) {
    const hit = readEntry(action);
    if (hit && Date.now() - hit.at < TTL_MS) continue;
    void getPpContacts(action, { limit }).catch(() => {});
  }
}
