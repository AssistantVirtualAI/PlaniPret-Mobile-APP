import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Phone, Users, MessageSquare, Bot, ArrowUpRight, ArrowDownLeft, X, Sparkles, Flame, Clock, TrendingUp, TrendingDown, RefreshCw, DollarSign } from "lucide-react";
import { TEMP_COLORS, TEMP_EMOJI } from "@/components/planipret/leadHelpers";
import { computeServiceFinance, computeTotals, fmtMoney, type ServiceFinance } from "@/lib/planipret/pricing";
import { FinancialKpiCard } from "@/components/planipret/admin/FinancialKpiCard";
import { RevenueBreakdown } from "@/components/planipret/admin/RevenueBreakdown";
import { getPlanipretBrokerDirectory } from "@/lib/planipret/adminDirectory";
import { getPlanipretCallCount } from "@/lib/planipret/adminCounts";
import { usePlanipretBrokerStats } from "@/lib/planipret/brokerStats";
import { readAdminReportFilters, writeAdminReportFilters, type AdminPeriod } from "@/lib/planipret/adminReportFilters";
import { usePlanipretNsAutoSync } from "@/hooks/usePlanipretNsAutoSync";
import NsSyncBar from "@/components/planipret/admin/NsSyncBar";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

const ACCENT = "#2E9BDC";
const SUCCESS = "#00D4AA";
const WARNING = "#F5A623";
const AGENT = "#9B7FE8";
const DANGER = "#E84C4C";

const initials = (n?: string) =>
  (n ?? "?").split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

function KpiCard({ icon, title, value, subtitle, trend, color }: { icon: any; title: string; value: number | string; subtitle: string; trend?: number; color: string }) {
  const trendUp = (trend ?? 0) >= 0;
  return (
    <div className="pp-card relative overflow-hidden group" style={{ padding: 20 }}>
      <div
        aria-hidden
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{ background: `linear-gradient(90deg, ${color}, transparent)` }}
      />
      <div
        aria-hidden
        className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-10 group-hover:opacity-20 transition-opacity"
        style={{ background: `radial-gradient(circle, ${color}, transparent 70%)` }}
      />
      <div className="relative">
        <div className="flex items-start justify-between mb-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${color}1A`, color, border: `1px solid ${color}33` }}>
            {icon}
          </div>
          {trend !== undefined && (
            <span className="flex items-center gap-0.5 text-[11px] font-semibold tabular-nums" style={{ color: trendUp ? SUCCESS : DANGER }}>
              {trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {trendUp ? "+" : ""}{trend}%
            </span>
          )}
        </div>
        <div style={{ fontSize: 32, fontWeight: 700, lineHeight: 1, color: "var(--pp-text-primary)" }} className="tabular-nums">{value}</div>
        <p style={{ fontSize: 12, color: "var(--pp-text-secondary)", marginTop: 8 }}>{title}</p>
        <p style={{ fontSize: 11, color: "var(--pp-text-faint)", marginTop: 2 }}>{subtitle}</p>
      </div>
    </div>
  );
}

function RuleCard({ title, count, formula, filter, color }: { title: string; count: number; formula: string; filter: string; color: string }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "var(--pp-bg-deep)", border: "1px solid var(--pp-bg-border-2)" }}>
      <div className="flex items-center justify-between gap-2">
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--pp-text-primary)" }}>{title}</span>
        <span className="tabular-nums" style={{ fontSize: 18, fontWeight: 800, color }}>{count}</span>
      </div>
      <p className="mt-2" style={{ fontSize: 11, color: "var(--pp-text-secondary)" }}>{formula}</p>
      <p className="mt-1" style={{ fontSize: 10, color: "var(--pp-text-faint)" }}>{filter}</p>
    </div>
  );
}

function ChartCard({ title, subtitle, children, action }: { title: string; subtitle?: string; children: any; action?: any }) {
  return (
    <div className="pp-card" style={{ padding: 20 }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 style={{ fontFamily: "Inter,sans-serif", fontWeight: 600, fontSize: 14, color: "var(--pp-text-primary)" }}>{title}</h2>
          {subtitle && <p style={{ fontSize: 11, color: "var(--pp-text-faint)" }} className="mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

const TooltipDark = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--pp-bg-deep)", border: "1px solid var(--pp-bg-border-2)", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "var(--pp-text-primary)" }}>
      {label && <div style={{ color: "var(--pp-text-muted)", marginBottom: 4 }}>{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color || p.fill }} />
          <span>{p.name}: <strong>{p.value}</strong></span>
        </div>
      ))}
    </div>
  );
};

function ActivityDailyChart({ data }: { data: Array<{ day: string; appels: number; sms: number }> }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.appels, d.sms)));
  const plot = { x: 34, y: 16, w: 492, h: 142 };
  const point = (value: number, index: number) => {
    const x = plot.x + (data.length <= 1 ? plot.w / 2 : (index / (data.length - 1)) * plot.w);
    const y = plot.y + plot.h - (value / max) * plot.h;
    return { x, y };
  };
  const calls = data.map((d, i) => point(d.appels, i));
  const sms = data.map((d, i) => point(d.sms, i));
  const path = (pts: Array<{ x: number; y: number }>) => pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = (pts: Array<{ x: number; y: number }>) => `${path(pts)} L ${plot.x + plot.w},${plot.y + plot.h} L ${plot.x},${plot.y + plot.h} Z`;

  return (
    <div className="h-full w-full">
      <svg viewBox="0 0 560 210" className="h-[180px] w-full overflow-visible" role="img" aria-label="Activité journalière">
        {[0, 0.25, 0.5, 0.75, 1].map((n) => (
          <g key={n}>
            <line x1={plot.x} x2={plot.x + plot.w} y1={plot.y + plot.h * n} y2={plot.y + plot.h * n} stroke="rgba(74,127,165,0.18)" strokeDasharray="4 5" />
            <text x={8} y={plot.y + plot.h * n + 4} fontSize="10" fill="var(--pp-text-faint)">{Math.round(max * (1 - n))}</text>
          </g>
        ))}
        <path d={area(calls)} fill={ACCENT} opacity="0.14" />
        <path d={area(sms)} fill={WARNING} opacity="0.12" />
        <path d={path(calls)} fill="none" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d={path(sms)} fill="none" stroke={WARNING} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d, i) => {
          const c = calls[i];
          const m = sms[i];
          return (
            <g key={`${d.day}-${i}`}>
              <circle cx={c.x} cy={c.y} r="4" fill={ACCENT} />
              <circle cx={m.x} cy={m.y} r="4" fill={WARNING} />
              <text x={c.x} y="188" textAnchor="middle" fontSize="10" fill="var(--pp-text-muted)">{d.day}</text>
              <text x={c.x} y="204" textAnchor="middle" fontSize="10" fill="var(--pp-text-faint)">{d.appels}/{d.sms}</text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex items-center justify-center gap-4 text-[11px]" style={{ color: "var(--pp-text-muted)" }}>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: ACCENT }} /> Appels</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: WARNING }} /> SMS</span>
      </div>
    </div>
  );
}

function DistributionDonut({ data }: { data: Array<{ name: string; value: number; color: string }> }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let offset = 25;
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="grid h-full grid-cols-[130px_1fr] items-center gap-3">
      <svg viewBox="0 0 120 120" className="h-[130px] w-[130px] -rotate-90" role="img" aria-label="Distribution des appels">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(74,127,165,0.16)" strokeWidth="18" />
        {data.map((d) => {
          const dash = (d.value / total) * circumference;
          const circle = <circle key={d.name} cx="60" cy="60" r={radius} fill="none" stroke={d.color} strokeWidth="18" strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={offset} strokeLinecap="round" />;
          offset -= dash;
          return circle;
        })}
      </svg>
      <div className="space-y-2">
        {data.map((d) => (
          <div key={d.name} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5" style={{ background: "var(--pp-bg-deep)" }}>
            <span className="flex min-w-0 items-center gap-2 text-[11px]" style={{ color: "var(--pp-text-secondary)" }}>
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />
              <span className="truncate">{d.name}</span>
            </span>
            <strong className="tabular-nums text-[13px]" style={{ color: "var(--pp-text-primary)" }}>{d.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopBrokerBars({ data }: { data: Array<{ name: string; calls: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.calls));
  return (
    <div className="space-y-3 pt-1">
      {data.map((b, i) => (
        <div key={`${b.name}-${i}`}>
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="truncate text-[12px] font-medium" style={{ color: "var(--pp-text-primary)" }}>{b.name}</span>
            <span className="tabular-nums text-[12px] font-bold" style={{ color: ACCENT }}>{b.calls}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-sm" style={{ background: "var(--pp-bg-deep)" }}>
            <div className="h-full rounded-sm transition-all" style={{ width: `${Math.max(8, (b.calls / max) * 100)}%`, background: ACCENT }} />
          </div>
        </div>
      ))}
    </div>
  );
}

type Period = 1 | 7 | 30 | 90;

export default function PAOverview() {
  const { t, lang } = useMplanipretLang();
  const dateLocale = lang === "en" ? "en-CA" : "fr-CA";
  const [period, setPeriodState] = useState<Period>(() => readAdminReportFilters().period as Period);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    calls: 0, callsYest: 0, callsMissedToday: 0, brokers: 0, brokersTotal: 0,
    sms: 0, ava: 0, smsYest: 0, voicemailsUnread: 0,
    avgDurationSec: 0, answerRatePct: 0,
    overdueReminders: 0, hotLeads7d: 0, avaWeek: 0, brokersOnline: 0,
  });
  const [recent, setRecent] = useState<any[]>([]);
  const [brokers, setBrokers] = useState<any[]>([]);
  const [hotLeads, setHotLeads] = useState<any[]>([]);
  const [pendingByBroker, setPendingByBroker] = useState<Array<{ name: string; total: number; overdue: number }>>([]);
  const [seriesData, setSeriesData] = useState<Array<{ day: string; appels: number; sms: number }>>([]);
  const [directionDist, setDirectionDist] = useState<Array<{ name: string; value: number; color: string }>>([]);
  const [topBrokers, setTopBrokers] = useState<Array<{ name: string; calls: number }>>([]);

  // Single source of truth for broker activation counts (matches the toggles
  // on /admin/users via the planipret_broker_stats view, with Realtime sync).
  const { stats: brokerStats } = usePlanipretBrokerStats();
  const [serviceCounts, setServiceCounts] = useState({ mobile: 0, widget: 0, ai: 0 });

  const load = async () => {
    setRefreshing(true);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const periodAgo = new Date(today); periodAgo.setDate(periodAgo.getDate() - (period - 1));
    const prevPeriodAgo = new Date(today); prevPeriodAgo.setDate(prevPeriodAgo.getDate() - (period * 2 - 1));
    const periodIso = periodAgo.toISOString();
    const prevPeriodIso = prevPeriodAgo.toISOString();

    const sevenAgo = new Date(today); sevenAgo.setDate(sevenAgo.getDate() - 7);
    const sevenIso = sevenAgo.toISOString();
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    const nowIsoEarly = new Date().toISOString();

    const [c1, c2, missedPeriod, sms, smsY, ava, avaWeek, vm, rec, callsP, smsP, callsByDir, callsPeriodStats, topCalls, svcProfiles, directory, onlineC, overdueRemC, hotLeadsPeriodC] = await Promise.all([
      getPlanipretCallCount({ from: periodIso }, "started_at"),
      getPlanipretCallCount({ from: prevPeriodIso, to: periodIso }, "started_at"),
      getPlanipretCallCount({ status: "missed", from: periodIso }, "started_at"),
      supabase.from("planipret_phone_messages").select("id", { count: "exact", head: true }).gte("created_at", periodIso),
      supabase.from("planipret_phone_messages").select("id", { count: "exact", head: true }).gte("created_at", prevPeriodIso).lt("created_at", periodIso),
      supabase.from("ai_request_audit_log").select("id", { count: "exact", head: true }).gte("created_at", periodIso).like("action", "elevenlabs_tool:%"),
      supabase.from("ai_request_audit_log").select("id", { count: "exact", head: true }).gte("created_at", sevenIso).like("action", "elevenlabs_tool:%"),
      supabase.from("planipret_voicemails").select("id", { count: "exact", head: true }).eq("is_read", false),
      supabase.from("planipret_phone_calls").select("id, user_id, extension, direction, status, from_number, to_number, duration_seconds, started_at, created_at, ai_summary, metadata, planipret_profiles(full_name)").order("started_at", { ascending: false, nullsFirst: false }).limit(20),
      supabase.from("planipret_phone_calls").select("started_at, created_at").gte("started_at", periodIso),
      supabase.from("planipret_phone_messages").select("created_at").gte("created_at", periodIso),
      supabase.from("planipret_phone_calls").select("direction, status").gte("started_at", periodIso),
      supabase.from("planipret_phone_calls").select("duration_seconds, direction, status").gte("started_at", periodIso),
      supabase.from("planipret_phone_calls").select("user_id, extension, metadata, planipret_profiles(full_name)").gte("started_at", periodIso),
      supabase.from("planipret_profiles").select("full_name, email, ns_domain, mobile_app_enabled, voice_agent_enabled"),
      getPlanipretBrokerDirectory(),
      supabase.from("planipret_profiles").select("id", { count: "exact", head: true }).gte("updated_at", fiveMinAgo),
      supabase.from("planipret_reminders").select("id", { count: "exact", head: true }).eq("status", "pending").lt("scheduled_at", nowIsoEarly),
      supabase.from("planipret_phone_calls").select("id", { count: "exact", head: true }).gte("started_at", periodIso).gte("lead_score", 8),
    ]);

    const nsBrokerList = directory.brokers;
    const brokerTotal = directory.count || brokerStats.total_courtiers || ((svcProfiles.data ?? []) as any[]).length;

    // Period duration + answer-rate stats
    let totalDur = 0, durCount = 0, answered = 0, totalCallsPeriod = 0;
    (callsPeriodStats.data ?? []).forEach((c: any) => {
      totalCallsPeriod++;
      if (c.duration_seconds) { totalDur += c.duration_seconds; durCount++; }
      if (c.status !== "missed") answered++;
    });
    const avgDur = durCount > 0 ? Math.round(totalDur / durCount) : 0;
    const answerPct = totalCallsPeriod > 0 ? Math.round((answered / totalCallsPeriod) * 100) : 0;

    // Broker KPI = active broker directory count. Mobile adoption stays separate.
    const profilesAll = (svcProfiles.data ?? []) as Array<{ full_name: string | null; email: string | null; ns_domain: string | null; mobile_app_enabled: boolean | null; voice_agent_enabled: boolean | null }>;
    const brokersActive = brokerTotal;

    setStats({
      calls: c1 ?? 0, callsYest: c2 ?? 0, callsMissedToday: missedPeriod ?? 0,
      brokers: brokersActive, brokersTotal: brokerTotal,
      sms: sms.count ?? 0, smsYest: smsY.count ?? 0,
      ava: ava.count ?? 0, avaWeek: avaWeek.count ?? 0,
      voicemailsUnread: vm.count ?? 0,
      avgDurationSec: avgDur, answerRatePct: answerPct,
      overdueReminders: overdueRemC.count ?? 0,
      hotLeads7d: hotLeadsPeriodC.count ?? 0,
      brokersOnline: onlineC.count ?? 0,
    });

    // Service counts — use the same canonical source of truth as /admin/rapports
    // (planipret_broker_stats view) to avoid drift between pages. The widget
    // base = every courtier NS actif (total_courtiers), mobile/AI use the
    // toggles already aggregated by the view.
    const TEST_PATTERNS = ["scott", "mohamad", "carlo", "clinton"];
    const isTest = (name?: string | null, email?: string | null) => {
      const s = `${name ?? ""} ${email ?? ""}`.toLowerCase();
      return TEST_PATTERNS.some((p) => s.includes(p));
    };
    const isRealBroker = (p: { full_name: string | null; email: string | null; ns_domain: string | null }) =>
      p.ns_domain === "planipret.ca" && !isTest(p.full_name, p.email);
    const realBrokers = profilesAll.filter(isRealBroker);
    const widgetN = brokerStats.total_courtiers || brokerTotal || realBrokers.length;
    const mobileN = brokerStats.app_mobile_active || realBrokers.filter((p) => p.mobile_app_enabled).length || profilesAll.filter((p) => p.mobile_app_enabled).length;
    const aiN = brokerStats.agent_ia_active || realBrokers.filter((p) => p.voice_agent_enabled).length || profilesAll.filter((p) => p.voice_agent_enabled).length;
    setServiceCounts({ mobile: mobileN, widget: widgetN, ai: aiN });
    setRecent(rec.data ?? []);
    setBrokers(nsBrokerList.slice(0, 10));

    // period series
    const days: Array<{ day: string; appels: number; sms: number }> = [];
    const step = period <= 7 ? 1 : period <= 30 ? 1 : 3;
    for (let i = period - 1; i >= 0; i -= step) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({
        day: period <= 7 ? d.toLocaleDateString(dateLocale, { weekday: "short" }) : d.toLocaleDateString(dateLocale, { day: "2-digit", month: "2-digit" }),
        appels: 0, sms: 0,
      });
      (callsP.data ?? []).forEach((c: any) => { if ((c.started_at ?? c.created_at)?.slice(0, 10) === key) days[days.length - 1].appels++; });
      (smsP.data ?? []).forEach((m: any) => { if (m.created_at?.slice(0, 10) === key) days[days.length - 1].sms++; });
    }
    setSeriesData(days);

    // Direction distribution (missed comes from status, not direction)
    const distMap = { inbound: 0, outbound: 0, missed: 0 };
    (callsByDir.data ?? []).forEach((c: any) => {
      if (c.status === "missed") distMap.missed++;
      else if (c.direction === "inbound") distMap.inbound++;
      else if (c.direction === "outbound") distMap.outbound++;
    });
    setDirectionDist([
      { name: t("overview.dirInbound"), value: distMap.inbound, color: ACCENT },
      { name: t("overview.dirOutbound"), value: distMap.outbound, color: SUCCESS },
      { name: t("overview.dirMissed"), value: distMap.missed, color: DANGER },
    ]);

    // Top 5 brokers
    const topMap: Record<string, { name: string; calls: number }> = {};
    (topCalls.data ?? []).forEach((c: any) => {
      const name = c.planipret_profiles?.full_name ?? (c.extension ? `Ext. ${c.extension}` : "—");
      const key = c.user_id ?? `ext:${c.extension ?? "unknown"}`;
      if (!topMap[key]) topMap[key] = { name, calls: 0 };
      topMap[key].calls += 1;
    });
    setTopBrokers(Object.values(topMap).sort((a, b) => b.calls - a.calls).slice(0, 5));

    // Hot leads
    const { data: hot } = await supabase
      .from("planipret_phone_calls")
      .select("id, user_id, extension, from_number, from_name, to_number, to_name, lead_score, started_at, created_at, planipret_profiles(full_name)")
      .gte("started_at", periodIso)
      .gte("lead_score", 8)
      .order("lead_score", { ascending: false })
      .limit(8);
    setHotLeads((hot ?? []) as any);

    // Pending reminders
    const nowIso = new Date().toISOString();
    const { data: rems } = await supabase
      .from("planipret_reminders")
      .select("user_id, scheduled_at, status, planipret_profiles!inner(full_name)")
      .eq("status", "pending");
    const agg: Record<string, { name: string; total: number; overdue: number }> = {};
    (rems ?? []).forEach((r: any) => {
      const name = r.planipret_profiles?.full_name ?? "—";
      const key = r.user_id;
      if (!agg[key]) agg[key] = { name, total: 0, overdue: 0 };
      agg[key].total += 1;
      if (r.scheduled_at < nowIso) agg[key].overdue += 1;
    });
    setPendingByBroker(Object.values(agg).sort((a, b) => b.overdue - a.overdue || b.total - a.total).slice(0, 8));
    setRefreshing(false);
  };

  usePlanipretNsAutoSync({ onQueued: load });

  const setPeriod = (next: Period) => {
    setPeriodState(next);
    writeAdminReportFilters({ period: next as AdminPeriod, dispatcher: "all" });
  };

  useEffect(() => {
    load();
    // Debounced reload to avoid thrash when many rows change at once.
    let deb: number | undefined;
    const reload = () => { if (deb) window.clearTimeout(deb); deb = window.setTimeout(load, 800); };
    const ch = supabase.channel("admin-overview")
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_phone_calls" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_phone_messages" }, reload)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "planipret_profiles" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_voicemails" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_reminders" }, reload)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ai_request_audit_log" }, reload)
      .subscribe();
    const t = window.setInterval(load, 30000);
    return () => { supabase.removeChannel(ch); window.clearInterval(t); if (deb) window.clearTimeout(deb); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, brokerStats.app_mobile_active, brokerStats.total_courtiers, brokerStats.agent_ia_active]);


  const callsTrend = stats.callsYest > 0 ? Math.round(((stats.calls - stats.callsYest) / stats.callsYest) * 100) : undefined;
  const smsTrend = stats.smsYest > 0 ? Math.round(((stats.sms - stats.smsYest) / stats.smsYest) * 100) : undefined;

  // Financial rows
  const finance = useMemo<ServiceFinance[]>(() => [
    computeServiceFinance("mobile", serviceCounts.mobile),
    computeServiceFinance("widget", serviceCounts.widget),
    computeServiceFinance("ai", serviceCounts.ai),
  ], [serviceCounts]);
  const totals = useMemo(() => computeTotals(finance), [finance]);

  // Engagement metrics
  const avgCallsPerBroker = stats.brokers > 0 ? (seriesData.reduce((s, d) => s + d.appels, 0) / stats.brokers).toFixed(1) : "0";
  const mobileAdoptionPct = stats.brokersTotal > 0 ? Math.round((serviceCounts.mobile / stats.brokersTotal) * 100) : 0;

  return (
    <div className="space-y-5">
      <NsSyncBar features={["cdrs", "messages", "recordings"]} onReload={load} />

      {/* Header with period selector */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 style={{ fontFamily: "Inter,sans-serif", fontWeight: 700, fontSize: 22, color: "var(--pp-text-primary)" }}>{t("overview.title")}</h1>
          <p style={{ fontSize: 12, color: "var(--pp-text-faint)" }} className="mt-0.5">{t("overview.cockpit")} · {totals.users} {t("overview.subtitleBillable")} · {fmtMoney(totals.profit)} {t("overview.subtitleProfit")}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg overflow-hidden" style={{ background: "var(--pp-bg-deep)", border: "1px solid var(--pp-bg-border-2)" }}>
            {[1, 7, 30, 90].map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p as Period)}
                className="px-3 py-1.5 transition-colors"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: period === p ? "#fff" : "var(--pp-text-muted)",
                  background: period === p ? ACCENT : "transparent",
                }}
              >
                {p === 1 ? (lang === "en" ? "Today" : "Aujourd'hui") : `${p}${t("overview.days")}`}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            className="px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all hover:bg-white/5"
            style={{ background: "var(--pp-bg-deep)", border: "1px solid var(--pp-bg-border-2)", fontSize: 11, color: "var(--pp-text-muted)" }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {t("overview.refresh")}
          </button>
        </div>
      </div>

      {/* KPI Hero Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={<Phone className="w-5 h-5" />} title={`${t("overview.seriesCalls")} · ${period}${t("overview.days")}`} value={stats.calls} subtitle={`${stats.callsMissedToday} ${t("overview.kpiCallsSub")}`} trend={callsTrend} color={ACCENT} />
        <KpiCard icon={<Users className="w-5 h-5" />} title={t("overview.kpiActiveBrokers")} value={stats.brokers} subtitle={`${serviceCounts.mobile} ${t("overview.svcMobile")} · ${stats.brokersOnline} ${t("overview.kpiOnline")}`} color={SUCCESS} />
        <KpiCard icon={<MessageSquare className="w-5 h-5" />} title={`${t("overview.seriesSms")} · ${period}${t("overview.days")}`} value={stats.sms} subtitle={t("overview.kpiSmsSub")} trend={smsTrend} color={WARNING} />
        <KpiCard icon={<Bot className="w-5 h-5" />} title={`AVA · ${period}${t("overview.days")}`} value={stats.ava} subtitle={`${stats.avaWeek} ${t("overview.kpiAvaSubDays")} · ${stats.voicemailsUnread} ${t("overview.kpiAvaSubVm")}`} color={AGENT} />
      </div>

      {/* KPI Secondary Grid — call quality + follow-ups */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <MiniStat label={t("overview.miniAvgDuration")} value={stats.avgDurationSec > 0 ? `${Math.floor(stats.avgDurationSec / 60)}m ${stats.avgDurationSec % 60}s` : "—"} sub={`${t("overview.miniPeriod")} ${period} ${t("overview.days")}`} color={ACCENT} />
        <MiniStat label={t("overview.miniAnswerRate")} value={`${stats.answerRatePct}%`} sub={`${t("overview.miniPeriod")} ${period} ${t("overview.days")}`} color={SUCCESS} />
        <MiniStat label={t("overview.miniMissedCalls")} value={stats.callsMissedToday} sub={`${t("overview.miniPeriod")} ${period} ${t("overview.days")}`} color={DANGER} />
        <MiniStat label={t("overview.miniOverdue")} value={stats.overdueReminders} sub={t("overview.miniToProcess")} color={WARNING} />
        <MiniStat label={t("overview.miniHotLeads")} value={stats.hotLeads7d} sub={`${period} ${t("overview.miniLastDays")}`} color={AGENT} />
      </div>



      {/* ===== FINANCIAL SECTION ===== */}
      <div className="flex items-center gap-2 pt-2">
        <DollarSign className="w-4 h-4" style={{ color: SUCCESS }} />
        <h2 style={{ fontFamily: "Inter,sans-serif", fontWeight: 700, fontSize: 16, color: "var(--pp-text-primary)" }}>{t("overview.financialTitle")}</h2>
        <span style={{ fontSize: 10, color: "var(--pp-text-faint)" }} className="ml-2 px-2 py-0.5 rounded-full" >{t("overview.live")}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {finance.map((f) => <FinancialKpiCard key={f.service} data={f} />)}
      </div>

      <RevenueBreakdown rows={finance} />

      {/* Detailed broker breakdown per service */}
      <div className="pp-card" style={{ padding: 20 }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 style={{ fontFamily: "Inter,sans-serif", fontWeight: 600, fontSize: 14, color: "var(--pp-text-primary)" }}>{t("overview.breakdownTitle")}</h2>
            <p style={{ fontSize: 11, color: "var(--pp-text-faint)" }} className="mt-0.5">{t("overview.breakdownSubtitle")}</p>
          </div>
          <span style={{ fontSize: 10, color: "var(--pp-text-faint)" }}>{t("overview.totalUnits").replace("{n}", String(totals.users))}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--pp-bg-border-2)" }}>
                {[t("overview.thService"), t("overview.thBrokers"), t("overview.thUnitCost"), t("overview.thUnitPrice"), t("overview.thMonthlyCost"), t("overview.thMonthlyRevenue"), t("overview.thMonthlyProfit"), t("overview.thMargin")].map((h) => (
                  <th key={h} className="py-2 px-2 text-left" style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--pp-text-faint)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {finance.map((f) => {
                const unitCost = f.users > 0 ? f.cost / f.users : 0;
                const rule = f.service === "widget"
                  ? t("overview.ruleWidget")
                  : f.service === "mobile"
                    ? t("overview.ruleMobile")
                    : t("overview.ruleAi");
                const svcLabel = f.service === "mobile" ? t("overview.svcMobile") : f.service === "widget" ? t("overview.svcWidget") : t("overview.svcAI");
                return (
                  <tr key={f.service} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2">
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: (finance.find(x => x.service === f.service) && (f.service === "mobile" ? "#2E9BDC" : f.service === "widget" ? "#F5A623" : "#9B7FE8")) }} />
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--pp-text-primary)" }}>{svcLabel}</div>
                          <div style={{ fontSize: 10, color: "var(--pp-text-faint)" }}>{rule}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-2 tabular-nums" style={{ fontSize: 13, fontWeight: 700, color: "var(--pp-text-primary)" }}>{f.users}</td>
                    <td className="py-3 px-2 tabular-nums" style={{ fontSize: 12, color: DANGER }}>{fmtMoney(unitCost)}</td>
                    <td className="py-3 px-2 tabular-nums" style={{ fontSize: 12, color: "var(--pp-text-muted)" }}>{fmtMoney(49.95)}</td>
                    <td className="py-3 px-2 tabular-nums" style={{ fontSize: 12, color: DANGER }}>{fmtMoney(f.cost)}</td>
                    <td className="py-3 px-2 tabular-nums" style={{ fontSize: 12, color: ACCENT }}>{fmtMoney(f.revenue)}</td>
                    <td className="py-3 px-2 tabular-nums" style={{ fontSize: 13, fontWeight: 700, color: SUCCESS }}>{fmtMoney(f.profit)}</td>
                    <td className="py-3 px-2 tabular-nums" style={{ fontSize: 12, color: AGENT }}>{f.marginPct.toFixed(1)}%</td>
                  </tr>
                );
              })}
              <tr style={{ borderTop: "2px solid var(--pp-bg-border-2)", background: "rgba(46,155,220,0.04)" }}>
                <td className="py-3 px-2" style={{ fontSize: 12, fontWeight: 700, color: "var(--pp-text-primary)" }}>{t("overview.total")}</td>
                <td className="py-3 px-2 tabular-nums" style={{ fontSize: 13, fontWeight: 700, color: "var(--pp-text-primary)" }}>{totals.users}</td>
                <td className="py-3 px-2" style={{ fontSize: 12, color: "var(--pp-text-faint)" }}>—</td>
                <td className="py-3 px-2" style={{ fontSize: 12, color: "var(--pp-text-faint)" }}>—</td>
                <td className="py-3 px-2 tabular-nums" style={{ fontSize: 13, fontWeight: 700, color: DANGER }}>{fmtMoney(totals.cost)}</td>
                <td className="py-3 px-2 tabular-nums" style={{ fontSize: 13, fontWeight: 700, color: ACCENT }}>{fmtMoney(totals.revenue)}</td>
                <td className="py-3 px-2 tabular-nums" style={{ fontSize: 14, fontWeight: 700, color: SUCCESS }}>{fmtMoney(totals.profit)}</td>
                <td className="py-3 px-2 tabular-nums" style={{ fontSize: 12, fontWeight: 700, color: AGENT }}>{totals.marginPct.toFixed(1)}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="pp-card" style={{ padding: 20 }}>
        <div className="mb-3">
          <h2 style={{ fontFamily: "Inter,sans-serif", fontWeight: 600, fontSize: 14, color: "var(--pp-text-primary)" }}>{t("overview.rulesTitle")}</h2>
          <p style={{ fontSize: 11, color: "var(--pp-text-faint)" }} className="mt-0.5">{t("overview.rulesSubtitle")}</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <RuleCard title={t("overview.svcWidget")} count={serviceCounts.widget} formula={`${serviceCounts.widget} × 18,99 $ = ${fmtMoney(serviceCounts.widget * 18.99)} / mois`} filter={t("overview.ruleWidget")} color={WARNING} />
          <RuleCard title={t("overview.svcMobile")} count={serviceCounts.mobile} formula={`${serviceCounts.mobile} × 8,00 $ = ${fmtMoney(serviceCounts.mobile * 8)} / mois`} filter={t("overview.ruleMobile")} color={ACCENT} />
          <RuleCard title={t("overview.svcAI")} count={serviceCounts.ai} formula={`${serviceCounts.ai} × 25,00 $ = ${fmtMoney(serviceCounts.ai * 25)} / mois`} filter={t("overview.ruleAi")} color={AGENT} />
        </div>
      </div>



      {/* Engagement strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MiniStat label={t("overview.engagementMobileAdoption")} value={`${mobileAdoptionPct}%`} sub={`${serviceCounts.mobile}/${stats.brokersTotal} ${t("overview.engagementBrokers")}`} color={ACCENT} />
        <MiniStat label={`${t("overview.engagementCallsPerBroker")} (${period}${t("overview.days")})`} value={avgCallsPerBroker} sub={t("overview.engagementAverage")} color={SUCCESS} />
        <MiniStat label={t("overview.engagementHotLeads")} value={hotLeads.length} sub={t("overview.engagementHotLeadsSub")} color={DANGER} />
        <MiniStat label={t("overview.engagementVoicemails")} value={stats.voicemailsUnread} sub={t("overview.engagementUnread")} color={WARNING} />
      </div>

      {/* Activity charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ChartCard title={`${t("overview.chartActivityTitle")} ${period} ${t("overview.miniLastDays")}`} subtitle={t("overview.chartActivitySubtitle")}>
            <div style={{ width: "100%", height: 240 }}>
              {seriesData.length === 0 || seriesData.every((d) => d.appels === 0 && d.sms === 0) ? (
                <p style={{ fontSize: 12, color: "var(--pp-text-faint)" }} className="text-center py-20">{t("overview.noData")}</p>
              ) : (
                <ActivityDailyChart data={seriesData} />
              )}
            </div>
          </ChartCard>
        </div>

        <ChartCard title={t("overview.chartDistTitle")} subtitle={`${t("overview.chartDistSubtitle")} ${period}${t("overview.days")}`}>
          <div style={{ width: "100%", height: 240 }}>
            {directionDist.every((d) => d.value === 0) ? (
              <p style={{ fontSize: 12, color: "var(--pp-text-faint)" }} className="text-center py-20">{t("overview.noData")}</p>
            ) : (
              <DistributionDonut data={directionDist} />
            )}
          </div>
        </ChartCard>
      </div>

      {/* Top brokers + Hot leads */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title={`${t("overview.chartTop5Title")} (${period}${t("overview.days")})`}>
          <div style={{ width: "100%", height: 240 }}>
            {topBrokers.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--pp-text-faint)" }} className="text-center py-8">{t("overview.noData")}</p>
            ) : (
              <TopBrokerBars data={topBrokers} />
            )}
          </div>
        </ChartCard>

        <ChartCard title={t("overview.chartHotLeadsTitle")} action={
          <Link to="/planipret/admin/leads" style={{ fontSize: 11, color: ACCENT }} className="hover:underline">{t("overview.viewAll")}</Link>
        }>
          {hotLeads.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--pp-text-faint)" }} className="text-center py-8">{t("overview.chartHotLeadsEmpty")}</p>
          ) : (
            <ul className="space-y-1.5 max-h-[240px] overflow-y-auto">
              {hotLeads.map((l) => {
                const contact = l.from_name ?? l.from_number ?? l.to_name ?? l.to_number ?? "—";
                return (
                  <li key={l.id} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "rgba(232,76,76,0.06)", borderLeft: `3px solid ${TEMP_COLORS.hot}` }}>
                    <Flame className="w-3.5 h-3.5 flex-shrink-0" style={{ color: TEMP_COLORS.hot }} />
                    <div className="flex-1 min-w-0">
                      <p className="truncate" style={{ fontSize: 12, color: "var(--pp-text-primary)" }}>{l.planipret_profiles?.full_name ?? (l.extension ? `Ext. ${l.extension}` : "—")}</p>
                      <p className="truncate" style={{ fontSize: 11, color: "var(--pp-text-muted)" }}>{contact}</p>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: TEMP_COLORS.hot }}>{TEMP_EMOJI.hot} {l.lead_score}/10</span>
                    <span style={{ fontSize: 10, color: "var(--pp-text-faint)" }}>{new Date(l.started_at ?? l.created_at).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" })}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </ChartCard>
      </div>

      {/* Recent activity + Brokers online */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 pp-card" style={{ padding: 20 }}>
          <h2 style={{ fontFamily: "Inter,sans-serif", fontWeight: 600, fontSize: 14, color: "var(--pp-text-primary)", marginBottom: 12 }}>{t("overview.recentTitle")}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--pp-bg-border-2)" }}>
                  {[t("overview.thBroker"), t("overview.thDirection"), t("overview.thNumber"), t("overview.thDuration"), t("overview.thTime"), t("overview.thAi")].map((h) => (
                    <th key={h} className="py-2 text-left" style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--pp-text-faint)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map((c) => {
                  const inb = c.direction === "inbound", missed = c.status === "missed";
                  const Icon = missed ? X : inb ? ArrowDownLeft : ArrowUpRight;
                  const col = missed ? DANGER : inb ? ACCENT : SUCCESS;
                  const num = inb || missed ? c.from_number : c.to_number;
                  return (
                    <tr key={c.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }} className="hover:bg-white/[0.02]">
                      <td className="py-2.5 truncate max-w-[140px]" style={{ fontSize: 12, color: "var(--pp-text-primary)" }}>{(c as any).planipret_profiles?.full_name ?? ((c as any).extension ? `Ext. ${(c as any).extension}` : "—")}</td>
                      <td><Icon className="w-3.5 h-3.5" style={{ color: col }} /></td>
                      <td style={{ fontSize: 12, color: "var(--pp-text-secondary)" }}>{num ?? "—"}</td>
                      <td style={{ fontSize: 12, color: "var(--pp-text-muted)" }}>{c.duration_seconds ? `${Math.floor(c.duration_seconds / 60)}m${c.duration_seconds % 60}s` : "—"}</td>
                      <td style={{ fontSize: 11, color: "var(--pp-text-faint)" }}>{(c.started_at || c.created_at) ? new Date(c.started_at || c.created_at).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" }) : ""}</td>
                      <td>{c.ai_summary && <Sparkles className="w-3.5 h-3.5" style={{ color: AGENT }} />}</td>
                    </tr>
                  );
                })}
                {recent.length === 0 && <tr><td colSpan={6} className="py-6 text-center" style={{ fontSize: 11, color: "var(--pp-text-faint)" }}>{t("overview.recentEmpty")}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>


        <div className="lg:col-span-2 pp-card" style={{ padding: 20 }}>
          <h2 style={{ fontFamily: "Inter,sans-serif", fontWeight: 600, fontSize: 14, color: "var(--pp-text-primary)", marginBottom: 12 }}>{t("overview.brokersTitle")}</h2>
          <ul className="space-y-1 max-h-[420px] overflow-y-auto">
            {brokers.map((b) => {
              const online = b.mobile_app_enabled;
              return (
                <li key={b.user_id ?? b.email ?? b.full_name} className="flex items-center gap-3 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, #1A4A8A, #2E9BDC)", color: "#fff", fontSize: 10, fontWeight: 700 }}>
                    {initials(b.full_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate" style={{ fontSize: 12, color: "var(--pp-text-primary)" }}>{b.full_name}</p>
                    <p style={{ fontSize: 10, color: "var(--pp-text-faint)" }}>{b.updated_at ? new Date(b.updated_at).toLocaleString(dateLocale, { hour: "2-digit", minute: "2-digit" }) : ""}</p>
                  </div>
                  <span className="flex items-center gap-1" style={{ fontSize: 10 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: online ? SUCCESS : "var(--pp-text-faint)", boxShadow: online ? `0 0 6px ${SUCCESS}` : "none" }} />
                    <span style={{ color: online ? SUCCESS : "var(--pp-text-faint)" }}>{online ? t("overview.brokerActive") : t("overview.brokerInactive")}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Pending reminders */}
      {pendingByBroker.length > 0 && (
        <div className="pp-card" style={{ padding: 20 }}>
          <h2 className="flex items-center gap-2 mb-3" style={{ fontFamily: "Inter,sans-serif", fontWeight: 600, fontSize: 14, color: "var(--pp-text-primary)" }}>
            <Clock className="w-4 h-4" style={{ color: WARNING }} /> {t("overview.remindersTitle")}
          </h2>
          <ul className="space-y-1">
            {pendingByBroker.map((p, i) => (
              <li key={i} className="flex items-center gap-2 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                <span className="flex-1 truncate" style={{ fontSize: 12, color: "var(--pp-text-primary)" }}>{p.name}</span>
                <span style={{ fontSize: 11, color: "var(--pp-text-muted)" }} className="tabular-nums">{p.total} {t("overview.pending")}</span>
                {p.overdue > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-white" style={{ fontSize: 10, fontWeight: 700, background: DANGER }}>
                    {p.overdue} {t("overview.overdue")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, sub, color }: { label: string; value: string | number; sub: string; color: string }) {
  return (
    <div className="pp-card" style={{ padding: 16 }}>
      <div className="flex items-center justify-between mb-1">
        <span style={{ fontSize: 10, color: "var(--pp-text-faint)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}` }} />
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color }} className="tabular-nums">{value}</div>
      <p style={{ fontSize: 10, color: "var(--pp-text-faint)", marginTop: 2 }}>{sub}</p>
    </div>
  );
}
