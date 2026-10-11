import { useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, BarChart, RadialBarChart, RadialBar, LabelList,
} from "recharts";
import { Loader2, TrendingUp, TrendingDown, Trophy, FileDown, RotateCcw, Star, ImageDown, SlidersHorizontal, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import CommissionInsights from "./CommissionInsights";
import ClubExcellencePanel from "./ClubExcellencePanel";
import { Ov3DChartFilters, Ov3DGradients, fill3d } from "@/components/planipret/broker/overview/ov3dChart";
import RegisterFilters, { type Granularity } from "./RegisterFilters";
import BrokerLeaderboard from "./BrokerLeaderboard";
import BrokerTopSellers from "./BrokerTopSellers";
import BrokerYearMatrix from "./BrokerYearMatrix";
import BrokerDrilldown from "./BrokerDrilldown";
import { downloadCommissionsPdf } from "@/lib/planipret/commissionsPdf";
import { exportNodePng, exportDashboardPdf } from "@/lib/planipret/exportVisuals";
import { useAdminCommissionFilters, readAdminCommissionFilters, defaultAdminCommissionFilters } from "@/hooks/useAdminCommissionFilters";
import { ensureAiConsent } from "@/components/planipret/mobile/AiConsentHost";
import InfoTip from "@/components/planipret/broker/overview/InfoTip";
import RegisterDealsTable, { type DealLine } from "./RegisterDealsTable";
import RegisterDrilldown, { dealsCsv } from "./RegisterDrilldown";
import { Chart3D } from "@/components/planipret/broker/overview/ov3dChart";
import ChartFrame, { PanelFrame } from "./ui/ChartFrame";
import CommissionsHero from "./ui/CommissionsHero";
import CommissionsTabs, { type TabKey } from "./ui/CommissionsTabs";
import CommissionAuditPanel from "./CommissionAuditPanel";
import CommissionsSkeleton from "./ui/CommissionsSkeleton";
import MaestroSyncButton from "./ui/MaestroSyncButton";
import CommissionSyncNowButton from "./ui/CommissionSyncNowButton";
import CommissionRecalcButton from "./ui/CommissionRecalcButton";
import UndatedTransactionsPanel from "./UndatedTransactionsPanel";
import { loadBrokerCoverage, causeLabel, coverageFor, type CoverageMap, type CoverageCause } from "@/lib/planipret/brokerCoverage";
import MaestroStatusBadge from "./ui/MaestroStatusBadge";
import { statsCacheKey, readStatsCache, readAnyStatsCache, writeStatsCache } from "@/lib/planipret/commissionsCache";
import {
  CHART_COLORS, CommissionsGradients, axisProps, gridProps, legendProps, tipProps,
} from "./ui/chartTheme";

type Lang = "fr" | "en";
type Tab = "overview" | "brokers" | "trend" | "lenders" | "mix" | "quarters" | "periods" | "club" | "deals" | "audit";


const PALETTE = CHART_COLORS;


const fmtMoney = (v: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(v || 0);
const fmtNum = (v: number) => new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 }).format(v || 0);
const fmtBps = (v: number) => `${(v || 0).toFixed(1)} BPS`;
const fmtPct = (v: number | string) =>
  typeof v === "number" ? `${(v * 100).toFixed(1)} %` : String(v ?? "—");

const MONTHS_FR = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function Delta({ value, comparisonLabel }: { value: number | string; comparisonLabel?: string }) {
  if (typeof value !== "number") {
    return <span style={{ fontSize: 11.5, color: "var(--pp-text-muted)" }}>{value}</span>;
  }
  const up = value >= 0;
  return (
    <span className="inline-flex items-center gap-0.5" style={{ fontSize: 11.5, fontWeight: 700, color: up ? "#16a34a" : "#ef4444" }}>
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {(value * 100).toFixed(1)} %{comparisonLabel ? ` ${comparisonLabel}` : ""}
    </span>
  );
}

function Sparkline({ points, color }: { points: number[]; color: string }) {
  const pts = points.filter((n) => Number.isFinite(n));
  if (pts.length < 2) return null;
  const max = Math.max(...pts), min = Math.min(...pts);
  const span = max - min || 1;
  const w = 96, h = 26;
  const d = pts.map((v, i) => `${(i / (pts.length - 1)) * w},${h - ((v - min) / span) * (h - 4) - 2}`).join(" L");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={`spk-${color.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={.45} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`M${d} L${w},${h} L0,${h} Z`} fill={`url(#spk-${color.replace(/[^a-z0-9]/gi, "")})`} />
      <path d={`M${d}`} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Kpi({ label, value, delta, accent, onClick, info, spark }: {
  label: string; value: string; delta?: number | string; accent: string; onClick?: () => void; info?: string; spark?: number[];
}) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      title={onClick ? "Voir les dossiers sous-jacents" : undefined}
      className={`ov3d-card${onClick ? " pp-drillable" : ""}`}
      style={{
        position: "relative", padding: 14, borderRadius: 16, overflow: "hidden",
        background: "linear-gradient(155deg, var(--pp-bg-elevated) 0%, var(--pp-bg-card) 100%)",
        border: "1px solid var(--pp-bg-border)",
        boxShadow: "0 18px 38px -26px rgba(0,0,0,.8), inset 0 1px 0 rgba(255,255,255,.07)",
      }}
    >
      <div aria-hidden style={{ position: "absolute", inset: 0, background: `radial-gradient(130% 75% at 0% 0%, ${accent}26, transparent 62%)`, pointerEvents: "none" }} />
      <div aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: accent, boxShadow: `0 0 16px ${accent}99` }} />
      <div className="inline-flex items-center gap-1" style={{ fontSize: 10.5, letterSpacing: .5, textTransform: "uppercase", color: "var(--pp-text-muted)", fontWeight: 800 }}>
        {label}{info && <InfoTip text={info} />}
      </div>
      <div style={{ fontSize: 23, fontWeight: 900, letterSpacing: -0.4, marginTop: 4, color: "var(--pp-text-primary)" }}>{value}</div>
      <div className="flex items-end justify-between gap-2 mt-1">
        <div>{delta !== undefined && <Delta value={delta} comparisonLabel="vs même période l’an dernier" />}</div>
        {spark && spark.length > 1 && <div style={{ opacity: .95 }}><Sparkline points={spark} color={accent} /></div>}
      </div>
    </div>
  );
}

function Section({ title, children, right, info, accent = "#5B8FF9", chart }: {
  title: string; children: React.ReactNode; right?: React.ReactNode; info?: string; accent?: string; chart?: number;
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <PanelFrame title={title} actions={right} info={info} accent={accent}>
        {chart ? (
          <Chart3D minHeight={chart}>
            <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden><CommissionsGradients /></svg>
            {children}
          </Chart3D>
        ) : children}
      </PanelFrame>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number | JSX.Element)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="pp-table-modern" style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12.5 }}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} style={{
                position: "sticky", top: 0, textAlign: i === 0 || i === 1 ? "left" : "right",
                padding: "8px 10px", fontSize: 11, textTransform: "uppercase", letterSpacing: .3,
                color: "var(--pp-text-muted)", fontWeight: 800,
                background: "var(--pp-bg-elevated)", backdropFilter: "blur(6px)", zIndex: 1,
                borderBottom: "1px solid var(--pp-bg-border)",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} style={{ background: ri % 2 ? "rgba(127,127,127,.045)" : "transparent" }}>
              {r.map((c, ci) => (
                <td key={ci} style={{
                  padding: "7px 10px", textAlign: ci === 0 || ci === 1 ? "left" : "right",
                  whiteSpace: "nowrap", color: "var(--pp-text-primary)",
                  borderBottom: "1px solid var(--pp-bg-border)",
                }}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function RegisterCommissions({ lang, scope = "broker", forcedAgent = null }: {
  lang: Lang;
  scope?: "broker" | "admin";
  /** Admin per-broker view: lock the agent filter on this broker name. */
  forcedAgent?: string | null;
}) {
  const isFr = lang === "fr";
  const isAdminView = scope === "admin";
  const MONTHS = isFr ? MONTHS_FR : MONTHS_EN;
  const now = new Date();
  const scopeKey: "admin" | "broker" = isAdminView ? "admin" : "broker";
  const filtersScope = forcedAgent ? `${scopeKey}:${forcedAgent}` : scopeKey;
  const saved = readAdminCommissionFilters(filtersScope);
  const [year, setYear] = useState(saved?.year ?? now.getFullYear());
  const [month, setMonth] = useState(12);
  const [granularity, setGranularity] = useState<Granularity>((saved?.granularity as Granularity) ?? "ytd");
  const [periodIndex, setPeriodIndex] = useState(saved?.periodIndex ?? now.getMonth() + 1);
  const [agent, setAgent] = useState(forcedAgent ?? (isAdminView ? (saved?.agent ?? "") : ""));
  useEffect(() => { if (forcedAgent) setAgent(forcedAgent); }, [forcedAgent]);
  const [brokersYear, setBrokersYear] = useState<number | "all">("all");
  const [lender, setLender] = useState(saved?.lender ?? "");
  const [tab, setTab] = useState<Tab>((saved?.tab as Tab) ?? "overview");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);

  // Export (PNG / PDF) + mobile filter drawer
  const exportRootRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState<null | "png" | "pdf">(null);
  const [filtersOpen, setFiltersOpen] = useState(false);



  // Persist the admin filters in the browser so the same view reopens later.
  const { clear: clearSavedFilters } = useAdminCommissionFilters(true, { year, granularity, periodIndex, agent, lender, tab }, filtersScope);
  const resetFilters = () => {
    const d = defaultAdminCommissionFilters();
    clearSavedFilters();
    setYear(d.year);
    setGranularity(d.granularity as Granularity);
    setPeriodIndex(d.periodIndex);
    setAgent(forcedAgent ?? "");
    setLender("");
    setTab("overview");
  };

  // Bumped after a Maestro sync to refetch the stats.
  const [refreshKey, setRefreshKey] = useState(0);

  // Live: any new commission row (import or Maestro sync) refetches the stats.
  useEffect(() => {
    const ch = supabase
      .channel(`pp-commissions-live-${scopeKey}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_commission_register" }, () => {
        setRefreshKey((k) => k + 1);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_commission_stats" }, () => {
        setRefreshKey((k) => k + 1);
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [scopeKey]);

  // Per-broker "why is there no data" explanation (admin view only).
  const [coverage, setCoverage] = useState<CoverageMap>({});
  const [coverageMeta, setCoverageMeta] = useState<{ adminScopeConfigured: boolean; counts: Record<CoverageCause, number> } | null>(null);

  useEffect(() => {
    if (!isAdminView) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await loadBrokerCoverage((data?.agentsWithData ?? []) as string[]);
        if (cancelled) return;
        setCoverage(res.map);
        setCoverageMeta({ adminScopeConfigured: res.adminScopeConfigured, counts: res.counts });
      } catch { /* diagnostics are best-effort */ }
    })();
    return () => { cancelled = true; };
  }, [isAdminView, data?.agentsWithData, refreshKey]);

  // Broker drill-down
  const [drillAgent, setDrillAgent] = useState<string | null>(null);
  const [drillData, setDrillData] = useState<any>(null);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillError, setDrillError] = useState<string | null>(null);


  useEffect(() => {
    let cancelled = false;
    const cacheKey = statsCacheKey(scopeKey, [year, month, granularity, periodIndex, agent || "all"]);
    const run = async () => {
      setLoading(true); setError(null);
      // Instant paint from the last known payload (never a blank page).
      const cached = readStatsCache(cacheKey) ?? (data ? null : readAnyStatsCache(scopeKey));
      if (cached && !cancelled) { setData(cached.value); setStale(true); setCachedAt(new Date(cached.ts).toISOString()); }
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const { data: res, error: err } = await supabase.functions.invoke("pp-commission-stats", {
          body: {
            year,
            month: granularity === "ytd" || granularity === "month" ? periodIndex : month,
            granularity,
            periodIndex,
            scope: isAdminView ? "all" : "self",
            agent: isAdminView && agent ? agent : null,
          },
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        });
        if (err) throw err;
        if ((res as any)?.error) throw new Error((res as any).error);
        if (!cancelled) {
          setData(res); setStale(false); setCachedAt(null); setError(null);
          writeStatsCache(cacheKey, res);
        }
      } catch (e: any) {
        if (cancelled) return;
        const fallback = readStatsCache(cacheKey) ?? readAnyStatsCache(scopeKey);
        if (fallback) { setData(fallback.value); setStale(true); setCachedAt(new Date(fallback.ts).toISOString()); }
        setError(e?.message ?? "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, granularity, periodIndex, agent, isAdminView, refreshKey]);

  // Drill-down fetch (admin only)
  useEffect(() => {
    if (!isAdminView || !drillAgent) return;
    let cancelled = false;
    (async () => {
      setDrillLoading(true); setDrillError(null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const { data: res, error: err } = await supabase.functions.invoke("pp-commission-stats", {
          body: {
            year,
            month: granularity === "ytd" || granularity === "month" ? periodIndex : month,
            granularity,
            periodIndex,
            scope: "all",
            agent: null,
            detailBrokerKey: drillAgent,
          },
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        });
        if (err) throw err;
        if ((res as any)?.error) throw new Error((res as any).error);
        if (!cancelled) setDrillData((res as any)?.detail ?? null);
      } catch (e: any) {
        if (!cancelled) setDrillError(e?.message ?? "error");
      } finally {
        if (!cancelled) setDrillLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isAdminView, drillAgent, year, month, granularity, periodIndex]);


  const onGranularity = (g: Granularity) => {
    setGranularity(g);
    const currentMonth = new Date().getMonth() + 1;
    setPeriodIndex(g === "week" ? 1 : g === "quarter" ? Math.ceil(currentMonth / 3) : g === "month" || g === "ytd" ? currentMonth : 12);
  };

  const years: number[] = useMemo(() => {
    const list: number[] = data?.availableYears?.length ? data.availableYears : [];
    if (!list.includes(year)) list.push(year);
    return Array.from(new Set(list)).sort((a, b) => b - a);
  }, [data, year]);

  const trendData = useMemo(() => {
    if (data?.series) {
      return data.series.map((m: any) => ({
        name: m.label,
        cyVolume: m.cyVolume, pyVolume: m.pyVolume,
        cyCommission: m.cyCommission, pyCommission: m.pyCommission,
        bps: m.bps, deals: m.cyDeals,
      }));
    }
    return (data?.monthly ?? []).map((m: any) => ({
      name: MONTHS[m.month - 1],
      cyVolume: m.cyVolume, pyVolume: m.pyVolume,
      cyCommission: m.cyCommission, pyCommission: m.pyCommission,
      bps: m.bps, deals: m.cyDeals,
    }));
  }, [data, MONTHS]);

  const cumulative = useMemo(() => {
    let cy = 0, py = 0;
    return trendData.map((m: any) => {
      cy += m.cyVolume || 0; py += m.pyVolume || 0;
      return {
        ...m,
        cyCum: cy,
        pyCum: py,
        commPerDeal: m.deals ? (m.cyCommission || 0) / m.deals : 0,
      };
    });
  }, [trendData]);

  const kpi = data?.kpi;

  // Small series feeding the KPI sparklines (same window as the cards).
  const spark = useMemo(() => ({
    volume: trendData.map((m: any) => m.cyVolume || 0),
    deals: trendData.map((m: any) => m.deals || 0),
    commission: trendData.map((m: any) => m.cyCommission || 0),
    bps: trendData.map((m: any) => m.bps || 0),
  }), [trendData]);

  /* ---- Advanced filtering (lender) applied client-side on the deal lines ---- */
  const allDeals: DealLine[] = useMemo(() => (data?.deals ?? []) as DealLine[], [data]);
  const lenderOptions: string[] = useMemo(() => {
    const set = new Set<string>();
    for (const d of allDeals) if (d.institution) set.add(d.institution);
    for (const l of (data?.lenders ?? [])) if (l?.key) set.add(l.key);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allDeals, data]);

  const filteredDeals: DealLine[] = useMemo(
    () => (lender ? allDeals.filter((d) => d.institution === lender) : allDeals),
    [allDeals, lender],
  );

  const filteredTotals = useMemo(() => {
    const volume = filteredDeals.filter((d) => d.countedInVolume).reduce((s2, d) => s2 + (d.loanAmt || 0), 0);
    const commission = filteredDeals.reduce((s2, d) => s2 + (d.amount || 0), 0);
    const count = filteredDeals.filter((d) => d.countedInDeals).length;
    return { volume, commission, count, bps: volume ? (commission / volume) * 10000 : 0 };
  }, [filteredDeals]);

  /* ---- Drill-down modal ---- */
  const [drill, setDrill] = useState<{ title: string; subtitle?: string; deals: DealLine[] } | null>(null);
  const openDrill = (title: string, deals: DealLine[], subtitle?: string) => setDrill({ title, deals, subtitle });
  const periodSubtitle = `${data?.periodLabel ?? year}${lender ? ` · ${lender}` : ""}${agent ? ` · ${agent}` : ""}`;


  /* ---- Data signature: changes as soon as Maestro brings new numbers ---- */
  const dataSignature = useMemo(() => {
    if (!data) return "none";
    const k = data.kpi?.ytd ?? {};
    return [
      data.rowCount ?? 0,
      Math.round(Number(k.volume) || 0),
      Math.round(Number(k.commission) || 0),
      Math.round(Number(k.deals) || 0),
      data.syncedAt ?? "",
    ].join("|");
  }, [data]);

  // ---- AI insights (Claude), auto-refreshed on every new Maestro payload ----
  const [ai, setAi] = useState<{ summary: string; insights: any[] } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const generateInsights = async (force = false) => {
    if (!data || data.rowCount === 0) return;
    const cacheKey = `pp-register-insights:${isAdminView ? "admin" : (data.brokerName ?? "me")}:${agent || "all"}:${year}:${granularity}:${periodIndex}:${lang}:${tab}:${dataSignature}`;
    if (!force) {
      try {
        const raw = localStorage.getItem(cacheKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Date.now() - parsed.ts < 24 * 3600 * 1000) { setAi(parsed.value); return; }
        }
      } catch { /* ignore */ }
    }
    if (!(await ensureAiConsent())) return;
    setAiLoading(true); setAiError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const payload = {
        lang, scope: isAdminView && !agent ? "admin" : "broker", source: "maestro",
        focus: tab, focusLabel: tabLabel,
        metrics: {
          year, period: data.periodLabel, granularity, window: data.window,
          agent: agent || (isAdminView ? "all brokers" : data.brokerName),
          brokers: isAdminView ? (data.brokers ?? []).slice(0, 20) : undefined,
          ytd: data.kpi.ytd, ytdPriorYear: data.kpi.ytdPy,
          monthly: data.monthly, quarters: data.quarters,
          lenders: data.lenders.slice(0, 12), products: data.products, terms: data.terms,
          commissionTypes: data.commissionTypes,
          clubRank: data.club.find((c: any) => c.isMe)?.rank ?? null,
          clubSize: data.club.length,
          // Provenance / data quality so Claude reads the endpoint data as-is.
          dataSource: { source: "maestro", syncedAt: data.syncedAt ?? cachedAt ?? null, stale, rowCount: data.rowCount },
          lenderFilter: lender || null,
          filteredTotals: lender ? filteredTotals : undefined,
          unmappedRows: allDeals.filter((d: any) => d?.mapStatus === "unmapped").length,
          // Raw deal lines (already scoped to this broker or to the firm view).
          deals: filteredDeals.slice(0, 300).map((d: any) => ({
            n: d.number, date: d.date ?? d.dateTrans, agent: d.agentName,
            lender: d.institution, product: d.mortgageType, term: d.term,
            loan: d.loanAmt, commission: d.amount, type: d.commissionType,
          })),
          dealsTotal: filteredDeals.length,
        },
      };
      const { data: res, error: err } = await supabase.functions.invoke("pp-commissions-insights", {
        body: payload,
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (err) throw err;
      const value = { summary: (res as any)?.summary ?? "", insights: (res as any)?.insights ?? [] };
      setAi(value);
      try { localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), value })); } catch { /* ignore */ }
    } catch (e: any) {
      setAiError(e?.message ?? "AI error");
    } finally {
      setAiLoading(false);
    }
  };

  // Auto-run: regenerates whenever the visible slice or the underlying
  // Maestro data changes (signature), never waiting for a manual click.
  useEffect(() => {
    setAi(null);
    if (data && data.rowCount > 0) void generateInsights(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSignature, year, granularity, periodIndex, agent, tab]);

  const tabs: { key: TabKey; label: string; count?: number | null; tone?: "gold" | "warn" }[] = [
    { key: "overview", label: isFr ? "Vue d'ensemble" : "Overview" },
    ...(isAdminView ? [{ key: "brokers" as TabKey, label: isFr ? "Courtiers" : "Brokers" }] : []),
    { key: "trend", label: isFr ? "Tendance" : "Trend" },
    { key: "lenders", label: isFr ? "Prêteurs" : "Lenders" },
    { key: "mix", label: isFr ? "Mix produits" : "Product mix" },
    ...(isAdminView ? [{ key: "quarters" as TabKey, label: isFr ? "Trimestres" : "Quarters" }] : []),
    ...(isAdminView ? [{ key: "periods" as TabKey, label: isFr ? "Stats par période" : "Stats by period" }] : []),
    { key: "club", label: "Club Excellence", tone: "gold" },
    { key: "deals", label: isFr ? "Dossiers" : "Deals", count: filteredDeals.length },
    { key: "audit", label: isFr ? "Audit" : "Audit", count: data?.audit?.excludedRows ?? null },
  ];

  const tabLabel = tabs.find((t) => t.key === (tab as TabKey))?.label ?? String(tab);





  const heroTitle = isAdminView
    ? (isFr ? "Commissions — vue entreprise" : "Commissions — firm view")
    : (isFr ? "Mes commissions" : "My commissions");
  const heroSubtitle = isAdminView
    ? (isFr ? "Données Maestro · volume, dossiers, prêteurs et commissions"
            : "Maestro data · volume, deals, lenders and commissions")
    : (data?.brokerName ?? (isFr ? "Votre performance, synchronisée depuis Maestro" : "Your performance, synced from Maestro"));

  const periodBadge = data?.window
    ? `${data.window.start} → ${data.window.end}${isAdminView && !agent ? (isFr ? " · tous les courtiers" : " · all brokers") : agent ? ` · ${agent}` : ""}`
    : String(year);

  const runPng = async () => {
    setExporting("png");
    try { await exportNodePng(exportRootRef.current, `commissions-${tabLabel}-${year}`); }
    finally { setExporting(null); }
  };
  const runVisualPdf = async () => {
    setExporting("pdf");
    try {
      await exportDashboardPdf(exportRootRef.current, {
        lang, title: heroTitle, subtitle: heroSubtitle, periodLabel: periodBadge,
      });
    } finally { setExporting(null); }
  };

  return (
    <div ref={exportRootRef} className="pp-commissions-root">
      {data && data.rowCount > 0 && kpi && (
        <div data-pp-export-block>
        <CommissionsHero
          lang={lang}
          title={heroTitle}
          subtitle={heroSubtitle}
          periodLabel={periodBadge}
          volume={kpi.ytd.volume}
          deals={kpi.ytd.deals}
          commission={kpi.ytd.commission}
          volumeDelta={typeof pctDelta(kpi.ytd.volume, kpi.ytdPy.volume) === "number" ? (pctDelta(kpi.ytd.volume, kpi.ytdPy.volume) as number) : null}
          dealsDelta={typeof pctDelta(kpi.ytd.deals, kpi.ytdPy.deals) === "number" ? (pctDelta(kpi.ytd.deals, kpi.ytdPy.deals) as number) : null}
          commissionDelta={typeof pctDelta(kpi.ytd.commission, kpi.ytdPy.commission) === "number" ? (pctDelta(kpi.ytd.commission, kpi.ytdPy.commission) as number) : null}
        />
        </div>
      )}

      {data?.validation && <div title={data.validation.summary} className="pp-hide-export inline-flex rounded-full px-2.5 py-1 mb-2 text-[10.5px] font-bold" style={{ color: data.validation.status === "WARNING" ? "var(--pp-warning)" : "var(--pp-success)", background: `color-mix(in srgb, ${data.validation.status === "WARNING" ? "var(--pp-warning)" : "var(--pp-success)"} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${data.validation.status === "WARNING" ? "var(--pp-warning)" : "var(--pp-success)"} 30%, transparent)` }}>{data.validation.status === "WARNING" ? (isFr ? "Contrôlé avec réserve" : "Checked with warning") : (isFr ? "Maestro contrôlé" : "Maestro checked")}</div>}

      {/* Filters — collapsible on mobile */}
      <div className="pp-filters-sticky">
        <div className="flex items-center gap-2 md:hidden mb-2">
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className="inline-flex items-center gap-1.5 px-3 rounded-lg"
            style={{ minHeight: 44, fontSize: 13, fontWeight: 700, background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-primary)" }}>
            <SlidersHorizontal className="w-4 h-4" />
            {isFr ? "Filtres" : "Filters"}
            <ChevronDown className="w-4 h-4" style={{ transform: filtersOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
          </button>
          {loading && <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--pp-text-muted)" }} />}
          <span className="truncate" style={{ fontSize: 11.5, color: "var(--pp-text-muted)" }}>{periodBadge}</span>
        </div>

        <div className={`${filtersOpen ? "flex" : "hidden"} md:flex flex-wrap items-center gap-2`}>
          <RegisterFilters
            lang={lang}
            years={years}
            year={year}
            onYear={setYear}
            granularity={granularity}
            onGranularity={onGranularity}
            periodIndex={periodIndex}
            onPeriodIndex={setPeriodIndex}
            agents={data?.availableAgents ?? []}
            agentsWithData={data?.agentsWithData ?? []}
            coverage={coverage}

            agent={agent}
            onAgent={setAgent}
            showAgent={isAdminView}
            lenders={lenderOptions}
            lender={lender}
            onLender={setLender}
          />
          {loading && <Loader2 className="w-4 h-4 animate-spin hidden md:block" style={{ color: "var(--pp-text-muted)" }} />}
          {data?.window && (
            <span className="hidden md:inline" style={{ fontSize: 11.5, color: "var(--pp-text-muted)" }}>{periodBadge}</span>
          )}
          <div className="pp-hide-export md:ml-auto flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => dealsCsv(filteredDeals, `commissions-${year}${lender ? `-${lender}` : ""}.csv`)}
              disabled={filteredDeals.length === 0}
              title={isFr ? "Exporter le résultat filtré" : "Export the filtered result"}
              className="pp-toolbar-btn inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
              style={{ fontSize: 12, fontWeight: 700, opacity: filteredDeals.length ? 1 : .5, background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-secondary)" }}>
              <FileDown className="w-3.5 h-3.5" />CSV
            </button>
            <button
              onClick={runPng}
              disabled={exporting !== null}
              title={isFr ? "Exporter la vue en PNG" : "Export the view as PNG"}
              className="pp-toolbar-btn inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
              style={{ fontSize: 12, fontWeight: 700, opacity: exporting ? .6 : 1, background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-secondary)" }}>
              {exporting === "png" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageDown className="w-3.5 h-3.5" />}PNG
            </button>
            <button
              onClick={runVisualPdf}
              disabled={exporting !== null || !data}
              title={isFr ? "PDF récapitulatif (graphiques + KPI)" : "PDF recap (charts + KPIs)"}
              className="pp-toolbar-btn inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
              style={{
                fontSize: 12, fontWeight: 700, opacity: exporting || !data ? .6 : 1,
                background: "var(--pp-brand-accent-2)", color: "#fff", border: "1px solid var(--pp-bg-border)",
              }}>
              {exporting === "pdf" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
              {isFr ? "PDF récap" : "PDF recap"}
            </button>
            {isAdminView && <button
              onClick={() => data && downloadCommissionsPdf({ lang, data, agent, aiSummary: ai?.summary, year })}
              disabled={!data}
              className="pp-toolbar-btn inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
              style={{ fontSize: 12, fontWeight: 700, opacity: data ? 1 : .5, background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-secondary)" }}>
              <FileDown className="w-3.5 h-3.5" />{isFr ? "Rapport détaillé" : "Detailed report"}
            </button>}
            <MaestroSyncButton lang={lang} scope={isAdminView ? "admin" : "broker"} onDone={() => setRefreshKey((k) => k + 1)} />
            {isAdminView && <CommissionSyncNowButton lang={lang} onDone={() => setRefreshKey((k) => k + 1)} />}
            <CommissionRecalcButton lang={lang} scope={isAdminView ? "admin" : "broker"} onDone={() => setRefreshKey((k) => k + 1)} />
            <button onClick={resetFilters} className="pp-toolbar-btn inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
              style={{ fontSize: 12, fontWeight: 700, background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-secondary)" }}>
              <RotateCcw className="w-3.5 h-3.5" />{isFr ? "Réinitialiser" : "Reset"}
            </button>
          </div>
        </div>
      </div>


      {lender && (
        <div className="flex flex-wrap items-center gap-2 mb-2 rounded-xl" style={{ padding: "8px 10px", border: "1px solid var(--pp-brand-accent-2, #2E9BDC)", background: "color-mix(in srgb, var(--pp-brand-accent-2, #2E9BDC) 10%, transparent)" }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: "var(--pp-text-primary)" }}>
            {isFr ? "Résultat filtré" : "Filtered result"} · {lender}
          </span>
          <span style={{ fontSize: 12, color: "var(--pp-text-secondary)" }}>
            {fmtNum(filteredTotals.count)} {isFr ? "dossiers" : "deals"} · {fmtMoney(filteredTotals.volume)} · {fmtMoney(filteredTotals.commission)} · {fmtBps(filteredTotals.bps)}
          </span>
          <button
            onClick={() => openDrill(lender, filteredDeals, periodSubtitle)}
            className="px-2 py-1 rounded-lg"
            style={{ fontSize: 11.5, fontWeight: 700, background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-secondary)" }}>
            {isFr ? "Voir les dossiers" : "View deals"}
          </button>
          <button onClick={() => setLender("")} className="ml-auto px-2 py-1 rounded-lg"
            style={{ fontSize: 11.5, fontWeight: 700, background: "transparent", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-muted)" }}>
            {isFr ? "Effacer" : "Clear"}
          </button>
        </div>
      )}

      <UndatedTransactionsPanel lang={lang} data={data?.undated} />

      <CommissionsTabs tabs={tabs} value={tab as TabKey} onChange={(k) => setTab(k as Tab)} />

      <div className="pp-hide-export">
        <MaestroStatusBadge
          lang={lang}
          scope={scopeKey}
          loading={loading}
          stale={stale}
          dataError={error}
          rowCount={data?.rowCount ?? null}
          dataSyncedAt={data?.syncedAt ?? cachedAt}
        />
      </div>

      {data?.liveMerge && (
        <div className="pp-hide-export mb-2 rounded-xl" style={{ padding: "8px 10px", border: "1px solid var(--pp-bg-border)", background: "var(--pp-bg-elevated)" }}>
          <span style={{ fontSize: 11.5, color: "var(--pp-text-secondary)" }}>
            {isFr
              ? `Source unique : registre (${fmtNum(data.liveMerge.registerRows)} lignes) + Maestro en direct (${fmtNum(data.liveMerge.rows)} nouvelles lignes)`
              : `Single source: register (${fmtNum(data.liveMerge.registerRows)} rows) + live Maestro (${fmtNum(data.liveMerge.rows)} new rows)`}
            {isAdminView && data.liveMerge.coverage?.total ? (
              <> · {isFr
                ? `${data.liveMerge.coverage.connected} courtier(s) connecté(s) sur ${data.liveMerge.coverage.total}`
                : `${data.liveMerge.coverage.connected} of ${data.liveMerge.coverage.total} brokers connected`}</>
            ) : null}
          </span>
          {isAdminView && (data.liveMerge.coverage?.connected ?? 0) < (data.liveMerge.coverage?.total ?? 0) && (
            <div style={{ fontSize: 11, color: "var(--pp-text-muted)", marginTop: 2 }}>
              {isFr
                ? "L'API de commissions Maestro ne renvoie que les dépôts du courtier propriétaire du jeton : les courtiers non connectés sont couverts par le registre importé."
                : "The Maestro commissions API only returns the token owner's deposits: brokers who are not connected are covered by the imported register."}
            </div>
          )}
        </div>
      )}

      {error && !data && (
        <div className="pp-card" style={{ padding: 12, fontSize: 12.5, color: "var(--pp-danger,#ef4444)" }}>{error}</div>
      )}

      {!data && loading && <CommissionsSkeleton />}

      {data && data.rowCount === 0 && (
        <div
          className="pp-card"
          style={{
            padding: 28, borderRadius: 16, textAlign: "center",
            background: "linear-gradient(155deg, var(--pp-bg-elevated) 0%, var(--pp-bg-card) 100%)",
            border: "1px solid var(--pp-bg-border)",
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 800, color: "var(--pp-text-primary)" }}>
            {isFr ? "Aucune commission pour cette période" : "No commission for this period"}
          </div>
          <p style={{ fontSize: 12.5, color: "var(--pp-text-muted)", marginTop: 6, maxWidth: 460, marginInline: "auto", lineHeight: 1.6 }}>
            {isFr
              ? "Aucun dossier n'est rattaché à votre profil sur cette période. Essayez une autre année, ou connectez votre compte Maestro pour suivre vos commissions en temps réel."
              : "No deal is linked to your profile for this period. Try another year, or connect your Maestro account to track commissions in real time."}
          </p>
        </div>
      )}

      {data && data.rowCount > 0 && (
        <div className="ov3d-stage">
          <Ov3DChartFilters />
          <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
            <Ov3DGradients colors={["#4472C4", "#70AD47", "#ED7D31", "#A5A5A5", "#FFC000", "#8B5CF6", "#EC4899", "#14B8A6"]} />
          </svg>

          <div className="mb-3">
            <CommissionInsights
              lang={lang}
              context={tabLabel}
              summary={ai?.summary ?? ""}
              insights={(ai?.insights ?? []) as any}
              loading={aiLoading}
              error={aiError}
              generated={!!ai}
              onGenerate={() => void generateInsights(true)}
            />
          </div>
          {tab === "overview" && (
            <>
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))" }}>
                <Kpi label={isFr ? "Volume" : "Volume"} value={fmtMoney(kpi.ytd.volume)} delta={pctDelta(kpi.ytd.volume, kpi.ytdPy.volume)} accent={CHART_COLORS[0]} spark={spark.volume}
                  info={isFr ? "Somme des montants de prêt des dossiers comptés dans le volume. L'écart compare la même fenêtre de l'année précédente. Cliquez pour voir les dossiers."
                    : "Sum of loan amounts counted in volume. The delta compares the same window last year. Click to see the deals."}
                  onClick={() => openDrill(isFr ? "Volume — dossiers sous-jacents" : "Volume — underlying deals", filteredDeals.filter((d) => d.countedInVolume), periodSubtitle)} />
                <Kpi label={isFr ? "Dossiers" : "Deals"} value={fmtNum(kpi.ytd.deals)} delta={pctDelta(kpi.ytd.deals, kpi.ytdPy.deals)} accent={CHART_COLORS[1]} spark={spark.deals}
                  info={isFr ? "Nombre de dossiers comptés sur la période (les lignes d'ajustement et de boni sont exclues du compte)."
                    : "Number of counted deals for the period (adjustment and bonus lines are excluded)."}
                  onClick={() => openDrill(isFr ? "Dossiers" : "Deals", filteredDeals.filter((d) => d.countedInDeals), periodSubtitle)} />
                <Kpi label="Commission" value={fmtMoney(kpi.ytd.commission)} delta={pctDelta(kpi.ytd.commission, kpi.ytdPy.commission)} accent={CHART_COLORS[2]} spark={spark.commission}
                  info={isFr ? "Total des commissions inscrites au registre pour la période, toutes catégories confondues."
                    : "Total commissions recorded in the register for the period, all categories included."}
                  onClick={() => openDrill("Commission", filteredDeals.filter((d) => (d.amount || 0) !== 0), periodSubtitle)} />
                <Kpi label={isFr ? "Dossier moyen" : "Avg deal"} value={fmtMoney(kpi.ytd.avgDeal)} accent={CHART_COLORS[3]}
                  info={isFr ? "Volume divisé par le nombre de dossiers comptés : la taille moyenne d'un prêt sur la période."
                    : "Volume divided by counted deals: the average loan size for the period."}
                  onClick={() => openDrill(isFr ? "Dossier moyen" : "Avg deal", filteredDeals.filter((d) => d.countedInDeals), periodSubtitle)} />
                <Kpi label="BPS" value={fmtBps(kpi.ytd.bps)} accent={CHART_COLORS[4]} spark={spark.bps}
                  info={isFr ? "Rendement : commission ÷ volume × 10 000. Un BPS qui baisse pendant que le volume monte signale un mix moins rémunérateur."
                    : "Yield: commission ÷ volume × 10,000. Falling BPS while volume rises signals a less profitable mix."}
                  onClick={() => openDrill("BPS", filteredDeals, periodSubtitle)} />
                <Kpi label={isFr ? "Prêteurs actifs" : "Active lenders"} value={fmtNum(kpi.activeLenders)} accent={CHART_COLORS[5]}
                  info={isFr ? "Nombre de prêteurs distincts ayant au moins un dossier sur la période. Plus il est élevé, moins la dépendance à un prêteur est forte."
                    : "Distinct lenders with at least one deal in the period. Higher means less dependency on a single lender."}
                  onClick={() => openDrill(isFr ? "Prêteurs actifs" : "Active lenders", filteredDeals, periodSubtitle)} />
                {isAdminView && (
                  <Kpi label={isFr ? "Courtiers actifs" : "Active brokers"} value={fmtNum(kpi.activeBrokers)} accent={CHART_COLORS[6]}
                    info={isFr ? "Courtiers ayant au moins un dossier au registre sur la période sélectionnée." : "Brokers with at least one register deal in the selected period."} />
                )}
              </div>

              <Section title={isFr ? "Volume mensuel — année courante vs précédente" : "Monthly volume — CY vs PY"} chart={280} accent={CHART_COLORS[0]} info={isFr ? "Chaque barre compare le volume du mois à celui du même mois de l'année précédente. Une barre bleue plus haute que la grise signifie une croissance sur ce mois." : "Each bar compares the month volume to the same month last year. A blue bar above the grey one means growth for that month."}>
                <div style={{ height: 280 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={trendData}>
                      <defs>
                        <linearGradient id="gCy" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#5B8FF9" /><stop offset="100%" stopColor="#2F5FBF" />
                        </linearGradient>
                        <linearGradient id="gPy" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#B9C4D6" /><stop offset="100%" stopColor="#8895AA" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="name" {...axisProps} />
                      <YAxis {...axisProps} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                      <Tooltip {...tipProps} formatter={(v: any, n: any) => [fmtMoney(Number(v)), n]} />
                      <Legend {...legendProps} />
                      <Bar name={String(year)} dataKey="cyVolume" fill="url(#gCy)" radius={[5, 5, 0, 0]} />
                      <Bar name={String(year - 1)} dataKey="pyVolume" fill="url(#gPy)" radius={[5, 5, 0, 0]} />
                      <Line name="BPS" dataKey="bps" stroke="#FFC000" strokeWidth={2} dot={false} yAxisId={0} hide />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </Section>

              <Section title={isFr ? "Commission par type" : "Commission by type"} chart={240} accent={CHART_COLORS[2]} info={isFr ? "Répartition du montant de commission entre les catégories du registre (commission de base, bonis, ajustements)." : "Split of commission amount across the register categories (base commission, bonuses, adjustments)."}>
                <div style={{ height: 240 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={data.commissionTypes} dataKey="amount" nameKey="type" innerRadius={55} outerRadius={90} paddingAngle={2}>
                        {data.commissionTypes.map((_: any, i: number) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                      </Pie>
                      <Tooltip {...tipProps} formatter={(v: any, n: any) => [fmtMoney(Number(v)), n]} />
                      <Legend {...legendProps} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </Section>

              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
                <Section title={isFr ? "Volume cumulé — courbe de progression" : "Cumulative volume — pace curve"} chart={240} accent={CHART_COLORS[0]} info={isFr ? "Cumul du volume mois après mois. Si la courbe de l'année courante passe au-dessus de celle de l'an dernier, le rythme est en avance." : "Month-over-month cumulative volume. When the current-year curve sits above last year, the pace is ahead."}>
                  <div style={{ height: 240 }}>
                    <ResponsiveContainer>
                      <AreaChart data={cumulative}>
                        <defs>
                          <linearGradient id="gCumCy" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#5B8FF9" stopOpacity={0.75} />
                            <stop offset="100%" stopColor="#5B8FF9" stopOpacity={0.05} />
                          </linearGradient>
                          <linearGradient id="gCumPy" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#A5A5A5" stopOpacity={0.5} />
                            <stop offset="100%" stopColor="#A5A5A5" stopOpacity={0.03} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid {...gridProps} />
                        <XAxis dataKey="name" {...axisProps} />
                        <YAxis {...axisProps} tickFormatter={(v) => `${Math.round(v / 1000000)}M`} />
                        <Tooltip {...tipProps} formatter={(v: any, n: any) => [fmtMoney(Number(v)), n]} />
                        <Legend {...legendProps} />
                        <Area name={String(year - 1)} dataKey="pyCum" stroke="#A5A5A5" fill="url(#gCumPy)" strokeWidth={2} />
                        <Area name={String(year)} dataKey="cyCum" stroke="#5B8FF9" fill="url(#gCumCy)" strokeWidth={2.4} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Section>

                <Section title={isFr ? "Dossiers vs commission par dossier" : "Deals vs commission per deal"} chart={240} accent={CHART_COLORS[1]} info={isFr ? "Les barres montrent le nombre de dossiers, la ligne la commission moyenne par dossier. Beaucoup de dossiers avec une ligne qui descend = des dossiers plus petits." : "Bars show deal count, the line shows average commission per deal. Many deals with a falling line means smaller deals."}>
                  <div style={{ height: 240 }}>
                    <ResponsiveContainer>
                      <ComposedChart data={cumulative}>
                        <CartesianGrid {...gridProps} />
                        <XAxis dataKey="name" {...axisProps} />
                        <YAxis yAxisId="l" {...axisProps} />
                        <YAxis yAxisId="r" orientation="right" {...axisProps} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                        <Tooltip {...tipProps} formatter={(v: any, n: any) => [n === (isFr ? "Dossiers" : "Deals") ? fmtNum(Number(v)) : fmtMoney(Number(v)), n]} />
                        <Legend {...legendProps} />
                        <Bar yAxisId="l" name={isFr ? "Dossiers" : "Deals"} dataKey="deals" fill={fill3d("#70AD47")} radius={[5, 5, 0, 0]}  filter="url(#ov3dExtrude)" />
                        <Line yAxisId="r" name={isFr ? "Comm./dossier" : "Comm./deal"} dataKey="commPerDeal" stroke="#FFC000" strokeWidth={2.4} dot={{ r: 2 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </Section>

                <Section title={isFr ? "Concentration des prêteurs (top 6)" : "Lender concentration (top 6)"} chart={300} accent={CHART_COLORS[5]} info={isFr ? "Poids relatif des 6 premiers prêteurs. Plus de 50 % du volume chez un seul prêteur est un signal de dépendance." : "Relative weight of the top 6 lenders. Over 50% of volume with one lender signals dependency."}>
                  {(() => {
                    const top = (data.lenders ?? []).slice(0, 6);
                    const total = (data.lenders ?? []).reduce((s: number, l: any) => s + Number(l.cyVolume || 0), 0) || 1;
                    const rows = top.map((l: any, i: number) => ({
                      name: String(l.key ?? "—"),
                      short: String(l.key ?? "—").length > 18 ? `${String(l.key).slice(0, 17)}…` : String(l.key ?? "—"),
                      value: Number(l.cyVolume || 0),
                      share: (Number(l.cyVolume || 0) / total) * 100,
                      fill: PALETTE[i % PALETTE.length],
                    }));
                    if (!rows.length) return <div style={{ height: 240, display: "grid", placeItems: "center", fontSize: 12, color: "var(--pp-text-secondary)" }}>{isFr ? "Aucune donnée prêteur" : "No lender data"}</div>;
                    return (
                      <div style={{ height: 300 }}>
                        <ResponsiveContainer>
                          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 4 }} barCategoryGap="22%">
                            <CartesianGrid {...gridProps} vertical horizontal={false} />
                            <XAxis type="number" {...axisProps} tickFormatter={(v) => `${Math.round(Number(v) / 1000000)}M`} />
                            <YAxis
                              type="category"
                              dataKey="short"
                              width={130}
                              {...axisProps}
                              tick={{ ...(axisProps as any).tick, fontSize: 12 }}
                            />
                            <Tooltip
                              {...tipProps}
                              cursor={{ fill: "rgba(120,140,200,0.08)" }}
                              formatter={(v: any, _n: any, p: any) => [`${fmtMoney(Number(v))} · ${(p?.payload?.share ?? 0).toFixed(1)} %`, p?.payload?.name]}
                            />
                            <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={26}>
                              {rows.map((r: any, i: number) => <Cell key={i} fill={r.fill} fillOpacity={0.95} stroke={r.fill} strokeWidth={1} />)}

                              <LabelList
                                dataKey="share"
                                position="right"
                                offset={8}
                                formatter={(v: any) => `${Number(v).toFixed(1)} %`}
                                style={{ fontSize: 11, fontWeight: 700, fill: "var(--pp-text-primary)" }}
                              />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    );
                  })()}
                </Section>


                <Section title={isFr ? "BPS par mois (rentabilité)" : "BPS per month (yield)"} chart={240} accent={CHART_COLORS[4]} info={isFr ? "Rendement mensuel : commission ÷ volume × 10 000. Les creux indiquent des mois moins rémunérateurs à volume égal." : "Monthly yield: commission ÷ volume × 10,000. Dips mark less profitable months at equal volume."}>
                  <div style={{ height: 240 }}>
                    <ResponsiveContainer>
                      <AreaChart data={cumulative}>
                        <defs>
                          <linearGradient id="gBps" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.7} />
                            <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.04} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid {...gridProps} />
                        <XAxis dataKey="name" {...axisProps} />
                        <YAxis {...axisProps} />
                        <Tooltip {...tipProps} formatter={(v: any) => fmtBps(Number(v))} />
                        <Area name="BPS" dataKey="bps" stroke="#8B5CF6" fill="url(#gBps)" strokeWidth={2.2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Section>
              </div>

              <Section title={isFr ? "Notes de lecture" : "Reading notes"}>
                <ul style={{ fontSize: 12, color: "var(--pp-text-secondary)", lineHeight: 1.65, paddingLeft: 16, listStyle: "disc" }}>
                  <li>{isFr ? "La courbe cumulée compare le rythme de l'année courante à celui de l'année précédente sur la même fenêtre." : "The cumulative curve compares the current year pace to the prior year over the same window."}</li>
                  <li>{isFr ? "BPS = commission / volume × 10 000 ; une baisse de BPS avec un volume en hausse signale un mix moins rémunérateur." : "BPS = commission / volume × 10,000; falling BPS with rising volume signals a less profitable mix."}</li>
                  <li>{isFr ? "La concentration des prêteurs mesure le risque : plus de 50 % du volume chez un seul prêteur est un signal d'attention." : "Lender concentration measures risk: over 50% of volume with a single lender is a warning signal."}</li>
                  <li>{isFr ? "Tous les chiffres proviennent du registre de dépôts importé (onglets 2022→2026), sans retraitement manuel." : "All figures come from the imported deposit register (2022→2026 sheets), with no manual adjustment."}</li>
                </ul>
              </Section>

            </>
          )}

          {tab === "brokers" && (
            <>
              <div
                className="mb-3 rounded-xl px-3 py-2.5"
                style={{
                  background: "var(--pp-bg-elevated)",
                  border: "1px solid var(--pp-bg-border)",
                  fontSize: 12.5,
                  color: "var(--pp-text-secondary)",
                }}
              >
                <div style={{ fontWeight: 800, color: "var(--pp-text-primary)", marginBottom: 4 }}>
                  {isFr ? "Couverture des données courtiers" : "Broker data coverage"}
                </div>
                <div>
                  {isFr
                    ? `${(data.availableAgents ?? []).length} courtier(s) dans le filtre · ${(data.agentsWithData ?? []).length} avec des données · ${fmtNum(data.totalRows ?? 0)} ligne(s) sur la période.`
                    : `${(data.availableAgents ?? []).length} broker(s) in the filter · ${(data.agentsWithData ?? []).length} with data · ${fmtNum(data.totalRows ?? 0)} row(s) in period.`}
                </div>
                {(data.agentsWithData ?? []).length > 0 && (
                  <div style={{ marginTop: 4, opacity: 0.9 }}>
                    {(data.agentsWithData ?? []).join(" · ")}
                  </div>
                )}
                {(() => {
                  const missing = (data.availableAgents ?? []).filter((a: string) => !(data.agentsWithData ?? []).includes(a));
                  if (missing.length === 0) return null;
                  const groups = new Map<CoverageCause, string[]>();
                  for (const a of missing) {
                    const c = coverageFor(coverage, a).cause;
                    const k = c === "ok" ? "not_in_register" : c;
                    groups.set(k, [...(groups.get(k) ?? []), a]);
                  }
                  return (
                    <div style={{ marginTop: 8, fontSize: 11.5 }}>
                      <div style={{ fontWeight: 800, color: "var(--pp-text-primary)", marginBottom: 3 }}>
                        {isFr ? `Pourquoi ${missing.length} courtier(s) n'ont aucune donnée` : `Why ${missing.length} broker(s) have no data`}
                      </div>
                      {[...groups.entries()].map(([cause, list]) => (
                        <div key={cause} style={{ marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, color: "var(--pp-text-primary)" }}>
                            {causeLabel(cause, isFr)} ({list.length})
                          </span>
                          <span style={{ opacity: .8 }}> — {list.slice(0, 12).join(" · ")}{list.length > 12 ? " …" : ""}</span>
                        </div>
                      ))}
                      {coverageMeta && !coverageMeta.adminScopeConfigured && (
                        <div style={{ marginTop: 6, opacity: .9 }}>
                          {isFr
                            ? "La portée Maestro à l'échelle de la firme n'est pas configurée : voir Admin → Portée Maestro (firme)."
                            : "Firm-wide Maestro scope is not configured: see Admin → Maestro firm scope."}
                        </div>
                      )}
                      <div style={{ marginTop: 6, opacity: .85 }}>
                        {isFr
                          ? "Pour couvrir les courtiers hors Maestro, importez le registre global : Admin → Registre des commissions."
                          : "To cover brokers outside Maestro, import the global register: Admin → Commission register."}
                      </div>
                    </div>
                  );
                })()}


              </div>
              {(data.unlinkedBrokers ?? []).length > 0 && (
                <div className="mb-3 rounded-xl px-3 py-2.5"
                  style={{ background: "rgba(245,158,11,.10)", border: "1px solid rgba(245,158,11,.45)", fontSize: 12.5, color: "var(--pp-text-secondary)" }}>
                  <div style={{ fontWeight: 800, color: "var(--pp-text-primary)", marginBottom: 3 }}>
                    {isFr ? "Courtiers non rattachés à un compte" : "Brokers not linked to an account"}
                  </div>
                  <div>
                    {(data.unlinkedBrokers ?? []).map((u: any) => `${u.broker} (${fmtNum(u.rows)} ${isFr ? "lignes" : "rows"})`).join(" · ")}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11.5, opacity: .9 }}>
                    {isFr
                      ? "Leurs lignes restent visibles ici, mais ne sont pas encore dispatchées vers un portail courtier. Utilisez l'onglet Correspondances pour les rattacher."
                      : "Their rows stay visible here but are not dispatched to a broker portal yet. Use the mapping tab to link them."}
                  </div>
                </div>
              )}

              <BrokerTopSellers
                lang={lang}
                brokerYearly={(data.brokerYearly ?? []) as any}
                years={(data.brokerYears ?? []) as number[]}
                year={brokersYear}
                onYear={setBrokersYear}
                onSelect={(b) => { setDrillData(null); setDrillAgent(b); }}
              />

              <BrokerYearMatrix
                lang={lang}
                brokerYearly={(data.brokerYearly ?? []) as any}
                years={(data.brokerYears ?? []) as number[]}
                onSelect={(b) => { setDrillData(null); setDrillAgent(b); }}
              />

              <BrokerLeaderboard
                lang={lang}
                brokers={data.brokers ?? []}
                periodLabel={`${data.window?.start} → ${data.window?.end}`}
                onSelect={(b) => { setDrillData(null); setDrillAgent(b); }}
              />
            </>
          )}


          {tab === "trend" && (
            <>
              <Section title={isFr ? "Commission mensuelle — CY vs PY" : "Monthly commission — CY vs PY"} chart={260} accent={CHART_COLORS[2]} info={isFr ? "Commission encaissée par mois, comparée au même mois de l'année précédente." : "Commission booked per month, compared to the same month last year."}>
                <div style={{ height: 260 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={trendData}>
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="name" {...axisProps} />
                      <YAxis {...axisProps} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                      <Tooltip {...tipProps} formatter={(v: any, n: any) => [fmtMoney(Number(v)), n]} />
                      <Legend {...legendProps} />
                      <Bar name={String(year)} dataKey="cyCommission" fill={fill3d("#ED7D31")} radius={[5, 5, 0, 0]}  filter="url(#ov3dExtrude)" />
                      <Bar name={String(year - 1)} dataKey="pyCommission" fill={fill3d("#A5A5A5")} radius={[5, 5, 0, 0]}  filter="url(#ov3dExtrude)" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </Section>
              <Section title={isFr ? "Détail mensuel" : "Monthly detail"}>
                <Table
                  head={[isFr ? "Mois" : "Month", "", isFr ? "Volume" : "Volume", isFr ? "Doss." : "Deals", "Commission",
                    isFr ? "Vol. PY" : "PY vol.", "YoY vol.", "YoY comm.", isFr ? "Doss. moy." : "Avg deal", "BPS"]}
                  rows={(data.monthly ?? []).map((m: any) => [
                    MONTHS[m.month - 1], "", fmtMoney(m.cyVolume), fmtNum(m.cyDeals), fmtMoney(m.cyCommission),
                    fmtMoney(m.pyVolume), <Delta key="a" value={m.volumeYoy} />, <Delta key="b" value={m.commissionYoy} />,
                    fmtMoney(m.avgDeal), fmtBps(m.bps),
                  ])}
                />
              </Section>
            </>
          )}

          {tab === "lenders" && (
            <>
              <Section title={isFr ? "Top 10 prêteurs — volume CY vs PY" : "Top 10 lenders — volume CY vs PY"} chart={320} accent={CHART_COLORS[0]} info={isFr ? "Les 10 prêteurs les plus utilisés, classés par volume de l'année courante, avec le rappel de l'année précédente." : "The 10 most used lenders ranked by current-year volume, with last year for reference."}>
                <div style={{ height: 320 }}>
                  <ResponsiveContainer>
                    <BarChart data={data.lenders.slice(0, 10)} layout="vertical" margin={{ left: 30 }}>
                      <CartesianGrid {...gridProps} vertical horizontal={false} />
                      <XAxis type="number" {...axisProps} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                      <YAxis type="category" dataKey="key" width={130} {...axisProps} />
                      <Tooltip {...tipProps} formatter={(v: any, n: any) => [fmtMoney(Number(v)), n]} />
                      <Legend {...legendProps} />
                      <Bar name={String(year)} dataKey="cyVolume" fill={fill3d("#4472C4")} radius={[0, 5, 5, 0]}  filter="url(#ov3dExtrude)" />
                      <Bar name={String(year - 1)} dataKey="pyVolume" fill={fill3d("#A5A5A5")} radius={[0, 5, 5, 0]}  filter="url(#ov3dExtrude)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Section>
              <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))" }}>
                <ChartFrame
                  title={isFr ? "Part de marché des prêteurs" : "Lender market share"}
                  accent={CHART_COLORS[3]}
                  height={250}
                  info={isFr
                    ? "Part de chaque prêteur dans le volume total de la période. Le centre indique le poids cumulé des 3 premiers prêteurs — au-delà de 60 %, la dépendance devient un risque."
                    : "Each lender's share of total period volume. The centre shows the combined weight of the top 3 lenders — above 60% dependency becomes a risk."}
                >
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={(data.lenders ?? []).slice(0, 8)} dataKey="cyVolume" nameKey="key" innerRadius={58} outerRadius={92} paddingAngle={2} stroke="none">
                        {(data.lenders ?? []).slice(0, 8).map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip {...tipProps} formatter={(v: any, n: any) => [fmtMoney(Number(v)), n]} />
                      <Legend {...legendProps} layout="vertical" align="right" verticalAlign="middle" />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartFrame>

                <ChartFrame
                  title={isFr ? "Rendement par prêteur (BPS)" : "Yield per lender (BPS)"}
                  accent={CHART_COLORS[4]}
                  height={250}
                  info={isFr
                    ? "Commission ÷ volume × 10 000 pour chaque prêteur. Un prêteur à fort volume mais faible BPS pèse peu sur la rémunération."
                    : "Commission ÷ volume × 10,000 per lender. A high-volume lender with low BPS contributes little to earnings."}
                >
                  <ResponsiveContainer>
                    <BarChart data={(data.lenders ?? []).slice(0, 8)} margin={{ left: 4, right: 8 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="key" {...axisProps} interval={0} angle={-18} textAnchor="end" height={54} />
                      <YAxis {...axisProps} />
                      <Tooltip {...tipProps} formatter={(v: any) => fmtBps(Number(v))} />
                      <Bar dataKey="cyBps" name="BPS" fill={fill3d("#8B5CF6")} radius={[6, 6, 0, 0]} filter="url(#ov3dExtrude)" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartFrame>
              </div>

              <Section title={isFr ? "Classement des prêteurs" : "Lender ranking"} accent={CHART_COLORS[0]} info={isFr ? "Classement complet des prêteurs sur la période. Cliquez sur un nom pour ouvrir les dossiers correspondants." : "Full lender ranking for the period. Click a name to open the matching deals."}>
                <Table
                  head={["#", isFr ? "Prêteur" : "Lender", "Volume", isFr ? "Doss." : "Deals", "Commission", "BPS",
                    "% vol.", isFr ? "Vol. PY" : "PY vol.", "YoY vol.", "YoY comm."]}
                  rows={data.lenders.map((l: any) => [
                    l.rank,
                    <button
                      key={`l-${l.key}`}
                      onClick={() => openDrill(l.key, allDeals.filter((d) => d.institution === l.key), periodSubtitle)}
                      style={{ fontWeight: 700, color: "var(--pp-text-primary)", textDecoration: "underline dotted", textUnderlineOffset: 3 }}
                    >
                      {l.key}
                    </button>, fmtMoney(l.cyVolume), fmtNum(l.cyDeals), fmtMoney(l.cyCommission), fmtBps(l.cyBps),
                    fmtPct(l.sharePct), fmtMoney(l.pyVolume), <Delta key="a" value={l.volumeYoy} />, <Delta key="b" value={l.commissionYoy} />,
                  ])}
                />
              </Section>
            </>
          )}

          {tab === "mix" && (
            <>
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))" }}>
                <Section title={isFr ? "Mix par type de prêt" : "Product mix"} chart={240} accent={CHART_COLORS[3]} info={isFr ? "Part de volume par type de produit hypothécaire sur la période." : "Share of volume per mortgage product type for the period."}>
                  <div style={{ height: 240 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={data.products} dataKey="cyVolume" nameKey="key" innerRadius={50} outerRadius={88} paddingAngle={2}>
                          {data.products.map((_: any, i: number) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                        </Pie>
                        <Tooltip {...tipProps} formatter={(v: any, n: any) => [fmtMoney(Number(v)), n]} />
                        <Legend {...legendProps} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </Section>
                <Section title={isFr ? "Mix par terme" : "Term mix"} chart={240} accent={CHART_COLORS[1]} info={isFr ? "Volume par durée de terme, utile pour anticiper les renouvellements." : "Volume by term length, useful to anticipate renewals."}>
                  <div style={{ height: 240 }}>
                    <ResponsiveContainer>
                      <BarChart data={data.terms}>
                        <CartesianGrid {...gridProps} />
                        <XAxis dataKey="key" {...axisProps} />
                        <YAxis {...axisProps} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                        <Tooltip {...tipProps} formatter={(v: any) => fmtMoney(Number(v))} />
                        <Bar dataKey="cyVolume" name="Volume" fill={fill3d("#70AD47")} radius={[5, 5, 0, 0]}  filter="url(#ov3dExtrude)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Section>
              </div>

              <Section title={isFr ? "Mix produits (année en cours)" : "Product mix (CY YTD)"}>
                <Table
                  head={[isFr ? "Produit" : "Product", "", "Volume", isFr ? "Doss." : "Deals", "% Volume", "BPS"]}
                  rows={[
                    ...data.products.map((p: any) => [p.key, "", fmtMoney(p.cyVolume), fmtNum(p.cyDeals), fmtPct(p.sharePct), fmtBps(p.cyBps)]),
                    [
                      isFr ? "TOTAL" : "TOTAL", "",
                      fmtMoney(data.products.reduce((s: number, p: any) => s + p.cyVolume, 0)),
                      fmtNum(data.products.reduce((s: number, p: any) => s + p.cyDeals, 0)),
                      fmtPct(1),
                      fmtBps((() => {
                        const v = data.products.reduce((s: number, p: any) => s + p.cyVolume, 0);
                        const c = data.products.reduce((s: number, p: any) => s + p.cyCommission, 0);
                        return v ? (c / v) * 10000 : 0;
                      })()),
                    ],
                  ]}
                />
              </Section>

              <Section title={isFr ? "Mix termes (année en cours)" : "Term mix (CY YTD)"}>
                <Table
                  head={[isFr ? "Terme" : "Term", "", "Volume", isFr ? "Doss." : "Deals", "% Volume"]}
                  rows={[
                    ...data.terms.map((t: any) => [t.key, "", fmtMoney(t.cyVolume), fmtNum(t.cyDeals), fmtPct(t.sharePct)]),
                    [
                      isFr ? "TOTAL" : "TOTAL", "",
                      fmtMoney(data.terms.reduce((s: number, t: any) => s + t.cyVolume, 0)),
                      fmtNum(data.terms.reduce((s: number, t: any) => s + t.cyDeals, 0)),
                      fmtPct(1),
                    ],
                  ]}
                />
              </Section>


              <Section title={isFr ? "Matrice type × terme (volume)" : "Type × term matrix (volume)"}>
                <Table
                  head={[isFr ? "Type" : "Type", "", ...data.termKeys, "Total"]}
                  rows={data.matrix.map((r: any) => [
                    r.type, "", ...r.cells.map((c: any) => fmtMoney(c.volume)), fmtMoney(r.total),
                  ])}
                />
              </Section>
            </>
          )}

          {tab === "quarters" && (
            <Section title={isFr ? "Résumé trimestriel" : "Quarter summary"} chart={260} accent={CHART_COLORS[0]} info={isFr ? "Volume par trimestre comparé à l'année précédente, avec le détail chiffré en dessous." : "Quarterly volume against last year, with the numeric detail below."}>
              <div style={{ height: 260 }}>
                <ResponsiveContainer>
                  <ComposedChart data={data.quarters.map((q: any) => ({ name: `Q${q.quarter}`, ...q }))}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="name" {...axisProps} />
                    <YAxis {...axisProps} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <Tooltip {...tipProps} formatter={(v: any, n: any) => [fmtMoney(Number(v)), n]} />
                    <Legend {...legendProps} />
                    <Bar name={String(year)} dataKey="volume" fill={fill3d("#4472C4")} radius={[5, 5, 0, 0]}  filter="url(#ov3dExtrude)" />
                    <Bar name={String(year - 1)} dataKey="pyVolume" fill={fill3d("#A5A5A5")} radius={[5, 5, 0, 0]}  filter="url(#ov3dExtrude)" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3">
                <Table
                  head={[isFr ? "Trimestre" : "Quarter", "", "Volume", isFr ? "Doss." : "Deals", "Commission", isFr ? "Doss. moy." : "Avg deal", "BPS"]}
                  rows={data.quarters.map((q: any) => [
                    `Q${q.quarter}`, "", fmtMoney(q.volume), fmtNum(q.deals), fmtMoney(q.commission), fmtMoney(q.avgDeal), fmtBps(q.bps),
                  ])}
                />
              </div>
            </Section>
          )}

          {tab === "periods" && (
            <>
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))" }}>
                <Kpi label={isFr ? "Volume — période" : "Volume — period"} value={fmtMoney(kpi.ytd.volume)} delta={pctDelta(kpi.ytd.volume, kpi.ytdPy.volume)} accent="#4472C4" />
                <Kpi label={isFr ? "Dossiers — période" : "Deals — period"} value={fmtNum(kpi.ytd.deals)} delta={pctDelta(kpi.ytd.deals, kpi.ytdPy.deals)} accent="#70AD47" />
                <Kpi label={isFr ? "Commission — période" : "Commission — period"} value={fmtMoney(kpi.ytd.commission)} delta={pctDelta(kpi.ytd.commission, kpi.ytdPy.commission)} accent="#ED7D31" />
                <Kpi label={isFr ? "Commission / dossier" : "Commission / deal"} value={fmtMoney(kpi.ytd.deals ? kpi.ytd.commission / kpi.ytd.deals : 0)} accent="#8B5CF6" />
              </div>

              <Section title={isFr ? "Volume, dossiers et commission par mois" : "Volume, deals and commission by month"}>
                <Table
                  head={[isFr ? "Mois" : "Month", "", "Volume", isFr ? "Doss." : "Deals", "Commission", isFr ? "Comm./doss." : "Comm./deal", "BPS"]}
                  rows={(data.monthly ?? []).map((m: any) => [
                    MONTHS[m.month - 1], "", fmtMoney(m.cyVolume), fmtNum(m.cyDeals), fmtMoney(m.cyCommission),
                    fmtMoney(m.cyDeals ? m.cyCommission / m.cyDeals : 0), fmtBps(m.bps),
                  ])}
                />
              </Section>

              <Section title={isFr ? "Par trimestre" : "By quarter"}>
                <Table
                  head={[isFr ? "Trimestre" : "Quarter", "", "Volume", isFr ? "Doss." : "Deals", "Commission", isFr ? "Comm./doss." : "Comm./deal", "BPS"]}
                  rows={(data.quarters ?? []).map((q: any) => [
                    `Q${q.quarter}`, "", fmtMoney(q.volume), fmtNum(q.deals), fmtMoney(q.commission),
                    fmtMoney(q.deals ? q.commission / q.deals : 0), fmtBps(q.bps),
                  ])}
                />
              </Section>
            </>
          )}


          {tab === "club" && (
            <ClubExcellencePanel
              lang={lang}
              data={data}
              isAdminView={isAdminView}
              onBroker={(b) => { setDrillData(null); setDrillAgent(b); }}
            />
          )}

          {tab === "deals" && (
            <RegisterDealsTable deals={filteredDeals as any} lang={lang} />
          )}

          {tab === "audit" && (
            <CommissionAuditPanel audit={data?.audit} lang={lang} />
          )}

        </div>
      )}

      <RegisterDrilldown
        open={!!drill}
        onClose={() => setDrill(null)}
        lang={lang}
        title={drill?.title ?? ""}
        subtitle={drill?.subtitle}
        deals={drill?.deals ?? []}
        contextLabel={data?.periodLabel}
      />

      {isAdminView && drillAgent && (
        <BrokerDrilldown
          lang={lang}
          detail={drillData}
          loading={drillLoading}
          error={drillError}
          onClose={() => { setDrillAgent(null); setDrillData(null); setDrillError(null); }}
        />
      )}
    </div>

  );
}

function pctDelta(cy: number, py: number): number | string {
  if (!py) return cy ? "New" : "—";
  return (cy - py) / py;
}
