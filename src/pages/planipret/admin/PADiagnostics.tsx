import { useEffect, useState } from "react";
import {
  getAllMetrics,
  subscribeMetrics,
  clearMetrics,
  rateVital,
  type RouteMetrics,
  type VitalName,
} from "@/lib/perfMetrics";
import { Activity, RefreshCw, Trash2, Zap, Timer, Layers } from "lucide-react";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

const DICT = {
  fr: {
    eyebrow: "Performance",
    title: "Diagnostic de chargement",
    subtitle: "Core Web Vitals + timings collectés en direct sur chaque page visitée dans cette session.",
    refresh: "Rafraîchir",
    reset: "Réinitialiser",
    currentPage: "Page en cours",
    loadedAgo: (s: number) => `Chargée il y a ${s} s`,
    pending: "en attente…",
    ratingGood: "Bon",
    ratingImprove: "À améliorer",
    ratingPoor: "Faible",
    domInteractive: "DOM interactif",
    domContentLoaded: "DOMContentLoaded",
    loadEvent: "Load event",
    longTasksTotal: "Long tasks (total)",
    scripts: "Scripts",
    styles: "Styles",
    images: "Images",
    fetchXhr: "Fetch/XHR",
    slowest: (v: string) => `plus lent ${v}`,
    reqSuffix: "req.",
    jsHeapUsed: "JS heap utilisé",
    jsHeapTotal: "JS heap total",
    bottlenecksTitle: "Goulots d'étranglement détectés",
    historyTitle: "Historique par page",
    colRoute: "Route",
    colScripts: "Scripts",
    colFetch: "Fetch",
    colLongTasks: "Long tasks",
    noData: "Aucune donnée collectée. Naviguez entre les pages pour alimenter le rapport.",
    noBottleneck: "Aucun goulot majeur détecté sur cette page. 🎉",
    thresholdExceeded: (label: string) => `${label} (seuil dépassé)`,
    toImprove: (label: string) => `${label} (à améliorer)`,
    longTasksCumul: (v: string) => `Long tasks cumulées : ${v} — bloque le thread principal`,
    longTasks: (v: string) => `Long tasks : ${v}`,
    jsDownloaded: (v: string) => `JS téléchargé : ${v} — chunker davantage`,
    slowestReq: (v: string) => `Requête réseau la plus lente : ${v}`,
    imagesWeight: (v: string) => `Images : ${v} — envisager webp/avif + lazy`,
    reqCount: (n: number) => `${n} req`,
  },
  en: {
    eyebrow: "Performance",
    title: "Load diagnostics",
    subtitle: "Core Web Vitals + timings collected live on every page visited in this session.",
    refresh: "Refresh",
    reset: "Reset",
    currentPage: "Current page",
    loadedAgo: (s: number) => `Loaded ${s} s ago`,
    pending: "pending…",
    ratingGood: "Good",
    ratingImprove: "Needs improvement",
    ratingPoor: "Poor",
    domInteractive: "DOM interactive",
    domContentLoaded: "DOMContentLoaded",
    loadEvent: "Load event",
    longTasksTotal: "Long tasks (total)",
    scripts: "Scripts",
    styles: "Styles",
    images: "Images",
    fetchXhr: "Fetch/XHR",
    slowest: (v: string) => `slowest ${v}`,
    reqSuffix: "req.",
    jsHeapUsed: "JS heap used",
    jsHeapTotal: "JS heap total",
    bottlenecksTitle: "Detected bottlenecks",
    historyTitle: "History by page",
    colRoute: "Route",
    colScripts: "Scripts",
    colFetch: "Fetch",
    colLongTasks: "Long tasks",
    noData: "No data collected. Navigate between pages to populate the report.",
    noBottleneck: "No major bottleneck detected on this page. 🎉",
    thresholdExceeded: (label: string) => `${label} (threshold exceeded)`,
    toImprove: (label: string) => `${label} (needs improvement)`,
    longTasksCumul: (v: string) => `Cumulative long tasks: ${v} — blocks the main thread`,
    longTasks: (v: string) => `Long tasks: ${v}`,
    jsDownloaded: (v: string) => `JS downloaded: ${v} — split into more chunks`,
    slowestReq: (v: string) => `Slowest network request: ${v}`,
    imagesWeight: (v: string) => `Images: ${v} — consider webp/avif + lazy loading`,
    reqCount: (n: number) => `${n} req`,
  },
};

function fmtMs(v?: number) {
  if (v == null) return "—";
  return v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`;
}
function fmtBytes(n: number) {
  if (!n) return "0 KB";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

const VITAL_ORDER: VitalName[] = ["LCP", "FCP", "TTFB", "INP", "CLS"];
const VITAL_UNIT: Record<VitalName, "ms" | "score"> = {
  LCP: "ms", FCP: "ms", TTFB: "ms", INP: "ms", FID: "ms", CLS: "score",
};

function ratingColor(r: "good" | "needs-improvement" | "poor") {
  return r === "good"
    ? { fg: "#0D7A5F", bg: "rgba(13,122,95,0.10)", border: "rgba(13,122,95,0.25)" }
    : r === "needs-improvement"
    ? { fg: "#8A6E1F", bg: "rgba(201,168,76,0.14)", border: "rgba(201,168,76,0.35)" }
    : { fg: "#B23A48", bg: "rgba(178,58,72,0.10)", border: "rgba(178,58,72,0.25)" };
}

export default function PADiagnostics() {
  const { lang } = useMplanipretLang();
  const t = DICT[lang as "fr" | "en"];
  const [rows, setRows] = useState<RouteMetrics[]>(() => getAllMetrics());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const unsub = subscribeMetrics(setRows);
    return () => { unsub(); };
  }, []);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(id);
  }, []);

  const grouped = new Map<string, RouteMetrics>();
  for (const r of rows) {
    const prev = grouped.get(r.path);
    if (!prev || r.timestamp >= prev.timestamp) grouped.set(r.path, r);
  }
  const latest = Array.from(grouped.values()).sort((a, b) => b.timestamp - a.timestamp);
  const current = latest[0];

  const ratingLabel = (r: "good" | "needs-improvement" | "poor") =>
    r === "good" ? t.ratingGood : r === "needs-improvement" ? t.ratingImprove : t.ratingPoor;

  return (
    <div className="planipret-scope planipret-admin-scope p-6" key={tick}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="pp-eyebrow flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" /> {t.eyebrow}
          </div>
          <h1 className="pp-heading" style={{ fontWeight: 700, fontSize: 22 }}>
            {t.title}
          </h1>
          <p style={{ fontSize: 12.5, color: "var(--pp-text-secondary)", marginTop: 4 }}>
            {t.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="pp-btn-secondary flex items-center gap-2" onClick={() => setRows(getAllMetrics())}>
            <RefreshCw className="w-3.5 h-3.5" /> {t.refresh}
          </button>
          <button className="pp-btn-secondary flex items-center gap-2" onClick={() => { clearMetrics(); setRows(getAllMetrics()); }}>
            <Trash2 className="w-3.5 h-3.5" /> {t.reset}
          </button>
        </div>
      </div>

      {/* Current route summary */}
      {current && (
        <div className="pp-card p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="pp-eyebrow">{t.currentPage}</div>
              <div className="pp-heading" style={{ fontWeight: 700, fontSize: 16 }}>{current.path}</div>
            </div>
            <div style={{ fontSize: 11, color: "var(--pp-text-muted)" }}>
              <Timer className="w-3 h-3 inline mr-1" />
              {t.loadedAgo(Math.max(0, Math.round((Date.now() - current.timestamp) / 1000)))}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {VITAL_ORDER.map((v) => {
              const val = current.vitals[v];
              if (val == null) {
                return (
                  <div key={v} className="pp-card" style={{ padding: 12 }}>
                    <div style={{ fontSize: 10.5, color: "var(--pp-text-muted)", letterSpacing: "0.06em" }}>{v}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "var(--pp-text-faint)", marginTop: 4 }}>—</div>
                    <div style={{ fontSize: 10, color: "var(--pp-text-faint)" }}>{t.pending}</div>
                  </div>
                );
              }
              const rating = rateVital(v, val);
              const c = ratingColor(rating);
              return (
                <div key={v} className="pp-card" style={{ padding: 12, borderColor: c.border, borderWidth: 1, borderStyle: "solid" }}>
                  <div style={{ fontSize: 10.5, color: "var(--pp-text-muted)", letterSpacing: "0.06em" }}>{v}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: c.fg, marginTop: 4 }}>
                    {VITAL_UNIT[v] === "ms" ? fmtMs(val) : val.toFixed(3)}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: c.fg, background: c.bg, padding: "1px 6px", borderRadius: 6 }}>
                    {ratingLabel(rating)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Extra timings */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <MiniStat label={t.domInteractive} value={fmtMs(current.navigation?.domInteractive)} />
            <MiniStat label={t.domContentLoaded} value={fmtMs(current.navigation?.domContentLoaded)} />
            <MiniStat label={t.loadEvent} value={fmtMs(current.navigation?.loadEvent)} />
            <MiniStat label={t.longTasksTotal} value={fmtMs(current.longTasks)} />
          </div>

          {/* Resources */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            <MiniStat label={t.scripts} value={`${current.resources.scripts.count} · ${fmtBytes(current.resources.scripts.bytes)}`} sub={t.slowest(fmtMs(current.resources.scripts.slowest))} />
            <MiniStat label={t.styles} value={`${current.resources.styles.count} · ${fmtBytes(current.resources.styles.bytes)}`} />
            <MiniStat label={t.images} value={`${current.resources.images.count} · ${fmtBytes(current.resources.images.bytes)}`} />
            <MiniStat label={t.fetchXhr} value={`${current.resources.fetches.count} ${t.reqSuffix}`} sub={t.slowest(fmtMs(current.resources.fetches.slowest))} />
          </div>

          {current.memory && (
            <div className="grid grid-cols-2 gap-3 mt-3">
              <MiniStat label={t.jsHeapUsed} value={fmtBytes(current.memory.usedJSHeapSize)} />
              <MiniStat label={t.jsHeapTotal} value={fmtBytes(current.memory.totalJSHeapSize)} />
            </div>
          )}
        </div>
      )}

      {/* Bottlenecks */}
      {current && (
        <div className="pp-card p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4" style={{ color: "var(--pp-brand-accent-2)" }} />
            <div className="pp-heading" style={{ fontWeight: 700, fontSize: 15 }}>{t.bottlenecksTitle}</div>
          </div>
          <Bottlenecks m={current} t={t} />
        </div>
      )}

      {/* History across routes */}
      <div className="pp-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4" style={{ color: "var(--pp-brand-accent-2)" }} />
          <div className="pp-heading" style={{ fontWeight: 700, fontSize: 15 }}>{t.historyTitle}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead style={{ color: "var(--pp-text-muted)" }}>
              <tr className="text-left">
                <th className="p-2">{t.colRoute}</th>
                <th className="p-2">LCP</th>
                <th className="p-2">FCP</th>
                <th className="p-2">TTFB</th>
                <th className="p-2">INP</th>
                <th className="p-2">CLS</th>
                <th className="p-2">{t.colScripts}</th>
                <th className="p-2">{t.colFetch}</th>
                <th className="p-2">{t.colLongTasks}</th>
              </tr>
            </thead>
            <tbody>
              {latest.map((r) => (
                <tr key={r.path + r.timestamp} className="border-t border-slate-100">
                  <td className="p-2 font-medium">{r.path}</td>
                  <VitalCell v="LCP" value={r.vitals.LCP} />
                  <VitalCell v="FCP" value={r.vitals.FCP} />
                  <VitalCell v="TTFB" value={r.vitals.TTFB} />
                  <VitalCell v="INP" value={r.vitals.INP} />
                  <VitalCell v="CLS" value={r.vitals.CLS} />
                  <td className="p-2">{r.resources.scripts.count} · {fmtBytes(r.resources.scripts.bytes)}</td>
                  <td className="p-2">{t.reqCount(r.resources.fetches.count)} · {fmtMs(r.resources.fetches.slowest)}</td>
                  <td className="p-2">{fmtMs(r.longTasks)}</td>
                </tr>
              ))}
              {latest.length === 0 && (
                <tr><td colSpan={9} className="p-4 text-center text-slate-400">{t.noData}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="pp-card" style={{ padding: 10 }}>
      <div style={{ fontSize: 10, color: "var(--pp-text-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--pp-text-faint)" }}>{sub}</div>}
    </div>
  );
}

function VitalCell({ v, value }: { v: VitalName; value?: number }) {
  if (value == null) return <td className="p-2 text-slate-400">—</td>;
  const r = rateVital(v, value);
  const c = ratingColor(r);
  return (
    <td className="p-2">
      <span style={{ color: c.fg, fontWeight: 600 }}>
        {VITAL_UNIT[v] === "ms" ? fmtMs(value) : value.toFixed(3)}
      </span>
    </td>
  );
}

function Bottlenecks({ m, t }: { m: RouteMetrics; t: typeof DICT["fr"] }) {
  const issues: { level: "poor" | "needs-improvement"; msg: string }[] = [];
  const check = (v: VitalName) => {
    const val = m.vitals[v];
    if (val == null) return;
    const r = rateVital(v, val);
    const label = `${v} = ${VITAL_UNIT[v] === "ms" ? fmtMs(val) : val.toFixed(3)}`;
    if (r === "poor") issues.push({ level: "poor", msg: t.thresholdExceeded(label) });
    else if (r === "needs-improvement") issues.push({ level: "needs-improvement", msg: t.toImprove(label) });
  };
  (["LCP", "FCP", "TTFB", "INP", "CLS"] as VitalName[]).forEach(check);
  if (m.longTasks > 300) issues.push({ level: "poor", msg: t.longTasksCumul(fmtMs(m.longTasks)) });
  else if (m.longTasks > 100) issues.push({ level: "needs-improvement", msg: t.longTasks(fmtMs(m.longTasks)) });
  if (m.resources.scripts.bytes > 2_500_000) issues.push({ level: "poor", msg: t.jsDownloaded(fmtBytes(m.resources.scripts.bytes)) });
  if (m.resources.fetches.slowest > 2000) issues.push({ level: "poor", msg: t.slowestReq(fmtMs(m.resources.fetches.slowest)) });
  if (m.resources.images.bytes > 3_000_000) issues.push({ level: "needs-improvement", msg: t.imagesWeight(fmtBytes(m.resources.images.bytes)) });

  if (issues.length === 0) {
    return <div style={{ fontSize: 13, color: "var(--pp-text-secondary)" }}>{t.noBottleneck}</div>;
  }
  return (
    <ul className="space-y-2">
      {issues.map((i, idx) => {
        const c = ratingColor(i.level);
        return (
          <li key={idx} className="flex items-center gap-2" style={{ fontSize: 12.5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: c.fg }} />
            <span>{i.msg}</span>
          </li>
        );
      })}
    </ul>
  );
}
