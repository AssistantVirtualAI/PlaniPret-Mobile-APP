import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Sparkles, TrendingUp, ThumbsUp, ThumbsDown, Bot, Mail, Zap, CheckCircle2, XCircle, Inbox, Send, Calendar, AlertCircle, Video, ExternalLink, Activity, PlugZap } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

const ACCENT = "#2E9BDC";
const SUCCESS = "#00D4AA";
const DANGER = "#E84C4C";
const WARNING = "#F5A623";
const AGENT = "#9B7FE8";

type Row = {
  user_id: string;
  broker_name?: string;
  broker_email?: string | null;
  analyses_30d: number;
  urgent_30d: number;
  leads_30d: number;
  actions_ok_30d: number;
  actions_err_30d: number;
  actions_modified_30d: number;
  ms365_connected?: boolean;
  emails_received?: number;
  emails_sent?: number;
  meetings?: number;
};

type MicrosoftAnalytics = {
  connected_brokers: number;
  scanned_brokers: number;
  graph_mode?: "delegated" | "application" | "none";
  truncated?: boolean;
  totals: { emails_received: number; emails_sent: number; emails_unread: number; meetings: number; meeting_minutes: number };
  topSenders: Array<{ name: string; count: number }>;
  upcomingMeetings: Array<{ broker?: string; subject: string; start: string; attendees: number; is_online: boolean; join_url: string | null }>;
  brokerSummaries: Array<{ broker_user_id: string; broker_name: string; email: string | null; emails_received: number; emails_sent: number; meetings: number }>;
  graphErrors: Array<{ broker: string | null; error: string }>;
};

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

function KpiTile({ icon, label, value, color, sub }: { icon: any; label: string; value: string | number; color: string; sub?: string }) {
  return (
    <div className="pp-card relative overflow-hidden" style={{ padding: 16 }}>
      <div aria-hidden className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: `linear-gradient(90deg, ${color}, transparent)` }} />
      <div className="flex items-center justify-between">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${color}1A`, color, border: `1px solid ${color}33` }}>
          {icon}
        </div>
      </div>
      <div className="tabular-nums" style={{ fontSize: 26, fontWeight: 700, marginTop: 8, color: "var(--pp-text-primary)" }}>{value}</div>
      <p style={{ fontSize: 11, color: "var(--pp-text-secondary)", marginTop: 4 }}>{label}</p>
      {sub && <p style={{ fontSize: 10, color: "var(--pp-text-faint)", marginTop: 2 }}>{sub}</p>}
    </div>
  );
}

export default function PAAva() {
  const { t, lang } = useMplanipretLang();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [fbStats, setFbStats] = useState({ up: 0, down: 0, modified: 0, skipped: 0 });
  const [tuning, setTuning] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [dailySeries, setDailySeries] = useState<Array<{ day: string; analyses: number; leads: number; urgent: number; ms_emails_received?: number; ms_emails_sent?: number; ms_meetings?: number }>>([]);
  const [toolMix, setToolMix] = useState<Array<{ name: string; value: number; color: string }>>([]);
  const [recentActions, setRecentActions] = useState<any[]>([]);
  const [microsoft, setMicrosoft] = useState<MicrosoftAnalytics | null>(null);
  const [insights, setInsights] = useState<string[]>([]);
  const [dataHealth, setDataHealth] = useState<{ brokers_total: number; brokers_with_ms365_token: number; analyses_last_period: number; last_analysis_at: string | null; ms_graph_mode: "delegated" | "application" | "none"; scanned_brokers: number } | null>(null);
  const [analyzeReport, setAnalyzeReport] = useState<{ mode: string; analyzed_brokers: number; total_analyses: number; brokers_scanned: number; per_broker: Array<{broker: string; broker_name?: string; broker_user_id?: string; analyses: number; ok?: number; failed?: number; note?: string; steps?: Array<{step: string; ok: boolean; detail?: string}>}>; errors: Array<{broker?: string; broker_user_id?: string; step?: string; mid?: string; error: string}>; failed_broker_ids?: string[]; started_at?: string; finished_at?: string; at: string } | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; at: string } | null>(null);
  const [showAllErrors, setShowAllErrors] = useState(false);

  const load = async () => {
    setLoading(true);
    setApiError(null);
    const { data, error } = await supabase.functions.invoke("planipret-admin-ava-analytics", {
      body: { days: 30, includeGraph: true, insights: true },
    });
    if (error || !(data as any)?.ok) {
      setApiError(error?.message ?? (data as any)?.error ?? t("adminPortal.ava.errorAnalyticsUnavailable"));
      setRows([]);
      setDailySeries([]);
      setToolMix([]);
      setRecentActions([]);
      setMicrosoft(null);
      setInsights([]);
      setDataHealth(null);
      setLoading(false);
      return;
    }
    const payload = data as any;
    const list = (payload.rows ?? []) as Row[];
    const names: Record<string, string> = {};
    list.forEach((row) => { names[row.user_id] = row.broker_name || row.user_id.slice(0, 8); });
    setRows(list);
    setProfiles(names);
    setFbStats(payload.feedback ?? { up: 0, down: 0, modified: 0, skipped: 0 });
    setDailySeries(payload.dailySeries ?? []);
    setToolMix(payload.toolMix ?? []);
    setRecentActions(payload.recentActions ?? []);
    setMicrosoft(payload.microsoft ?? null);
    setInsights(payload.insights ?? []);
    setDataHealth(payload.dataHealth ?? null);
    if (payload.dataHealth?.last_analysis_at && !lastSyncAt) setLastSyncAt(payload.dataHealth.last_analysis_at);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("admin-ava")
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_ava_feedback" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_ava_email_analyses" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_ava_action_log" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const retune = async () => {
    setTuning(true);
    const { data, error } = await supabase.functions.invoke("ava-prompt-tuner", { body: {} });
    setTuning(false);
    if (error || !(data as any)?.success) { toast.error(t("adminPortal.ava.toastRetuneFailed")); return; }
    toast.success(t("adminPortal.ava.toastRetuneSuccess").replace("{count}", String((data as any).count)));
    load();
  };
  const analyzeAll = async (retryBrokerIds?: string[]) => {
    setAnalyzing(true);
    const tid = toast.loading(t("adminPortal.ava.analyzing") || "Analyse en cours…");
    try {
      const payload: any = { top: 20 };
      if (retryBrokerIds && retryBrokerIds.length) payload.broker_user_ids = retryBrokerIds;
      const { data, error } = await supabase.functions.invoke("ava-analyze-all", { body: payload });
      if (error) throw error;
      const d = data as any;
      if (!d?.ok) throw new Error(d?.error ?? "Échec");
      const finishedAt = d.finished_at ?? new Date().toISOString();
      setAnalyzeReport({
        mode: d.mode,
        analyzed_brokers: d.analyzed_brokers ?? 0,
        total_analyses: d.total_analyses ?? 0,
        brokers_scanned: d.brokers_scanned ?? 0,
        per_broker: d.per_broker ?? [],
        errors: d.errors ?? [],
        failed_broker_ids: d.failed_broker_ids ?? [],
        started_at: d.started_at,
        finished_at: finishedAt,
        at: finishedAt,
      });
      setLastSyncAt(finishedAt);
      toast.success(t("adminPortal.ava.toastAnalyzeSuccess").replace("{total}", String(d.total_analyses)).replace("{analyzed}", String(d.analyzed_brokers)).replace("{scanned}", String(d.brokers_scanned)).replace("{mode}", String(d.mode)), { id: tid });
      await load();
    } catch (e: any) {
      toast.error(t("adminPortal.ava.toastAnalyzeFailed").replace("{error}", String(e.message ?? e)), { id: tid });
      const now = new Date().toISOString();
      setAnalyzeReport({ mode: "error", analyzed_brokers: 0, total_analyses: 0, brokers_scanned: 0, per_broker: [], errors: [{ error: e.message ?? String(e) }], failed_broker_ids: [], at: now });
    } finally {
      setAnalyzing(false);
    }
  };

  const testM365 = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("ms365-connection-test", { body: {} });
      if (error) throw error;
      const d = data as any;
      const status = d?.summary?.status;
      const ok = d?.ok === true || d?.success === true || status === "core_connected" || status === "fully_connected" || d?.results?.auth?.success === true;
      const message = ok
        ? d?.results?.auth?.message ?? d?.summary?.status ?? (t("adminPortal.ava.testOk") || "OK")
        : d?.error ?? d?.results?.auth?.message ?? t("adminPortal.ava.testFailed");
      setTestResult({ ok, message, at: new Date().toISOString() });
      ok ? toast.success(t("adminPortal.ava.testOk")) : toast.error(d?.error ?? t("adminPortal.ava.testFailed"));
    } catch (e: any) {
      setTestResult({ ok: false, message: e.message ?? String(e), at: new Date().toISOString() });
      toast.error(`${t("adminPortal.ava.testFailed")}: ${e.message ?? e}`);
    } finally {
      setTesting(false);
    }
  };

  const totals = rows.reduce((acc, r) => ({
    analyses: acc.analyses + (r.analyses_30d ?? 0),
    urgent: acc.urgent + (r.urgent_30d ?? 0),
    leads: acc.leads + (r.leads_30d ?? 0),
    ok: acc.ok + (r.actions_ok_30d ?? 0),
    err: acc.err + (r.actions_err_30d ?? 0),
    modified: acc.modified + (r.actions_modified_30d ?? 0),
  }), { analyses: 0, urgent: 0, leads: 0, ok: 0, err: 0, modified: 0 });

  const approvalRate = totals.ok + totals.err > 0 ? Math.round((totals.ok / (totals.ok + totals.err)) * 100) : 0;
  const fbTotal = fbStats.up + fbStats.down + fbStats.modified + fbStats.skipped;
  const satisfaction = fbTotal > 0 ? Math.round(((fbStats.up) / fbTotal) * 100) : 0;

  const feedbackDonut = useMemo(() => [
    { name: t("adminPortal.ava.feedbackPositive"), value: fbStats.up, color: SUCCESS },
    { name: t("adminPortal.ava.feedbackNegative"), value: fbStats.down, color: DANGER },
    { name: t("adminPortal.ava.feedbackModifiedLbl"), value: fbStats.modified, color: WARNING },
    { name: t("adminPortal.ava.feedbackSkipped"), value: fbStats.skipped, color: "#6B7280" },
  ].filter((s) => s.value > 0), [fbStats]);

  const brokerLeaderboard = useMemo(() => {
    return [...rows]
      .sort((a, b) => ((b.analyses_30d ?? 0) + (b.emails_received ?? 0) + (b.meetings ?? 0)) - ((a.analyses_30d ?? 0) + (a.emails_received ?? 0) + (a.meetings ?? 0)))
      .slice(0, 10)
      .map((r) => ({
        name: r.broker_name || profiles[r.user_id] || r.user_id.slice(0, 8),
        analyses: r.analyses_30d ?? 0,
        leads: r.leads_30d ?? 0,
        ok: r.actions_ok_30d ?? 0,
        err: r.actions_err_30d ?? 0,
        emails: r.emails_received ?? 0,
        meetings: r.meetings ?? 0,
      }));
  }, [rows, profiles]);

  const healthTone = !dataHealth
    ? WARNING
    : dataHealth.brokers_with_ms365_token === 0 && dataHealth.ms_graph_mode !== "application"
      ? DANGER
      : dataHealth.analyses_last_period === 0
        ? WARNING
        : SUCCESS;
  const healthStatusLabel = !dataHealth
    ? t("adminPortal.ava.health.statusEmpty")
    : dataHealth.brokers_with_ms365_token === 0 && dataHealth.ms_graph_mode !== "application"
      ? t("adminPortal.ava.health.statusEmpty")
      : dataHealth.analyses_last_period === 0
        ? t("adminPortal.ava.health.statusPartial")
        : t("adminPortal.ava.health.statusOk");
  const modeLabel = dataHealth?.ms_graph_mode === "application"
    ? t("adminPortal.ava.health.modeApplication")
    : dataHealth?.ms_graph_mode === "delegated"
      ? t("adminPortal.ava.health.modeDelegated")
      : t("adminPortal.ava.health.modeNone");
  const showGuidedEmpty = !loading && totals.analyses === 0 && (microsoft?.connected_brokers ?? 0) === 0 && (dataHealth?.ms_graph_mode ?? "none") === "none";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 style={{ fontFamily: "Inter,sans-serif", fontWeight: 700, fontSize: 22, color: "var(--pp-text-primary)" }}>{t("adminPortal.ava.title")}</h1>
          <p style={{ fontSize: 12, color: "var(--pp-text-faint)" }} className="mt-0.5">
            {t("adminPortal.ava.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span style={{ fontSize: 10, color: "var(--pp-text-faint)" }}>
            {t("adminPortal.ava.lastSync")}: {lastSyncAt ? new Date(lastSyncAt).toLocaleString(lang === "en" ? "en-CA" : "fr-CA") : t("adminPortal.ava.neverSynced")}
          </span>
          <Button onClick={testM365} disabled={testing} variant="outline" size="sm">
            {testing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <PlugZap className="w-3.5 h-3.5 mr-1.5" />}
            {testing ? t("adminPortal.ava.testingConnection") : t("adminPortal.ava.testConnection")}
          </Button>
          <Button onClick={() => analyzeAll()} disabled={analyzing} variant="default" size="sm">
            {analyzing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
            {t("adminPortal.ava.analyzeNow")}
          </Button>
          <Button onClick={retune} disabled={tuning} variant="outline" size="sm">
            {tuning ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
            {t("adminPortal.ava.retune")}
          </Button>
        </div>
      </div>

      {testResult && (
        <div className="pp-card flex items-start gap-3" style={{ padding: 12, borderColor: `${testResult.ok ? SUCCESS : DANGER}55` }}>
          {testResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: SUCCESS }} /> : <XCircle className="w-4 h-4 shrink-0" style={{ color: DANGER }} />}
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--pp-text-primary)" }}>
              {testResult.ok ? t("adminPortal.ava.testOk") : t("adminPortal.ava.testFailed")}
            </div>
            <div style={{ fontSize: 11, color: "var(--pp-text-secondary)" }}>{testResult.message}</div>
          </div>
          <span style={{ fontSize: 10, color: "var(--pp-text-faint)" }}>{new Date(testResult.at).toLocaleTimeString(lang === "en" ? "en-CA" : "fr-CA")}</span>
        </div>
      )}

      {apiError && (
        <div className="pp-card flex items-start gap-3" style={{ padding: 14, borderColor: `${DANGER}55` }}>
          <AlertCircle className="w-5 h-5 shrink-0" style={{ color: DANGER }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--pp-text-primary)" }}>{t("adminPortal.ava.errorTitle")}</div>
            <div style={{ fontSize: 12, color: "var(--pp-text-secondary)" }}>{apiError}</div>
          </div>
        </div>
      )}

      {/* Data health banner */}
      {dataHealth && (
        <div className="pp-card flex items-center gap-3 flex-wrap" style={{ padding: 14, borderColor: `${healthTone}55` }}>
          <span style={{ width: 10, height: 10, borderRadius: 999, background: healthTone, boxShadow: `0 0 0 4px ${healthTone}22` }} />
          <Activity className="w-4 h-4 shrink-0" style={{ color: healthTone }} />
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--pp-text-primary)" }}>{t("adminPortal.ava.health.title")} — <span style={{ color: healthTone }}>{healthStatusLabel}</span></div>
            <div style={{ fontSize: 11, color: "var(--pp-text-secondary)" }}>
              {t("adminPortal.ava.health.brokersConnected").replace("{connected}", String(dataHealth.brokers_with_ms365_token)).replace("{total}", String(dataHealth.brokers_total))}
              {" · "}
              {t("adminPortal.ava.health.analysesCount").replace("{n}", String(dataHealth.analyses_last_period)).replace("{days}", "30")}
              {" · "}
              {modeLabel}
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate("/planipret/ms365-diagnostics")}>
            <PlugZap className="w-3.5 h-3.5 mr-1.5" />
            {t("adminPortal.ava.empty.openDiagnostic")}
          </Button>
        </div>
      )}

      {/* Analyze progress/report */}
      {(analyzing || analyzeReport) && (
        <div className="pp-card" style={{ padding: 14, borderColor: analyzing ? `${ACCENT}55` : (analyzeReport?.mode === "error" ? `${DANGER}55` : `${SUCCESS}55`) }}>
          <div className="flex items-center gap-2 mb-2">
            {analyzing ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: ACCENT }} /> : <CheckCircle2 className="w-4 h-4" style={{ color: analyzeReport?.mode === "error" ? DANGER : SUCCESS }} />}
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--pp-text-primary)" }}>
              {analyzing ? (t("adminPortal.ava.analyzing")) : (t("adminPortal.ava.analyzeReportTitle"))}
            </div>
            {analyzeReport && !analyzing && (
              <span style={{ fontSize: 10, color: "var(--pp-text-faint)", marginLeft: "auto" }}>
                {new Date(analyzeReport.at).toLocaleString(lang === "en" ? "en-CA" : "fr-CA")}
              </span>
            )}
          </div>
          {analyzeReport && (
            <>
              <div className="flex flex-wrap items-center gap-3" style={{ fontSize: 11, color: "var(--pp-text-secondary)" }}>
                <span><strong style={{ color: "var(--pp-text-primary)" }}>{analyzeReport.total_analyses}</strong> {t("adminPortal.ava.kpi.analyses")}</span>
                <span><strong style={{ color: "var(--pp-text-primary)" }}>{analyzeReport.analyzed_brokers}/{analyzeReport.brokers_scanned}</strong> {t("adminPortal.ava.kpi.activeBrokers")}</span>
                <span>mode: <strong style={{ color: "var(--pp-text-primary)" }}>{analyzeReport.mode}</strong></span>
                {analyzeReport.errors.length > 0 && <span style={{ color: DANGER }}>{analyzeReport.errors.length} error(s)</span>}
                {(analyzeReport.failed_broker_ids?.length ?? 0) > 0 && !analyzing && (
                  <Button size="sm" variant="outline" className="ml-auto" onClick={() => analyzeAll(analyzeReport.failed_broker_ids)}>
                    <Loader2 className={`w-3.5 h-3.5 mr-1.5 ${analyzing ? "animate-spin" : "hidden"}`} />
                    {t("adminPortal.ava.retryFailed")} ({analyzeReport.failed_broker_ids!.length})
                  </Button>
                )}
              </div>

              {analyzeReport.per_broker.length > 0 && (
                <div className="mt-3 overflow-auto" style={{ maxHeight: 260 }}>
                  <table className="w-full" style={{ fontSize: 11 }}>
                    <thead style={{ position: "sticky", top: 0, background: "var(--pp-bg-surface)", zIndex: 1 }}>
                      <tr style={{ color: "var(--pp-text-faint)", textAlign: "left" }}>
                        <th className="py-1 pr-2">{t("adminPortal.ava.stepColBroker")}</th>
                        <th className="py-1 pr-2">{t("adminPortal.ava.stepColStep")}</th>
                        <th className="py-1 pr-2">{t("adminPortal.ava.stepColStatus")}</th>
                        <th className="py-1 pr-2">{t("adminPortal.ava.stepColDetail")}</th>
                        <th className="py-1 pr-2 tabular-nums text-right">{t("adminPortal.ava.kpi.analyses")}</th>
                        <th className="py-1"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyzeReport.per_broker.map((p, i) => {
                        const steps = p.steps ?? [];
                        const rows = steps.length ? steps : [{ step: "no_data", ok: (p.analyses ?? 0) > 0, detail: p.note ?? "" }];
                        return rows.map((s, si) => (
                          <tr key={`${i}-${si}`} style={{ borderTop: si === 0 ? "1px solid var(--pp-bg-border-2)" : "none" }}>
                            <td className="py-1 pr-2 truncate" style={{ maxWidth: 180, color: "var(--pp-text-secondary)" }}>{si === 0 ? (p.broker_name || p.broker) : ""}</td>
                            <td className="py-1 pr-2" style={{ color: "var(--pp-text-muted)" }}>{s.step}</td>
                            <td className="py-1 pr-2">
                              <span style={{ color: s.ok ? SUCCESS : DANGER, fontWeight: 700 }}>
                                {s.ok ? t("adminPortal.ava.stepOk") : t("adminPortal.ava.stepErr")}
                              </span>
                            </td>
                            <td className="py-1 pr-2 truncate" style={{ maxWidth: 320, color: "var(--pp-text-faint)" }}>{s.detail ?? ""}</td>
                            <td className="py-1 pr-2 tabular-nums text-right" style={{ color: (p.analyses ?? 0) > 0 ? SUCCESS : "var(--pp-text-faint)", fontWeight: 700 }}>{si === 0 ? p.analyses : ""}</td>
                            <td className="py-1 text-right">
                              {si === 0 && ((p.failed ?? 0) > 0 || (p.analyses === 0 && (p.note && p.note !== "empty inbox"))) && p.broker_user_id && !analyzing && (
                                <button
                                  onClick={() => analyzeAll([p.broker_user_id!])}
                                  className="px-2 py-0.5 rounded"
                                  style={{ fontSize: 10, background: `${ACCENT}1A`, color: ACCENT, border: `1px solid ${ACCENT}33` }}
                                >
                                  {t("common.retry") || "Retry"}
                                </button>
                              )}
                            </td>
                          </tr>
                        ));
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {analyzeReport.errors.length > 0 && (
                <div className="mt-2">
                  <button
                    onClick={() => setShowAllErrors((v) => !v)}
                    style={{ fontSize: 10, color: DANGER, cursor: "pointer", background: "none", border: "none" }}
                  >
                    {showAllErrors ? "▼" : "▶"} {analyzeReport.errors.length} error(s) — {t("adminPortal.ava.showAllErrors")}
                  </button>
                  {showAllErrors && (
                    <div className="mt-1 space-y-0.5 max-h-40 overflow-auto">
                      {analyzeReport.errors.map((e, i) => (
                        <div key={i} style={{ fontSize: 10, color: "var(--pp-text-faint)" }}>
                          {e.broker ? `${e.broker} — ` : ""}{e.step ? `[${e.step}] ` : ""}{e.error}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}


      {/* Guided empty state */}
      {showGuidedEmpty && (
        <div className="pp-card text-center" style={{ padding: 28, borderStyle: "dashed" }}>
          <Sparkles className="w-8 h-8 mx-auto mb-3" style={{ color: AGENT }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--pp-text-primary)" }}>{t("adminPortal.ava.empty.title")}</div>
          <p className="max-w-xl mx-auto" style={{ fontSize: 12, color: "var(--pp-text-secondary)", marginTop: 8 }}>
            {t("adminPortal.ava.empty.body")}
          </p>
          <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
            <Button onClick={() => analyzeAll()} disabled={analyzing} size="sm">
              {analyzing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
              {t("adminPortal.ava.analyzeNow")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/planipret/ms365-diagnostics")}>
              <PlugZap className="w-3.5 h-3.5 mr-1.5" />
              {t("adminPortal.ava.empty.openDiagnostic")}
            </Button>
          </div>
        </div>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KpiTile icon={<Mail className="w-4 h-4" />} label={t("adminPortal.ava.kpi.analyses")} value={totals.analyses} color={ACCENT} />
        <KpiTile icon={<TrendingUp className="w-4 h-4" />} label={t("adminPortal.ava.kpi.leadsDetected")} value={totals.leads} color={SUCCESS} />
        <KpiTile icon={<Zap className="w-4 h-4" />} label={t("adminPortal.ava.kpi.urgent")} value={totals.urgent} color={WARNING} />
        <KpiTile icon={<CheckCircle2 className="w-4 h-4" />} label={t("adminPortal.ava.kpi.actionsExecuted")} value={totals.ok} color={SUCCESS} sub={`${approvalRate}% ${t("adminPortal.ava.kpi.successRate")}`} />
        <KpiTile icon={<XCircle className="w-4 h-4" />} label={t("adminPortal.ava.kpi.errors")} value={totals.err} color={DANGER} />
        <KpiTile icon={<Bot className="w-4 h-4" />} label={t("adminPortal.ava.kpi.activeBrokers")} value={rows.length} color={AGENT} />
        <KpiTile icon={<ThumbsUp className="w-4 h-4" />} label={t("adminPortal.ava.kpi.feedbackUp")} value={fbStats.up} color={SUCCESS} />
        <KpiTile icon={<ThumbsDown className="w-4 h-4" />} label={t("adminPortal.ava.kpi.feedbackDown")} value={fbStats.down} color={DANGER} />
        <KpiTile icon={<Sparkles className="w-4 h-4" />} label={t("adminPortal.ava.kpi.satisfaction")} value={`${satisfaction}%`} color={AGENT} sub={`${fbTotal} ${t("adminPortal.ava.kpi.reviews")}`} />
        <KpiTile icon={<Sparkles className="w-4 h-4" />} label={t("adminPortal.ava.kpi.modified")} value={totals.modified} color={WARNING} />
        <KpiTile icon={<Inbox className="w-4 h-4" />} label={t("adminPortal.ava.kpi.emailsReceivedMs")} value={microsoft?.totals.emails_received ?? 0} color={ACCENT} sub={`${microsoft?.totals.emails_unread ?? 0} ${t("adminPortal.ava.kpi.unread")}`} />
        <KpiTile icon={<Send className="w-4 h-4" />} label={t("adminPortal.ava.kpi.emailsSentMs")} value={microsoft?.totals.emails_sent ?? 0} color={SUCCESS} />
        <KpiTile icon={<Calendar className="w-4 h-4" />} label={t("adminPortal.ava.kpi.meetingsMs")} value={microsoft?.totals.meetings ?? 0} color={AGENT} sub={`${Math.round((microsoft?.totals.meeting_minutes ?? 0) / 60)}${t("adminPortal.ava.kpi.hoursTotal")}`} />
        <KpiTile icon={<CheckCircle2 className="w-4 h-4" />} label={t("adminPortal.ava.kpi.brokersScanned")} value={`${microsoft?.scanned_brokers ?? microsoft?.connected_brokers ?? 0}/${rows.length}`} color={(microsoft?.scanned_brokers ?? microsoft?.connected_brokers ?? 0) ? SUCCESS : WARNING} sub={microsoft?.graph_mode === "application" ? t("adminPortal.ava.kpi.modeApp") : t("adminPortal.ava.kpi.modeToken")} />
      </div>

      {/* Microsoft 365 + AVA insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="pp-card lg:col-span-2" style={{ padding: 20 }}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 style={{ fontWeight: 600, fontSize: 14, color: "var(--pp-text-primary)" }}>{t("adminPortal.ava.sections.msTitle")}</h3>
            {microsoft?.truncated && <span style={{ fontSize: 10, color: WARNING }}>{t("adminPortal.ava.sections.truncatedTop").replace("{n}", String(microsoft.scanned_brokers))}</span>}
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={dailySeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#4A7FA5" }} />
              <YAxis tick={{ fontSize: 10, fill: "#4A7FA5" }} />
              <Tooltip content={<TooltipDark />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="ms_emails_received" name={t("adminPortal.ava.sections.legendReceived")} fill={ACCENT} radius={[4, 4, 0, 0]} />
              <Bar dataKey="ms_emails_sent" name={t("adminPortal.ava.sections.legendSent")} fill={SUCCESS} radius={[4, 4, 0, 0]} />
              <Bar dataKey="ms_meetings" name={t("adminPortal.ava.sections.legendMeetings")} fill={AGENT} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="pp-card" style={{ padding: 20 }}>
          <h3 style={{ fontWeight: 600, fontSize: 14, color: "var(--pp-text-primary)", marginBottom: 12 }}>{t("adminPortal.ava.sections.insights")}</h3>
          {insights.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--pp-text-faint)", padding: "50px 0", textAlign: "center" }}>{t("adminPortal.ava.sections.loadingInsights")}</p>
          ) : (
            <ul className="space-y-2">
              {insights.map((item, i) => (
                <li key={i} className="flex gap-2" style={{ fontSize: 12, color: "var(--pp-text-secondary)" }}>
                  <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: AGENT }} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {microsoft && ((microsoft.upcomingMeetings?.length ?? 0) > 0 || (microsoft.topSenders?.length ?? 0) > 0 || (microsoft.graphErrors?.length ?? 0) > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="pp-card lg:col-span-2" style={{ padding: 20 }}>
            <h3 style={{ fontWeight: 600, fontSize: 14, color: "var(--pp-text-primary)", marginBottom: 12 }}>{t("adminPortal.ava.sections.upcomingMeetings")}</h3>
            {microsoft.upcomingMeetings.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--pp-text-faint)" }}>{t("adminPortal.ava.sections.noMeetings")}</p>
            ) : (
              <div className="space-y-2">
                {microsoft.upcomingMeetings.slice(0, 8).map((meeting, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}>
                    <Calendar className="w-4 h-4 shrink-0" style={{ color: AGENT }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate" style={{ fontSize: 12, fontWeight: 600, color: "var(--pp-text-primary)" }}>{meeting.subject || t("adminPortal.ava.sections.meeting")}</div>
                      <div style={{ fontSize: 10, color: "var(--pp-text-muted)" }}>{meeting.broker} · {meeting.start ? new Date(meeting.start).toLocaleString(lang === "en" ? "en-CA" : "fr-CA", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""} · {meeting.attendees} {t("adminPortal.ava.sections.participants")}</div>
                    </div>
                    {meeting.is_online && meeting.join_url && (
                      <a href={meeting.join_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-md" style={{ fontSize: 10, fontWeight: 700, color: AGENT, background: `${AGENT}1A` }}>
                        <Video className="w-3 h-3" /> {t("adminPortal.ava.sections.join")} <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="pp-card" style={{ padding: 20 }}>
            <h3 style={{ fontWeight: 600, fontSize: 14, color: "var(--pp-text-primary)", marginBottom: 12 }}>{t("adminPortal.ava.sections.topSenders")}</h3>
            {microsoft.topSenders.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--pp-text-faint)" }}>{t("adminPortal.ava.sections.noSenders")}</p>
            ) : (
              <div className="space-y-2">
                {microsoft.topSenders.map((sender) => (
                  <div key={sender.name} className="flex items-center justify-between gap-2">
                    <span className="truncate" style={{ fontSize: 11, color: "var(--pp-text-secondary)" }}>{sender.name}</span>
                    <span className="tabular-nums" style={{ fontSize: 11, fontWeight: 700, color: ACCENT }}>{sender.count}</span>
                  </div>
                ))}
              </div>
            )}
            {microsoft.graphErrors.length > 0 && (
              <div className="mt-4 pt-3" style={{ borderTop: "1px solid var(--pp-bg-border-2)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: WARNING, marginBottom: 6 }}>{t("adminPortal.ava.sections.limitedConnections")}</div>
                <div style={{ fontSize: 10, color: "var(--pp-text-faint)" }}>{t("adminPortal.ava.sections.reconnectHint").replace("{n}", String(microsoft.graphErrors.length))}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="pp-card lg:col-span-2" style={{ padding: 20 }}>
          <h3 style={{ fontWeight: 600, fontSize: 14, color: "var(--pp-text-primary)", marginBottom: 12 }}>{t("adminPortal.ava.sections.dailyAnalyses")}</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={dailySeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#4A7FA5" }} />
              <YAxis tick={{ fontSize: 10, fill: "#4A7FA5" }} />
              <Tooltip content={<TooltipDark />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="analyses" name={t("adminPortal.ava.sections.legendAnalyses")} stroke={ACCENT} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="leads" name={t("adminPortal.ava.sections.legendLeads")} stroke={SUCCESS} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="urgent" name={t("adminPortal.ava.sections.legendUrgent")} stroke={WARNING} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="pp-card" style={{ padding: 20 }}>
          <h3 style={{ fontWeight: 600, fontSize: 14, color: "var(--pp-text-primary)", marginBottom: 12 }}>{t("adminPortal.ava.sections.satisfaction")}</h3>
          {feedbackDonut.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--pp-text-faint)", padding: "60px 0", textAlign: "center" }}>{t("adminPortal.ava.sections.noFeedback")}</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={feedbackDonut} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={4}>
                  {feedbackDonut.map((e, i) => <Cell key={i} fill={e.color} stroke="var(--pp-bg-surface)" strokeWidth={2} />)}
                </Pie>
                <Tooltip content={<TooltipDark />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Broker leaderboard + tool mix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="pp-card lg:col-span-2" style={{ padding: 20 }}>
          <h3 style={{ fontWeight: 600, fontSize: 14, color: "var(--pp-text-primary)", marginBottom: 12 }}>{t("adminPortal.ava.sections.topBrokers")}</h3>
          {brokerLeaderboard.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--pp-text-faint)", padding: "40px 0", textAlign: "center" }}>{t("adminPortal.ava.sections.noBrokers")}</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={brokerLeaderboard} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#4A7FA5" }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#8FA8C0" }} width={140} />
                <Tooltip content={<TooltipDark />} cursor={{ fill: "rgba(46,155,220,0.06)" }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="analyses" name={t("adminPortal.ava.sections.legendAnalyses")} fill={ACCENT} radius={[0, 4, 4, 0]} />
                <Bar dataKey="emails" name={t("adminPortal.ava.sections.legendEmails")} fill={AGENT} radius={[0, 4, 4, 0]} />
                <Bar dataKey="meetings" name={t("adminPortal.ava.sections.legendMeetings")} fill={WARNING} radius={[0, 4, 4, 0]} />
                <Bar dataKey="ok" name={t("adminPortal.ava.sections.legendOk")} fill={SUCCESS} radius={[0, 4, 4, 0]} />
                <Bar dataKey="err" name={t("adminPortal.ava.sections.legendErrors")} fill={DANGER} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="pp-card" style={{ padding: 20 }}>
          <h3 style={{ fontWeight: 600, fontSize: 14, color: "var(--pp-text-primary)", marginBottom: 12 }}>{t("adminPortal.ava.sections.toolMix")}</h3>
          {toolMix.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--pp-text-faint)", padding: "60px 0", textAlign: "center" }}>{t("adminPortal.ava.sections.noTools")}</p>
          ) : (
            <div className="space-y-2">
              {toolMix.map((t) => {
                const max = Math.max(...toolMix.map((x) => x.value));
                const pct = Math.round((t.value / max) * 100);
                return (
                  <div key={t.name}>
                    <div className="flex items-center justify-between mb-1">
                      <span style={{ fontSize: 11, color: "var(--pp-text-secondary)" }} className="truncate">{t.name}</span>
                      <span className="tabular-nums" style={{ fontSize: 11, fontWeight: 600, color: t.color }}>{t.value}</span>
                    </div>
                    <div style={{ height: 6, background: "var(--pp-bg-elevated)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: t.color, transition: "width .3s" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent actions */}
      <div className="pp-card" style={{ padding: 20 }}>
        <h3 style={{ fontWeight: 600, fontSize: 14, color: "var(--pp-text-primary)", marginBottom: 12 }}>{t("adminPortal.ava.sections.recentActions")}</h3>
        {loading ? (
          <p style={{ fontSize: 12, color: "var(--pp-text-faint)" }}>{t("adminPortal.ava.sections.loading")}</p>
        ) : recentActions.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--pp-text-faint)" }}>{t("adminPortal.ava.sections.noActions")}</p>
        ) : (
          <div className="space-y-1">
            {recentActions.map((a) => {
              const ok = a.success === true || a.status === "ok" || a.status === "success" || a.status === "executed";
              const color = ok ? SUCCESS : a.status === "error" ? DANGER : WARNING;
              return (
                <div key={a.id} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--pp-text-primary)" }} className="truncate flex-1">
                    {a.action_type ?? a.action ?? "action"}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--pp-text-muted)" }}>{a.broker_name || profiles[a.broker_user_id] || profiles[a.user_id] || a.broker_user_id?.slice(0, 8) || a.user_id?.slice(0, 8)}</span>
                  <span style={{ fontSize: 10, color: "var(--pp-text-faint)" }} className="tabular-nums">
                    {(a.executed_at || a.created_at) ? new Date(a.executed_at || a.created_at).toLocaleTimeString(lang === "en" ? "en-CA" : "fr-CA", { hour: "2-digit", minute: "2-digit" }) : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
