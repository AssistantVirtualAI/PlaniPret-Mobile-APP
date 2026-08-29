export type Granularity = "day" | "week" | "month" | "quarter";

export const GRANULARITY_LABELS: Record<Granularity, { fr: string; en: string }> = {
  day: { fr: "Jour", en: "Daily" },
  week: { fr: "Semaine", en: "Weekly" },
  month: { fr: "Mois", en: "Monthly" },
  quarter: { fr: "Trimestre", en: "Quarterly" },
};

const loc = (lang: "fr" | "en") => (lang === "en" ? "en-CA" : "fr-CA");

function bucketOf(iso: string, g: Granularity, lang: "fr" | "en") {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { key: iso, label: iso };
  if (g === "day") {
    return { key: d.toISOString().slice(0, 10), label: d.toLocaleDateString(loc(lang), { day: "2-digit", month: "short" }) };
  }
  if (g === "week") {
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    return {
      key: monday.toISOString().slice(0, 10),
      label: `${lang === "en" ? "wk" : "sem"} ${monday.toLocaleDateString(loc(lang), { day: "2-digit", month: "short" })}`,
    };
  }
  if (g === "month") {
    const m = new Date(d.getFullYear(), d.getMonth(), 1);
    return { key: m.toISOString().slice(0, 10), label: m.toLocaleDateString(loc(lang), { month: "short", year: "2-digit" }) };
  }
  const q = Math.floor(d.getMonth() / 3);
  const m = new Date(d.getFullYear(), q * 3, 1);
  return { key: m.toISOString().slice(0, 10), label: `T${q + 1} ${String(d.getFullYear()).slice(2)}` };
}

/**
 * Aggregates a daily series (rows with an ISO `date`) into day/week/month/quarter buckets.
 * Numeric keys are summed, except keys listed in `avgKeys` which are averaged over
 * the buckets' non-empty days.
 */
export function bucketSeries<T extends { date: string }>(
  rows: T[],
  granularity: Granularity,
  lang: "fr" | "en" = "fr",
  avgKeys: string[] = ["avg"],
): (T & { label: string })[] {
  if (!rows?.length) return [];
  if (granularity === "day") return rows as (T & { label: string })[];

  const map = new Map<string, { label: string; row: any; avgAcc: Record<string, { t: number; n: number }> }>();
  const sample = rows[0] as any;
  const numericKeys = Object.keys(sample).filter((k) => typeof sample[k] === "number");

  for (const r of rows) {
    const { key, label } = bucketOf((r as any).date, granularity, lang);
    let e = map.get(key);
    if (!e) {
      const row: any = { date: key, label };
      for (const k of numericKeys) row[k] = 0;
      e = { label, row, avgAcc: {} };
      map.set(key, e);
    }
    for (const k of numericKeys) {
      const v = Number((r as any)[k] ?? 0);
      if (avgKeys.includes(k)) {
        const acc = e.avgAcc[k] ?? { t: 0, n: 0 };
        if (v > 0) { acc.t += v; acc.n++; }
        e.avgAcc[k] = acc;
      } else {
        e.row[k] += v;
      }
    }
  }

  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, e]) => {
      for (const k of Object.keys(e.avgAcc)) {
        const acc = e.avgAcc[k];
        e.row[k] = acc.n ? Math.round((acc.t / acc.n) * 10) / 10 : 0;
      }
      return e.row;
    });
}
