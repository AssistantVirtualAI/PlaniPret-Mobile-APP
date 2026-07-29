/**
 * AVA Brief cache — one generation per period per 24h.
 * Persisted in localStorage so navigating between pages (or restarting the app)
 * never re-invokes the pp-ava-brief edge function and burns AI tokens.
 */
export const AVA_BRIEF_TTL_MS = 24 * 60 * 60 * 1000;

const KEY_PREFIX = "planipret.ava.brief.v1";

export type AvaBriefCacheEntry = { brief: any; generatedAt: number; lang: string };

function keyFor(userId: string | undefined | null, period: string) {
  return `${KEY_PREFIX}:${userId || "anon"}:${period}`;
}

export function loadBriefCache(
  userId: string | undefined | null,
  period: string,
  lang?: string,
): AvaBriefCacheEntry | null {
  try {
    const raw = localStorage.getItem(keyFor(userId, period));
    if (!raw) return null;
    const v = JSON.parse(raw) as AvaBriefCacheEntry;
    if (!v || !v.brief || typeof v.generatedAt !== "number") return null;
    if (lang && v.lang && v.lang !== lang) return null;
    return v;
  } catch {
    return null;
  }
}

export function isBriefFresh(entry: AvaBriefCacheEntry | null): boolean {
  return !!entry && Date.now() - entry.generatedAt < AVA_BRIEF_TTL_MS;
}

export function saveBriefCache(
  userId: string | undefined | null,
  period: string,
  brief: any,
  lang: string,
) {
  try {
    const entry: AvaBriefCacheEntry = { brief, generatedAt: Date.now(), lang };
    localStorage.setItem(keyFor(userId, period), JSON.stringify(entry));
  } catch {
    /* quota */
  }
}

export function clearBriefCache(userId: string | undefined | null, period: string) {
  try {
    localStorage.removeItem(keyFor(userId, period));
  } catch {
    /* ignore */
  }
}
