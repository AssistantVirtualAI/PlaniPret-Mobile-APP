/**
 * Shared cache for pp-ns-contacts + Maestro contacts.
 * - In-memory TTL (60s) with in-flight dedup so parallel callers share one request.
 * - Persisted to localStorage so the directory is available INSTANTLY on the
 *   next app open (dialer / search / contacts render from disk while a fresh
 *   copy is fetched in the background).
 */
import { supabase } from "@/integrations/supabase/client";

type Action = "list" | "shared" | "directory" | "maestro";
type Entry = { at: number; value: any[] };

const TTL_MS = 60_000;
const LS_PREFIX = "pp:contacts:cache:v1:";
const LS_TTL_MS = 24 * 60 * 60 * 1000; // keep stale copy up to 24h

const cache = new Map<Action, Entry>();
const inflight = new Map<Action, Promise<any[]>>();

function lsKey(action: Action) { return `${LS_PREFIX}${action}`; }

function loadFromDisk(action: Action): Entry | null {
  try {
    const raw = localStorage.getItem(lsKey(action));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Entry;
    if (!parsed || !Array.isArray(parsed.value)) return null;
    if (Date.now() - parsed.at > LS_TTL_MS) return null;
    return parsed;
  } catch { return null; }
}

function saveToDisk(action: Action, entry: Entry) {
  try { localStorage.setItem(lsKey(action), JSON.stringify(entry)); } catch { /* quota */ }
}

// Seed in-memory cache from disk on module init (synchronous, no I/O beyond localStorage).
(["list", "shared", "directory", "maestro"] as Action[]).forEach((a) => {
  const disk = loadFromDisk(a);
  if (disk) cache.set(a, disk);
});

function keyFor(payload: any): any[] {
  return payload?.directory ?? payload?.contacts ?? [];
}

async function fetchNs(action: Exclude<Action, "maestro">, limit: number): Promise<any[]> {
  const { data, error } = await supabase.functions.invoke("pp-ns-contacts", {
    body: { action, limit },
  });
  const payload: any = data ?? {};
  if (error || payload?.error) throw new Error(payload?.error || error?.message || action);
  return keyFor(payload);
}

async function fetchMaestro(): Promise<any[]> {
  const { data, error } = await supabase.functions.invoke("maestro-actions", {
    body: { action: "list_contacts", payload: { query: "" } },
  });
  const payload: any = data ?? {};
  if (error || payload?.success === false) throw new Error(payload?.error || error?.message || "maestro");
  const list = payload.contacts ?? [];
  // Normalize Maestro contact shape to the dialer's expected fields.
  return list.map((c: any) => ({
    id: c.id ?? c.client_id ?? c.uuid,
    first_name: c.first_name ?? c.firstname,
    last_name: c.last_name ?? c.lastname,
    name: c.name ?? c.full_name,
    display_name: c.display_name ?? c.full_name,
    email: c.email,
    company: c.company ?? c.employer,
    phone: c.phone ?? c.mobile ?? c.cell_phone,
    cell_phone: c.cell_phone ?? c.mobile,
    work_phone: c.work_phone ?? c.office_phone,
    home_phone: c.home_phone,
    maestro_client_id: c.id ?? c.client_id,
  }));
}

export async function getPpContacts(
  action: Action,
  opts: { limit?: number; force?: boolean } = {},
): Promise<any[]> {
  const now = Date.now();
  if (!opts.force) {
    const hit = cache.get(action);
    if (hit && now - hit.at < TTL_MS) return hit.value;
    const pending = inflight.get(action);
    if (pending) return pending;
  }
  const p = (async () => {
    const value = action === "maestro"
      ? await fetchMaestro()
      : await fetchNs(action, opts.limit ?? 500);
    const entry: Entry = { at: Date.now(), value };
    cache.set(action, entry);
    saveToDisk(action, entry);
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
  if (action) { cache.delete(action); try { localStorage.removeItem(lsKey(action)); } catch {} }
  else {
    cache.clear();
    try {
      (["list", "shared", "directory", "maestro"] as Action[]).forEach((a) => localStorage.removeItem(lsKey(a)));
    } catch {}
  }
}

/** Synchronous peek — returns a cached value if it exists, even if it's stale (< 24h). */
export function peekPpContacts(action: Action): any[] | null {
  const hit = cache.get(action);
  if (hit) return hit.value;
  const disk = loadFromDisk(action);
  if (disk) { cache.set(action, disk); return disk.value; }
  return null;
}

/**
 * Fire-and-forget prefetch. Warms cache in parallel so subsequent pages
 * (Directory, Teams, Home, Dialer) render from memory instead of blocking.
 * Safe to call repeatedly — dedup + TTL are handled by getPpContacts.
 */
export function prefetchPpContacts(
  actions: Action[] = ["list", "shared", "directory"],
  limit = 500,
): void {
  for (const action of actions) {
    // If cache is fresh (< TTL) skip; otherwise refresh in background.
    const hit = cache.get(action);
    if (hit && Date.now() - hit.at < TTL_MS) continue;
    void getPpContacts(action, { limit }).catch(() => {});
  }
}
