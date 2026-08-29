/**
 * Resilience layer for the commissions dashboards.
 *
 * - `readStatsCache` / `writeStatsCache`: keeps the last successfully rendered
 *   Maestro payload so the page never goes blank when the endpoint is down.
 * - `readMaestroSyncStatus` / `writeMaestroSyncStatus`: last sync date, number
 *   of imported commissions and the last error, shared across components.
 */

const STATS_PREFIX = "pp-commissions-cache:";
const STATUS_PREFIX = "pp-maestro-sync-status:";
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;

export type StatsCacheEntry = { ts: number; value: any };

export type MaestroSyncStatus = {
  at: string;                 // ISO date of the attempt
  ok: boolean;
  written: number;            // commissions imported/updated
  candidates?: number;
  brokers?: number;
  unlinked?: string[];
  code?: string | null;
  error?: string | null;
};

export const statsCacheKey = (scope: "admin" | "broker", parts: (string | number)[]) =>
  `${STATS_PREFIX}${scope}:${parts.join("|")}`;

export function readStatsCache(key: string): StatsCacheEntry | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StatsCacheEntry;
    if (!parsed?.value || Date.now() - parsed.ts > MAX_AGE_MS) return null;
    return parsed;
  } catch { return null; }
}

export function writeStatsCache(key: string, value: any): void {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), value })); } catch { /* quota */ }
}

/** Most recent cached payload for a scope, whatever the filters were. */
export function readAnyStatsCache(scope: "admin" | "broker"): StatsCacheEntry | null {
  let best: StatsCacheEntry | null = null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(`${STATS_PREFIX}${scope}:`)) continue;
      const entry = readStatsCache(k);
      if (entry && (!best || entry.ts > best.ts)) best = entry;
    }
  } catch { /* ignore */ }
  return best;
}

export const MAESTRO_SYNC_EVENT = "pp:maestro-sync-status";

export function readMaestroSyncStatus(scope: "admin" | "broker"): MaestroSyncStatus | null {
  try {
    const raw = localStorage.getItem(STATUS_PREFIX + scope);
    return raw ? (JSON.parse(raw) as MaestroSyncStatus) : null;
  } catch { return null; }
}

export function writeMaestroSyncStatus(scope: "admin" | "broker", status: MaestroSyncStatus): void {
  try { localStorage.setItem(STATUS_PREFIX + scope, JSON.stringify(status)); } catch { /* quota */ }
  try { window.dispatchEvent(new CustomEvent(MAESTRO_SYNC_EVENT, { detail: { scope, status } })); } catch { /* ssr */ }
}

export function relativeTime(iso: string | null | undefined, isFr: boolean): string | null {
  if (!iso) return null;
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (!Number.isFinite(min)) return null;
  if (min < 1) return isFr ? "à l'instant" : "just now";
  if (min < 60) return isFr ? `il y a ${min} min` : `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return isFr ? `il y a ${h} h` : `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return isFr ? `il y a ${d} j` : `${d} d ago`;
  return new Date(iso).toLocaleDateString(isFr ? "fr-CA" : "en-CA");
}
