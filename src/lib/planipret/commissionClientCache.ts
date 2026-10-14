// Client-side commission cache shared by portal and mobile (paid + pending).
// Validated server answers are kept in memory and on the device for 15 min so
// screens open instantly without re-reading Maestro. Scoped per signed-in
// user; errors and `ok: false` payloads are never cached (no false $0).
// A server "updated" broadcast invalidates everything so new figures show
// right away.
export const COMMISSION_CACHE_TTL_MS = 15 * 60_000;
const STORE_PREFIX = "pp.commission-cache.v1:";
const MAX_ENTRIES = 60;
export const COMMISSION_CACHE_FNS = new Set(["planipret-commission-reports", "pp-commission-stats"]);
const CACHEABLE_ACTIONS = new Set(["summary", "pending", "analytics", "deposits", "by_agent", "agents", "institutions"]);

type Entry = { ts: number; uid: string; value: unknown };
const mem = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

function stable(v: any): any {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])]));
  return v;
}

export function isCommissionCacheable(fn: string, body: any): boolean {
  if (!COMMISSION_CACHE_FNS.has(fn)) return false;
  if (body?.force === true || body?.refresh === true) return false;
  if (fn === "pp-commission-stats") return !body?.detailBrokerKey;
  return CACHEABLE_ACTIONS.has(String(body?.action ?? "summary"));
}

export function commissionCacheKey(uid: string, fn: string, body: any): string {
  return `${uid}|${fn}|${JSON.stringify(stable(body ?? {}))}`;
}

function storage(): Storage | null {
  try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; }
}

export function readCommissionCache(key: string, uid: string, maxAgeMs = COMMISSION_CACHE_TTL_MS): unknown | null {
  let e = mem.get(key) ?? null;
  if (!e) {
    try {
      const raw = storage()?.getItem(STORE_PREFIX + key);
      if (raw) { e = JSON.parse(raw) as Entry; mem.set(key, e); }
    } catch { e = null; }
  }
  if (!e || e.uid !== uid) return null;
  if (Date.now() - e.ts > maxAgeMs) return null;
  return e.value;
}

export function writeCommissionCache(key: string, uid: string, value: unknown) {
  const e: Entry = { ts: Date.now(), uid, value };
  mem.set(key, e);
  const s = storage();
  if (!s) return;
  try {
    // Drop other users' entries and keep the store bounded.
    const keys: { k: string; ts: number }[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (!k?.startsWith(STORE_PREFIX)) continue;
      try {
        const v = JSON.parse(s.getItem(k) ?? "null") as Entry | null;
        if (!v || v.uid !== uid) { s.removeItem(k); i--; continue; }
        keys.push({ k, ts: v.ts });
      } catch { s.removeItem(k); i--; }
    }
    if (keys.length >= MAX_ENTRIES) keys.sort((a, b) => a.ts - b.ts).slice(0, keys.length - MAX_ENTRIES + 1).forEach(({ k }) => s.removeItem(k));
    s.setItem(STORE_PREFIX + key, JSON.stringify(e));
  } catch { /* quota: memory copy still works */ }
}

/** Called on the server "updated" broadcast and on sign-out. */
export function invalidateCommissionCache() {
  mem.clear();
  const s = storage();
  if (!s) return;
  try {
    for (let i = s.length - 1; i >= 0; i--) {
      const k = s.key(i);
      if (k?.startsWith(STORE_PREFIX)) s.removeItem(k);
    }
  } catch { /* ignore */ }
}

export function isGoodCommissionPayload(data: any): boolean {
  if (!data || typeof data !== "object") return false;
  if (data.ok === false || data.error) return false;
  return true;
}

/** Deduplicate identical concurrent requests (several cards on one screen). */
export function dedupeCommission<T>(key: string, run: () => Promise<T>): Promise<T> {
  const cur = inflight.get(key) as Promise<T> | undefined;
  if (cur) return cur;
  const p = run().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
