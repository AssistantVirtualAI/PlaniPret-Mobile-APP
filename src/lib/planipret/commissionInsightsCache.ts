export type CommissionInsightCadence = "manual" | "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

export type CommissionInsightValue = {
  summary: string;
  insights: any[];
};

export type CommissionInsightCacheEntry = {
  generatedAt: number;
  cadenceToken: string;
  value: CommissionInsightValue;
};

const CACHE_PREFIX = "pp-commission-insights:v2";
const CADENCE_PREFIX = "pp-commission-insights-cadence:v2";

const isoDay = (now: Date) => now.toISOString().slice(0, 10);

function isoWeek(now: Date) {
  const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function cadenceToken(cadence: CommissionInsightCadence, now = new Date()) {
  if (cadence === "manual") return "manual";
  if (cadence === "daily") return isoDay(now);
  if (cadence === "weekly") return isoWeek(now);
  if (cadence === "monthly") return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (cadence === "quarterly") return `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
  return String(now.getFullYear());
}

export function insightCacheKey(args: {
  partition: string;
  year: number;
  granularity: string;
  periodIndex: number;
  lang: "fr" | "en";
}) {
  return `${CACHE_PREFIX}:${args.partition}:${args.year}:${args.granularity}:${args.periodIndex}:${args.lang}`;
}

export function readCommissionInsightCadence(partition: string): CommissionInsightCadence {
  try {
    const value = localStorage.getItem(`${CADENCE_PREFIX}:${partition}`);
    return ["manual", "daily", "weekly", "monthly", "quarterly", "yearly"].includes(String(value))
      ? value as CommissionInsightCadence
      : "daily";
  } catch {
    return "daily";
  }
}

export function writeCommissionInsightCadence(partition: string, cadence: CommissionInsightCadence) {
  try {
    localStorage.setItem(`${CADENCE_PREFIX}:${partition}`, cadence);
  } catch {
    /* Storage can be unavailable in private browsing. Manual mode remains safe. */
  }
}

export function readCommissionInsights(key: string): CommissionInsightCacheEntry | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CommissionInsightCacheEntry;
    if (!entry || typeof entry.generatedAt !== "number" || !entry.value || !Array.isArray(entry.value.insights)) return null;
    return entry;
  } catch {
    return null;
  }
}

export function writeCommissionInsights(
  key: string,
  cadence: CommissionInsightCadence,
  value: CommissionInsightValue,
  now = new Date(),
) {
  try {
    localStorage.setItem(key, JSON.stringify({ generatedAt: now.getTime(), cadenceToken: cadenceToken(cadence, now), value }));
  } catch {
    /* A visible result is still kept in memory if local storage is full. */
  }
}

/**
 * Only a configured cadence may trigger an automatic request. Manual mode never
 * calls Claude while a page mounts, refreshes, or changes tabs.
 */
export function needsCommissionInsightRefresh(
  entry: CommissionInsightCacheEntry | null,
  cadence: CommissionInsightCadence,
  now = new Date(),
) {
  return cadence !== "manual" && entry?.cadenceToken !== cadenceToken(cadence, now);
}

export function commissionInsightCadenceLabel(cadence: CommissionInsightCadence, lang: "fr" | "en") {
  const fr = {
    manual: "Manuel seulement",
    daily: "Une fois par jour",
    weekly: "Une fois par semaine",
    monthly: "Une fois par mois",
    quarterly: "Une fois par trimestre",
    yearly: "Une fois par année",
  };
  const en = {
    manual: "Manual only",
    daily: "Once per day",
    weekly: "Once per week",
    monthly: "Once per month",
    quarterly: "Once per quarter",
    yearly: "Once per year",
  };
  return (lang === "fr" ? fr : en)[cadence];
}
