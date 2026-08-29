/**
 * Overview AI insights cache — one generation per (user, period, lang) per 24h.
 * Auto-loads from localStorage so the panel is populated instantly and only
 * re-invokes the edge function once a day.
 */
import type { OverviewInsight } from "./overviewInsights";

export const OV_INSIGHTS_TTL_MS = 24 * 60 * 60 * 1000;

const KEY_PREFIX = "planipret.broker.overview.insights.v1";

export type OvInsightsCacheEntry = {
  summary: string;
  insights: OverviewInsight[];
  generatedAt: number;
  lang: string;
};

function keyFor(userId: string | null | undefined, days: number) {
  return `${KEY_PREFIX}:${userId || "anon"}:${days}`;
}

export function loadOvInsights(
  userId: string | null | undefined,
  days: number,
  lang: string,
): OvInsightsCacheEntry | null {
  try {
    const raw = localStorage.getItem(keyFor(userId, days));
    if (!raw) return null;
    const v = JSON.parse(raw) as OvInsightsCacheEntry;
    if (!v || typeof v.generatedAt !== "number" || !Array.isArray(v.insights)) return null;
    if (v.lang !== lang) return null;
    return v;
  } catch {
    return null;
  }
}

export function isOvInsightsFresh(entry: OvInsightsCacheEntry | null): boolean {
  return !!entry && Date.now() - entry.generatedAt < OV_INSIGHTS_TTL_MS;
}

export function saveOvInsights(
  userId: string | null | undefined,
  days: number,
  lang: string,
  summary: string,
  insights: OverviewInsight[],
) {
  try {
    const entry: OvInsightsCacheEntry = { summary, insights, generatedAt: Date.now(), lang };
    localStorage.setItem(keyFor(userId, days), JSON.stringify(entry));
  } catch {
    /* quota */
  }
}

export function clearOvInsights(userId: string | null | undefined, days: number) {
  try {
    localStorage.removeItem(keyFor(userId, days));
  } catch {
    /* ignore */
  }
}

/** "il y a 3 h" / "3h ago" */
export function formatAge(ts: number, lang: "fr" | "en"): string {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return lang === "en" ? "just now" : "à l'instant";
  if (mins < 60) return lang === "en" ? `${mins}m ago` : `il y a ${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 24) return lang === "en" ? `${h}h ago` : `il y a ${h} h`;
  const d = Math.round(h / 24);
  return lang === "en" ? `${d}d ago` : `il y a ${d} j`;
}
