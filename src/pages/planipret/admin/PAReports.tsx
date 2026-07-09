import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Download, Trophy, FileText, RefreshCw, Smartphone, Bot, Plug, Mail, Link2, Users, DollarSign } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { usePlanipretBrokerStats } from "@/lib/planipret/brokerStats";
import { getPlanipretBrokerDirectory } from "@/lib/planipret/adminDirectory";
import { ADMIN_REPORT_FILTERS_EVENT, periodLabel, periodToRange, rangeToPeriod, readAdminReportFilters, writeAdminReportFilters } from "@/lib/planipret/adminReportFilters";
import { usePlanipretNsAutoSync } from "@/hooks/usePlanipretNsAutoSync";
import NsSyncBar from "@/components/planipret/admin/NsSyncBar";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { computeServiceFinance, computeTotals, fmtMoney, type ServiceFinance } from "@/lib/planipret/pricing";
import { FinancialKpiCard } from "@/components/planipret/admin/FinancialKpiCard";
import { RevenueBreakdown } from "@/components/planipret/admin/RevenueBreakdown";

type Range = "week" | "month" | "quarter";

const ACCENT = "#2E9BDC";
const SUCCESS = "#00D4AA";
const DANGER = "#E84C4C";
const GOLD = "#F5C842";
const SILVER = "#C0C0C0";
const BRONZE = "#CD7F32";

const eventDate = (row: any) => row?.started_at ?? row?.sent_at ?? row?.created_at;

export default function PAReports() {
  const { t, lang } = useMplanipretLang();
  const dateLocale = lang === "en" ? "en-CA" : "fr-CA";
  const [range, setRangeState] = useState<Range>(() => periodToRange(readAdminReportFilters().period));
  const [calls, setCalls] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [avaFeedback, setAvaFeedback] = useState<Array<{ rating: string }>>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [brokers, setBrokers] = useState<Record<string, string>>({});
  const [brokerSnapshot, setBrokerSnapshot] = useState({ total: 0, mobile: 0, ai: 0, maestro: 0, ms365: 0, ns: 0 });
  const [exporting, setExporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [loadingPeriod, setLoadingPeriod] = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const { stats: brokerStats } = usePlanipretBrokerStats();


  const selectedPeriod = rangeToPeriod(range);
  const selectedPeriodLabel = periodLabel(selectedPeriod);

  const setRange = (next: Range) => {
    setRangeState(next);
    writeAdminReportFilters({ period: rangeToPeriod(next), dispatcher: "all" });
  };

  usePlanipretNsAutoSync({ onQueued: () => setRefreshTick((t) => t + 1) });

  useEffect(() => {
    const onFilters = (event: Event) => {
      const next = (event as CustomEvent).detail?.period ?? readAdminReportFilters().period;
      setRangeState(periodToRange(next));
    };
    window.addEventListener(ADMIN_REPORT_FILTERS_EVENT, onFilters);
    window.addEventListener("storage", onFilters);
    return () => {
      window.removeEventListener(ADMIN_REPORT_FILTERS_EVENT, onFilters);
      window.removeEventListener("storage", onFilters);
    };
  }, []);

  useEffect(() => {
    setLoadingPeriod(true);
    const start = new Date();
    if (range === "week") start.setDate(start.getDate() - 7);
    else if (range === "month") start.setMonth(start.getMonth() - 1);
    else start.setMonth(start.getMonth() - 3);
    start.setHours(0, 0, 0, 0);
    (async () => {
      const startIso = start.toISOString();
      const [{ data: c }, { data: p }, directory, { data: m }, { data: fb }, { data: rem }] = await Promise.all([
        supabase.from("planipret_phone_calls").select("*").gte("created_at", startIso),
        supabase.from("planipret_profiles").select("user_id, full_name, extension, ns_extension"),
        getPlanipretBrokerDirectory(),
        supabase.from("planipret_phone_messages").select("id, sent_at, created_at, direction, user_id, extension").gte("created_at", startIso),
        supabase.from("planipret_ava_feedback").select("rating").gte("created_at", startIso),
        supabase.from("planipret_reminders").select("id, user_id, status, scheduled_at, created_at").gte("created_at", startIso),
      ]);
      setCalls(c ?? []);
      setMessages(m ?? []);
      setAvaFeedback((fb ?? []) as any);
      setReminders(rem ?? []);
      const map: Record<string, string> = {};
      (p ?? []).forEach((x: any) => {
        map[x.user_id] = x.full_name;
        if (x.extension) map[`ext:${x.extension}`] = x.full_name;
        if (x.ns_extension) map[`ext:${x.ns_extension}`] = x.full_name;
      });
      ((directory as any).brokers ?? []).forEach((x: any) => {
        if (x.extension) map[`ext:${x.extension}`] = x.full_name || `Ext. ${x.extension}`;
        if (x.user_id && !String(x.user_id).startsWith("ns:")) map[x.user_id] = x.full_name || map[x.user_id];
      });
      setBrokers(map);
      const rows = ((directory as any).brokers ?? []) as any[];
      setBrokerSnapshot({
        total: (directory as any).count ?? rows.length,
        mobile: rows.filter((x) => x.mobile_app_enabled).length,
        ai: rows.filter((x) => x.voice_agent_enabled).length,
        maestro: rows.filter((x) => x.maestro_connected).length,
        ms365: brokerStats.ms365_connected,
        ns: brokerStats.ns_linked || ((directory as any).count ?? rows.length),
      });
      setLoadedAt(new Date());
      setLoadingPeriod(false);
    })();
  }, [range, refreshTick, brokerStats.ms365_connected, brokerStats.ns_linked]);



  const syncAll = async () => {
    setSyncing(true);
    const id = toast.loading(t("reports.syncing"));
    try {
      const { data, error } = await supabase.functions.invoke("pp-admin-ns-sync", { body: {} });
      if (error) throw error;
      toast.success(`${(data as any)?.extensions ?? (data as any)?.users_total ?? 0} ${t("reports.syncSuccess")}`, { id });
    } catch (e: any) {
      toast.error(`${t("reports.syncError")}${e.message ?? e}`, { id });
    } finally {
      setSyncing(false);
    }
  };

  const byDay = useMemo(() => {
    const map: Record<string, number> = {};
    calls.forEach((c) => {
      const d = new Date(eventDate(c)).toLocaleDateString(dateLocale, { day: "2-digit", month: "short" });
      map[d] = (map[d] ?? 0) + 1;
    });
    return Object.entries(map).map(([date, count]) => ({ date, count }));
  }, [calls, dateLocale]);

  const byDirection = useMemo(() => {
    const m = { inbound: 0, outbound: 0, missed: 0 };
    calls.forEach((c) => {
      if (c.status === "missed") m.missed++;
      else if (c.direction in m) (m as any)[c.direction]++;
    });
    return [
      { name: t("reports.dirInbound"), value: m.inbound, color: ACCENT },
      { name: t("reports.dirOutbound"), value: m.outbound, color: SUCCESS },
      { name: t("reports.dirMissed"), value: m.missed, color: DANGER },
    ];
  }, [calls, t]);


  const avgDuration = useMemo(() => {
    const arr = calls.filter((c) => c.duration_seconds).map((c) => c.duration_seconds);
    if (!arr.length) return "—";
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    return `${Math.floor(avg / 60)} min ${Math.floor(avg % 60)} sec`;
  }, [calls]);

  const peakHour = useMemo(() => {
    const h: Record<number, number> = {};
    calls.forEach((c) => { const hh = new Date(eventDate(c)).getHours(); h[hh] = (h[hh] ?? 0) + 1; });
    const top = Object.entries(h).sort((a, b) => b[1] - a[1])[0];
    return top ? `${top[0]}h–${+top[0] + 1}h` : "—";
  }, [calls]);

  const answerRate = useMemo(() => {
    if (!calls.length) return "—";
    const answered = calls.filter((c) => c.status !== "missed").length;
    return Math.round((answered / calls.length) * 100) + "%";
  }, [calls]);

  const byBroker = useMemo(() => {
    const m: Record<string, any> = {};
    calls.forEach((c) => {
      const k = c.user_id ?? `ext:${c.extension ?? c.metadata?.extension ?? "unknown"}`;
      if (!m[k]) m[k] = { name: brokers[k] ?? (c.extension ? `Ext. ${c.extension}` : "—"), total: 0, in: 0, out: 0, missed: 0, totalDur: 0, durCount: 0 };
      m[k].total++;
      if (c.status === "missed") m[k].missed++;
      else if (c.direction === "inbound") m[k].in++;
      else if (c.direction === "outbound") m[k].out++;
      if (c.duration_seconds) { m[k].totalDur += c.duration_seconds; m[k].durCount++; }
    });
    return Object.values(m).sort((a: any, b: any) => b.total - a.total);
  }, [calls, brokers]);

  const podium = (byBroker as any[]).slice(0, 3);
  const maxDayCount = useMemo(() => Math.max(1, ...byDay.map((d) => d.count)), [byDay]);
  const totalDirectionCalls = useMemo(() => byDirection.reduce((sum, d) => sum + d.value, 0), [byDirection]);
  const inboundPct = totalDirectionCalls ? (byDirection[0].value / totalDirectionCalls) * 100 : 0;
  const outboundPct = totalDirectionCalls ? (byDirection[1].value / totalDirectionCalls) * 100 : 0;

  // Financial — same source of truth as /admin/vue-ensemble (planipret_broker_stats view).
  const finance = useMemo<ServiceFinance[]>(() => [
    computeServiceFinance("mobile", brokerSnapshot.mobile || brokerStats.app_mobile_active),
    computeServiceFinance("widget", brokerSnapshot.total || brokerStats.total_courtiers),
    computeServiceFinance("ai", brokerSnapshot.ai || brokerStats.agent_ia_active),
  ], [brokerStats.app_mobile_active, brokerStats.total_courtiers, brokerStats.agent_ia_active, brokerSnapshot.mobile, brokerSnapshot.total, brokerSnapshot.ai]);
  const financeTotals = useMemo(() => computeTotals(finance), [finance]);


  const exportCsv = () => {
    const q = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const outboundSms = messages.filter((m) => m.direction === "outbound").length;
    const lines = [
      ["Rapport Planiprêt", selectedPeriodLabel].map(q).join(","),
      "",
      ["Appels par jour"].map(q).join(","),
      ["Date", "Appels"].map(q).join(","),
      ...byDay.map((d) => [d.date, d.count].map(q).join(",")),
      "",
      ["Répartition des appels"].map(q).join(","),
      ["Type", "Total"].map(q).join(","),
      ...byDirection.map((d) => [d.name, d.value].map(q).join(",")),
      "",
      ["SMS envoyés"].map(q).join(","),
      ["Période", "SMS envoyés"].map(q).join(","),
      [selectedPeriodLabel, outboundSms].map(q).join(","),
    ];
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `planipret-rapport-${range}-${new Date().toISOString().slice(0,10)}.csv`; a.click();
  };

  const exportPdf = async () => {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(reportRef.current, {
        backgroundColor: "#0B1437",
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const img = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW - 20;
      const imgH = (canvas.height * imgW) / canvas.width;
      const dateLabel = new Date().toLocaleDateString(dateLocale);
      pdf.setFillColor(11, 20, 55); pdf.rect(0, 0, pageW, pageH, "F");
      pdf.setTextColor(255, 255, 255); pdf.setFontSize(16);
      pdf.text("Planiprêt — Rapport admin", 10, 12);
      pdf.setFontSize(9); pdf.setTextColor(143, 168, 192);
      pdf.text(`${t("reports.periodBadge")} : ${selectedPeriodLabel} · ${dateLabel}`, 10, 18);
      let y = 24, remaining = imgH, srcY = 0;
      const ratio = canvas.width / imgW;
      while (remaining > 0) {
        const sliceH = Math.min(pageH - y - 8, remaining);
        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = sliceH * ratio;
        const ctx = sliceCanvas.getContext("2d")!;
        ctx.drawImage(canvas, 0, srcY, canvas.width, sliceCanvas.height, 0, 0, canvas.width, sliceCanvas.height);
        pdf.addImage(sliceCanvas.toDataURL("image/png"), "PNG", 10, y, imgW, sliceH);
        srcY += sliceCanvas.height;
        remaining -= sliceH;
        if (remaining > 0) { pdf.addPage(); pdf.setFillColor(11, 20, 55); pdf.rect(0, 0, pageW, pageH, "F"); y = 10; }
      }
      pdf.save(`planipret-rapport-${range}-${new Date().toISOString().slice(0,10)}.pdf`);
      toast.success(t("reports.pdfSuccess"));
    } catch (e: any) {
      toast.error(t("reports.pdfError") + (e?.message ?? "error"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <NsSyncBar features={["cdrs", "messages", "recordings"]} onReload={() => setRefreshTick((t) => t + 1)} />
      <div className="flex flex-wrap items-center justify-between gap-2">

        <div className="flex gap-2">
          {(["week", "month", "quarter"] as Range[]).map((r) => (
            <button key={r} onClick={() => setRange(r)}
              className="px-3 py-1.5 rounded-lg text-sm transition"
              style={range === r
                ? { background: ACCENT, color: "#fff", border: `1px solid ${ACCENT}` }
                : { background: "var(--pp-bg-elevated)", color: "var(--pp-text-secondary)", border: "1px solid var(--pp-bg-border-2)" }}>
              {r === "week" ? t("reports.rangeWeek") : r === "month" ? t("reports.rangeMonth") : t("reports.rangeQuarter")}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCsv} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
            style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}>
            <Download className="w-4 h-4" /> {t("reports.csv")}
          </button>
          <button onClick={exportPdf} disabled={exporting}
            className="pp-btn-primary flex items-center gap-2 text-sm disabled:opacity-50">
            <FileText className="w-4 h-4" /> {exporting ? t("reports.pdfGenerating") : t("reports.pdf")}
          </button>
        </div>
      </div>

      <div ref={reportRef} className="space-y-4">

      {/* ───────── SECTION A — État actuel (non filtré par période) ───────── */}
      <div className="pp-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="flex items-center gap-2" style={{ fontWeight: 600, color: "var(--pp-text-primary)" }}>
            <Users className="w-4 h-4" style={{ color: ACCENT }} /> {t("reports.sectionActivityTitle")}
          </h3>
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full"
            style={{ background: "rgba(46,155,220,0.12)", color: ACCENT, border: "1px solid rgba(46,155,220,0.25)" }}>
            {t("reports.snapshotBadge")}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatTile icon={<Users className="w-3.5 h-3.5" />} label={t("reports.tileBrokers")} value={brokerSnapshot.total || brokerStats.total_courtiers} color={ACCENT} />
          <StatTile icon={<Smartphone className="w-3.5 h-3.5" />} label={t("reports.tileMobileActive")} value={brokerSnapshot.mobile || brokerStats.app_mobile_active} color={SUCCESS} sub={`${t("reports.tileOutOf")} ${brokerSnapshot.total || brokerStats.total_courtiers}`} />
          <StatTile icon={<Bot className="w-3.5 h-3.5" />} label={t("reports.tileAiActive")} value={brokerSnapshot.ai || brokerStats.agent_ia_active} color="#9B7FE8" sub={`${t("reports.tileOutOf")} ${brokerSnapshot.total || brokerStats.total_courtiers}`} />
          <StatTile icon={<Plug className="w-3.5 h-3.5" />} label={t("reports.tileMaestro")} value={brokerSnapshot.maestro || brokerStats.maestro_connected} color="#F5A623" />
          <StatTile icon={<Mail className="w-3.5 h-3.5" />} label={t("reports.tileMs365")} value={brokerSnapshot.ms365 || brokerStats.ms365_connected} color="#2E9BDC" />
          <StatTile icon={<Link2 className="w-3.5 h-3.5" />} label={t("reports.tileNs")} value={brokerSnapshot.ns || brokerStats.ns_linked} color={GOLD} />
        </div>
      </div>

      {/* ───────── Sections B+ — Filtrées par période ───────── */}
      <div className="flex items-center gap-2 mt-2">
        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full"
          style={{ background: "rgba(245,200,66,0.12)", color: GOLD, border: "1px solid rgba(245,200,66,0.25)" }}>
          {t("reports.periodBadge")} · {selectedPeriodLabel}
        </span>
        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full"
          style={{ background: loadingPeriod ? "rgba(245,200,66,0.12)" : "rgba(0,212,170,0.12)", color: loadingPeriod ? GOLD : SUCCESS, border: `1px solid ${loadingPeriod ? "rgba(245,200,66,0.25)" : "rgba(0,212,170,0.25)"}` }}>
          {loadingPeriod ? t("reports.loading") : `${t("reports.loaded")}${loadedAt ? ` · ${loadedAt.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" })}` : ""}`}
        </span>
      </div>

      {/* Podium */}
      {podium.length > 0 && (
        <div className="pp-card p-5">
          <h3 className="flex items-center gap-2 mb-4" style={{ fontWeight: 600, color: "var(--pp-text-primary)" }}>
            <Trophy className="w-4 h-4" style={{ color: GOLD }} /> {t("reports.podiumTitle")}
          </h3>
          <div className="grid grid-cols-3 gap-3 items-end">
            {[1, 0, 2].map((idx) => {
              const b = podium[idx];
              if (!b) return <div key={idx} />;
              const colors = [GOLD, SILVER, BRONZE];
              const heights = [120, 90, 70];
              const labels = ["🥇", "🥈", "🥉"];
              const c = colors[idx]; const h = heights[idx];
              return (
                <div key={idx} className="text-center">
                  <div style={{ fontSize: 28, marginBottom: 4 }}>{labels[idx]}</div>
                  <div className="truncate mb-2" style={{ fontSize: 12, fontWeight: 600, color: "var(--pp-text-primary)" }}>{b.name}</div>
                  <div className="rounded-t-lg flex items-end justify-center pb-2" style={{ height: h, background: `linear-gradient(180deg, ${c}40, ${c}10)`, border: `1px solid ${c}66`, borderBottom: "none" }}>
                    <span style={{ fontSize: 20, fontWeight: 700, color: c }}>{b.total}</span>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--pp-text-muted)", marginTop: 4 }}>{b.in} {t("reports.dirInbound").toLowerCase()} · {b.out} {t("reports.dirOutbound").toLowerCase()}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="pp-card p-5">
          <h3 className="mb-3" style={{ fontWeight: 600, color: "var(--pp-text-primary)" }}>{t("reports.callsByDay")}</h3>
          <div className="h-[240px] flex items-end gap-2 overflow-x-auto px-1 pb-2" style={{ borderBottom: "1px solid var(--pp-bg-border-2)" }}>
            {byDay.length === 0 ? (
              <div className="w-full self-center text-center" style={{ fontSize: 12, color: "var(--pp-text-faint)" }}>{t("reports.empty")}</div>
            ) : byDay.map((d) => (
              <div key={d.date} className="flex-1 min-w-[28px] max-w-[56px] flex flex-col items-center justify-end gap-1">
                <div style={{ fontSize: 11, fontWeight: 700, color: ACCENT }}>{d.count}</div>
                <div className="w-full rounded-t" style={{ height: Math.max(8, Math.round((d.count / maxDayCount) * 170)), background: `linear-gradient(180deg, ${ACCENT}, rgba(46,155,220,0.28))` }} />
                <div className="truncate w-full text-center" style={{ fontSize: 10, color: "var(--pp-text-faint)" }}>{d.date}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="pp-card p-5">
          <h3 className="mb-3" style={{ fontWeight: 600, color: "var(--pp-text-primary)" }}>{t("reports.callsDistribution")}</h3>
          <div className="h-[240px] grid grid-cols-[160px_1fr] items-center gap-5">
            <div className="w-36 h-36 rounded-full mx-auto grid place-items-center" style={{ background: totalDirectionCalls ? `conic-gradient(${ACCENT} 0 ${inboundPct}%, ${SUCCESS} ${inboundPct}% ${inboundPct + outboundPct}%, ${DANGER} ${inboundPct + outboundPct}% 100%)` : "var(--pp-bg-deep)" }}>
              <div className="w-20 h-20 rounded-full grid place-items-center" style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)" }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: "var(--pp-text-primary)" }}>{totalDirectionCalls}</span>
              </div>
            </div>
            <div className="space-y-3">
              {byDirection.map((d) => {
                const pct = totalDirectionCalls ? Math.round((d.value / totalDirectionCalls) * 100) : 0;
                return (
                  <div key={d.name}>
                    <div className="flex items-center justify-between mb-1" style={{ fontSize: 11 }}>
                      <span className="flex items-center gap-2" style={{ color: "var(--pp-text-secondary)" }}><i className="w-2 h-2 rounded-full" style={{ background: d.color }} />{d.name}</span>
                      <span className="tabular-nums" style={{ color: d.color, fontWeight: 700 }}>{d.value} · {pct}%</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--pp-bg-deep)" }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: d.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat label={t("reports.avgDuration")} value={avgDuration} />
        <Stat label={t("reports.peakHour")} value={peakHour} />
        <Stat label={t("reports.answerRate")} value={answerRate} />
      </div>

      {/* ───────── SMS · AVA · Rappels ───────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniTile label={t("reports.smsSent")} value={messages.filter((m) => m.direction === "outbound").length} color={ACCENT} sub={t("reports.period")} />
        <MiniTile label={t("reports.smsReceived")} value={messages.filter((m) => m.direction === "inbound").length} color={SUCCESS} sub={t("reports.period")} />
        <MiniTile
          label={t("reports.avaSatisfaction")}
          value={(() => {
            const total = avaFeedback.length;
            if (!total) return "—";
            const up = avaFeedback.filter((f) => f.rating === "up").length;
            return `${Math.round((up / total) * 100)}%`;
          })()}
          sub={`${avaFeedback.length} ${t("reports.avaReviews")}`}
          color="#9B7FE8"
        />
        <MiniTile label={t("reports.pendingReminders")} value={reminders.filter((r) => r.status === "pending").length} sub={`${reminders.filter((r) => r.status === "pending" && r.scheduled_at < new Date().toISOString()).length} ${t("reports.inLate")}`} color={GOLD} />
      </div>



      <div className="pp-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 style={{ fontWeight: 600, color: "var(--pp-text-primary)" }}>{t("reports.brokerPerformance")}</h3>
          <button onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
            style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}>
            <Download className="w-3.5 h-3.5" /> {t("reports.exportCsv")}
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--pp-text-faint)", borderBottom: "1px solid var(--pp-bg-border-2)" }} className="text-left">
              <th className="py-2">{t("overview.thBroker")}</th><th>{t("reports.thCalls")}</th><th>{t("reports.thIn")}</th><th>{t("reports.thOut")}</th><th>{t("reports.thMissed")}</th><th>{t("reports.thAvgDur")}</th>
            </tr>
          </thead>
          <tbody>
            {(byBroker as any[]).length === 0 ? (
              <tr><td colSpan={6} className="py-6 text-center" style={{ color: "var(--pp-text-faint)" }}>{t("reports.empty")}</td></tr>
            ) : (byBroker as any[]).map((b: any) => (
              <tr key={b.name} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <td className="py-2" style={{ color: "var(--pp-text-primary)" }}>{b.name}</td>
                <td style={{ color: "var(--pp-text-secondary)" }}>{b.total}</td>
                <td style={{ color: ACCENT }}>{b.in}</td>
                <td style={{ color: SUCCESS }}>{b.out}</td>
                <td style={{ color: DANGER }}>{b.missed}</td>
                <td style={{ color: "var(--pp-text-muted)" }}>{b.durCount ? `${Math.round(b.totalDur / b.durCount)}s` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ───────── Financier — même source que Vue d'ensemble ───────── */}
      <div className="flex items-center gap-2 pt-2">
        <DollarSign className="w-4 h-4" style={{ color: SUCCESS }} />
        <h3 style={{ fontWeight: 700, fontSize: 15, color: "var(--pp-text-primary)" }}>{t("overview.financialTitle")}</h3>
        <span className="ml-2 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full"
          style={{ background: "rgba(0,212,170,0.12)", color: SUCCESS, border: "1px solid rgba(0,212,170,0.25)" }}>
          {t("reports.snapshotBadge")}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {finance.map((f) => <FinancialKpiCard key={f.service} data={f} />)}
      </div>
      <RevenueBreakdown rows={finance} />

      <div className="pp-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 style={{ fontWeight: 600, color: "var(--pp-text-primary)" }}>{t("overview.breakdownTitle")}</h3>
          <span style={{ fontSize: 10, color: "var(--pp-text-faint)" }}>{t("overview.totalUnits").replace("{n}", String(financeTotals.users))}</span>
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
                const svcLabel = f.service === "mobile" ? t("overview.svcMobile") : f.service === "widget" ? t("overview.svcWidget") : t("overview.svcAI");
                const color = f.service === "mobile" ? ACCENT : f.service === "widget" ? "#F5A623" : "#9B7FE8";
                return (
                  <tr key={f.service} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2">
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--pp-text-primary)" }}>{svcLabel}</span>
                      </div>
                    </td>
                    <td className="py-3 px-2 tabular-nums" style={{ fontSize: 13, fontWeight: 700, color: "var(--pp-text-primary)" }}>{f.users}</td>
                    <td className="py-3 px-2 tabular-nums" style={{ fontSize: 12, color: DANGER }}>{fmtMoney(unitCost)}</td>
                    <td className="py-3 px-2 tabular-nums" style={{ fontSize: 12, color: "var(--pp-text-muted)" }}>{fmtMoney(49.95)}</td>
                    <td className="py-3 px-2 tabular-nums" style={{ fontSize: 12, color: DANGER }}>{fmtMoney(f.cost)}</td>
                    <td className="py-3 px-2 tabular-nums" style={{ fontSize: 12, color: ACCENT }}>{fmtMoney(f.revenue)}</td>
                    <td className="py-3 px-2 tabular-nums" style={{ fontSize: 13, fontWeight: 700, color: SUCCESS }}>{fmtMoney(f.profit)}</td>
                    <td className="py-3 px-2 tabular-nums" style={{ fontSize: 12, color: "#9B7FE8" }}>{f.marginPct.toFixed(1)}%</td>
                  </tr>
                );
              })}
              <tr style={{ borderTop: "2px solid var(--pp-bg-border-2)", background: "rgba(46,155,220,0.04)" }}>
                <td className="py-3 px-2" style={{ fontSize: 12, fontWeight: 700, color: "var(--pp-text-primary)" }}>{t("overview.total")}</td>
                <td className="py-3 px-2 tabular-nums" style={{ fontSize: 13, fontWeight: 700, color: "var(--pp-text-primary)" }}>{financeTotals.users}</td>
                <td className="py-3 px-2" style={{ fontSize: 12, color: "var(--pp-text-faint)" }}>—</td>
                <td className="py-3 px-2" style={{ fontSize: 12, color: "var(--pp-text-faint)" }}>—</td>
                <td className="py-3 px-2 tabular-nums" style={{ fontSize: 13, fontWeight: 700, color: DANGER }}>{fmtMoney(financeTotals.cost)}</td>
                <td className="py-3 px-2 tabular-nums" style={{ fontSize: 13, fontWeight: 700, color: ACCENT }}>{fmtMoney(financeTotals.revenue)}</td>
                <td className="py-3 px-2 tabular-nums" style={{ fontSize: 14, fontWeight: 700, color: SUCCESS }}>{fmtMoney(financeTotals.profit)}</td>
                <td className="py-3 px-2 tabular-nums" style={{ fontSize: 12, fontWeight: 700, color: "#9B7FE8" }}>{financeTotals.marginPct.toFixed(1)}%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <div className="rounded-lg p-3" style={{ background: "var(--pp-bg-deep)", border: "1px solid var(--pp-bg-border-2)" }}>
            <p style={{ fontSize: 10, color: "var(--pp-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Revenu annuel projeté</p>
            <p className="tabular-nums" style={{ fontSize: 22, fontWeight: 700, color: ACCENT, marginTop: 4 }}>{fmtMoney(financeTotals.annualRevenue)}</p>
          </div>
          <div className="rounded-lg p-3" style={{ background: "var(--pp-bg-deep)", border: "1px solid var(--pp-bg-border-2)" }}>
            <p style={{ fontSize: 10, color: "var(--pp-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Profit annuel projeté</p>
            <p className="tabular-nums" style={{ fontSize: 22, fontWeight: 700, color: SUCCESS, marginTop: 4 }}>{fmtMoney(financeTotals.annualProfit)}</p>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}


function Stat({ label, value }: any) {
  return (
    <div className="pp-card p-5">
      <p style={{ fontSize: 11, color: "var(--pp-text-muted)" }}>{label}</p>
      <p style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: "var(--pp-text-primary)" }}>{value}</p>
    </div>
  );
}

function StatTile({ icon, label, value, sub, color }: { icon: any; label: string; value: number | string; sub?: string; color: string }) {
  return (
    <div className="rounded-lg p-3 flex flex-col gap-1"
      style={{ background: "var(--pp-bg-deep)", border: "1px solid var(--pp-bg-border-2)" }}>
      <div className="flex items-center gap-1.5" style={{ color }}>
        {icon}
        <span style={{ fontSize: 10, color: "var(--pp-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
      </div>
      <div className="tabular-nums" style={{ fontSize: 22, fontWeight: 700, color: "var(--pp-text-primary)", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--pp-text-faint)" }}>{sub}</div>}
    </div>
  );
}

function MiniTile({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color: string }) {
  return (
    <div className="pp-card p-4" style={{ position: "relative", overflow: "hidden" }}>
      <div aria-hidden style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${color}, transparent)` }} />
      <p style={{ fontSize: 10, color: "var(--pp-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
      <p className="tabular-nums" style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: "var(--pp-text-primary)" }}>{value}</p>
      {sub && <p style={{ fontSize: 10, color: "var(--pp-text-faint)", marginTop: 2 }}>{sub}</p>}
    </div>
  );
}


