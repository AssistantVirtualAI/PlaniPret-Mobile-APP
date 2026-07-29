import { supabase } from "@/integrations/supabase/client";

export type Teams365Mode = "summary" | "teams" | "people" | "full";

export type Teams365Cache = {
  chats: any[];
  teams: any[];
  people: any[];
  diagnostics: Record<string, any>;
  cachedAt: number;
};

export const TEAMS_CACHE_KEY = "planipret.teams365.cache.v2";
const LEGACY_TEAMS_CACHE_KEY = "planipret.teams365.cache.v1";

// TTL: cached data is served instantly on load; if older than TTL_MS we
// still render it but trigger a background revalidation. Beyond HARD_TTL_MS
// we consider it stale enough to hide until fresh data arrives.
export const TEAMS_TTL_MS = 60_000;        // 1 min: soft freshness
export const TEAMS_HARD_TTL_MS = 15 * 60_000; // 15 min: hard expiry

const inflight = new Map<Teams365Mode, Promise<any>>();

function normalizeCache(value: any): Teams365Cache | null {
  if (!value || typeof value !== "object") return null;
  return {
    chats: Array.isArray(value.chats) ? value.chats : [],
    teams: Array.isArray(value.teams) ? value.teams : [],
    people: Array.isArray(value.people) ? value.people : [],
    diagnostics: value.diagnostics && typeof value.diagnostics === "object" ? value.diagnostics : {},
    cachedAt: Number(value.cachedAt || Date.now()),
  };
}

export function loadTeamsCache(): Teams365Cache | null {
  try {
    const raw = sessionStorage.getItem(TEAMS_CACHE_KEY) || sessionStorage.getItem(LEGACY_TEAMS_CACHE_KEY);
    return raw ? normalizeCache(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function teamsCacheAgeMs(): number | null {
  const c = loadTeamsCache();
  return c ? Date.now() - c.cachedAt : null;
}

export function isTeamsCacheFresh(ttlMs: number = TEAMS_TTL_MS): boolean {
  const age = teamsCacheAgeMs();
  return age !== null && age <= ttlMs;
}

export function isTeamsCacheExpired(hardTtlMs: number = TEAMS_HARD_TTL_MS): boolean {
  const age = teamsCacheAgeMs();
  return age === null || age > hardTtlMs;
}

export function saveTeamsCachePatch(patch: Partial<Omit<Teams365Cache, "cachedAt">>): Teams365Cache {
  const current = loadTeamsCache() ?? { chats: [], teams: [], people: [], diagnostics: {}, cachedAt: Date.now() };
  const next: Teams365Cache = {
    chats: patch.chats ?? current.chats,
    teams: patch.teams ?? current.teams,
    people: patch.people ?? current.people,
    diagnostics: { ...current.diagnostics, ...(patch.diagnostics ?? {}) },
    cachedAt: Date.now(),
  };
  try { sessionStorage.setItem(TEAMS_CACHE_KEY, JSON.stringify(next)); } catch { /* quota */ }
  return next;
}

export async function fetchTeams365(mode: Teams365Mode): Promise<any> {
  const pending = inflight.get(mode);
  if (pending) return pending;
  const p = supabase.functions
    .invoke("ms365-teams-list", { body: { mode } })
    .then(({ data, error }) => {
      const payload: any = data ?? {};
      if (error && !payload?.chats && !payload?.teams && !payload?.people) throw new Error(error.message || "teams_load_failed");
      if (payload?.chats || payload?.teams || payload?.people || payload?.diagnostics) {
        saveTeamsCachePatch({
          chats: Array.isArray(payload.chats) ? payload.chats : undefined,
          teams: Array.isArray(payload.teams) ? payload.teams : undefined,
          people: Array.isArray(payload.people) ? payload.people : undefined,
          diagnostics: payload.diagnostics ?? {},
        });
      }
      return payload;
    })
    .finally(() => inflight.delete(mode));
  inflight.set(mode, p);
  return p;
}

/** Revalidate only if the cache is older than the soft TTL. */
export async function revalidateTeams365IfStale(mode: Teams365Mode = "summary", ttlMs: number = TEAMS_TTL_MS): Promise<any | null> {
  if (isTeamsCacheFresh(ttlMs)) return null;
  return fetchTeams365(mode).catch(() => null);
}

export function prefetchTeams365Data(): void {
  const runAuxiliary = () => {
    void fetchTeams365("teams").catch(() => {});
    void fetchTeams365("people").catch(() => {});
  };
  void fetchTeams365("summary").catch(() => {});
  const ric: any = (globalThis as any).requestIdleCallback;
  if (typeof ric === "function") ric(runAuxiliary, { timeout: 3500 });
  else window.setTimeout(runAuxiliary, 1200);
}
