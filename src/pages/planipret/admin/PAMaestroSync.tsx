import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, CheckCircle2, XCircle, AlertTriangle, Activity, Server, Radio, Cable } from "lucide-react";
import PAMaestroStatus from "./PAMaestroStatus";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

const ACCENT = "#2E9BDC";
const SUCCESS = "#00D4AA";
const DANGER = "#E84C4C";
const WARNING = "#F5A623";
const AGENT = "#9B7FE8";

const DICT = {
  fr: {
    pageTitle: "Synchronisation Maestro Télécom",
    pageSubtitle: "Vue globale des appels & SMS mirrorés depuis NS-API vers Maestro.",
    failuresOnly: "Échecs seulement",
    resyncAnalyses: "Resync analyses (72h)",
    mirrorEverything: "Mirror everything",
    refresh: "Actualiser",
    genericError: "erreur",
    mirrorAllConfirm: "Mirror TOUS les appels avec résumé/analyse IA vers Maestro (depuis le début) ?",
    mirrorGlobalResult: (n: number) => `Miroir global : ${n} appel(s) planifié(s).`,
    mirrorAllError: (msg: string) => `Erreur mirror-all : ${msg}`,
    resyncScheduled: (n: number) => `Resync planifié : ${n} analyse(s)`,
    resyncError: (msg: string) => `Erreur resync : ${msg}`,
    configuration: "Configuration",
    active: "Active",
    missing: "Manquante",
    authPing: "Auth & Ping API",
    ok: "OK",
    errorLabel: "Erreur",
    total24h: "24h · Total transféré",
    failuresCount: (n: number) => `${n} échec(s) ·`,
    successRate: (n: number) => `${n}% réussis`,
    lastMirror: "Dernier miroir",
    call: "Appel",
    sms: "SMS",
    aiAnalysis: "Analyse IA",
    liveAnalytics: "Analytics live · miroir vers Maestro",
    liveAnalyticsHint: "Cliquer sur une carte pour filtrer le journal détaillé ci-dessous. Rafraîchi toutes les 10 s.",
    logWindow: (a: string, b: string) => `Fenêtre journal : ${a} → ${b}`,
    eligible: "Éligibles",
    eligibleSub: "résumé ou analyse",
    withMaestroId: "Avec maestro_call_id",
    withMaestroIdSub: "prêts à mirrorer",
    transferredOk: "Transférés OK",
    transferredOkSub: "voir dans le journal →",
    transferredOkFilterLabel: "Transférés (call.analysis.summary OK)",
    skipped: "Skipped",
    skippedSub: "sans broker / maestro_id →",
    skippedFilterLabel: "Skipped (call.analysis.skipped.*)",
    errors: "Erreurs",
    errorsSub: "échecs de transfert →",
    errorsFilterLabel: "Erreurs (call.analysis.summary ✕)",
    toPush: "À pousser",
    toPushSub: "éligibles − OK",
    byActionTitle: "Répartition par action",
    byActionSubtitle: "Fenêtre glissante · 72 heures",
    noRecentActivity: "Aucune activité récente.",
    detailedLog: "Journal détaillé",
    entriesCount: (n: number) => `${n} entrée(s) · cliquer pour voir requête/réponse`,
    filterLabel: (l: string) => `Filtre : ${l}`,
    reset: "Réinitialiser",
    when: "Quand",
    action: "Action",
    endpoint: "Endpoint",
    http: "HTTP",
    ms: "ms",
    status: "Statut",
    request: "Requête",
    response: "Réponse",
    fail: "ÉCHEC",
    noEntries: "Aucune entrée dans le journal.",
  },
  en: {
    pageTitle: "Maestro Telecom Sync",
    pageSubtitle: "Global view of calls & SMS mirrored from NS-API to Maestro.",
    failuresOnly: "Failures only",
    resyncAnalyses: "Resync analyses (72h)",
    mirrorEverything: "Mirror everything",
    refresh: "Refresh",
    genericError: "error",
    mirrorAllConfirm: "Mirror ALL calls with AI summary/analysis to Maestro (from the beginning)?",
    mirrorGlobalResult: (n: number) => `Global mirror: ${n} call(s) scheduled.`,
    mirrorAllError: (msg: string) => `Mirror-all error: ${msg}`,
    resyncScheduled: (n: number) => `Resync scheduled: ${n} analysis(es)`,
    resyncError: (msg: string) => `Resync error: ${msg}`,
    configuration: "Configuration",
    active: "Active",
    missing: "Missing",
    authPing: "Auth & API Ping",
    ok: "OK",
    errorLabel: "Error",
    total24h: "24h · Total transferred",
    failuresCount: (n: number) => `${n} failure(s) ·`,
    successRate: (n: number) => `${n}% successful`,
    lastMirror: "Last mirror",
    call: "Call",
    sms: "SMS",
    aiAnalysis: "AI Analysis",
    liveAnalytics: "Live analytics · mirror to Maestro",
    liveAnalyticsHint: "Click a card to filter the detailed log below. Refreshed every 10s.",
    logWindow: (a: string, b: string) => `Log window: ${a} → ${b}`,
    eligible: "Eligible",
    eligibleSub: "summary or analysis",
    withMaestroId: "With maestro_call_id",
    withMaestroIdSub: "ready to mirror",
    transferredOk: "Transferred OK",
    transferredOkSub: "see log →",
    transferredOkFilterLabel: "Transferred (call.analysis.summary OK)",
    skipped: "Skipped",
    skippedSub: "no broker / maestro_id →",
    skippedFilterLabel: "Skipped (call.analysis.skipped.*)",
    errors: "Errors",
    errorsSub: "transfer failures →",
    errorsFilterLabel: "Errors (call.analysis.summary ✕)",
    toPush: "To push",
    toPushSub: "eligible − OK",
    byActionTitle: "Breakdown by action",
    byActionSubtitle: "Sliding window · 72 hours",
    noRecentActivity: "No recent activity.",
    detailedLog: "Detailed log",
    entriesCount: (n: number) => `${n} entry(ies) · click to see request/response`,
    filterLabel: (l: string) => `Filter: ${l}`,
    reset: "Reset",
    when: "When",
    action: "Action",
    endpoint: "Endpoint",
    http: "HTTP",
    ms: "ms",
    status: "Status",
    request: "Request",
    response: "Response",
    fail: "FAILED",
    noEntries: "No entries in the log.",
  },
};

type Status = {
  ok: boolean;
  configured: boolean;
  base_url: string;
  ping: { configured: boolean; base_url: string; ok: boolean; status: number; ms?: number; error?: string };
  stats24h: { total: number; failed: number; success_rate: number | null };
  last_call_mirror: any;
  last_sms_mirror: any;
  last_analysis_mirror?: any;
};

type MirrorStatus = {
  eligible: number;
  with_maestro_call_id: number;
  mirrored_ok: number;
  mirrored_failed: number;
  skipped_total: number;
  errors_total: number;
  pending: number;
  window_first_log: string | null;
  window_last_log: string | null;
};

type LogRow = {
  id: string;
  created_at: string;
  user_id: string | null;
  action: string | null;
  maestro_endpoint: string | null;
  response_status: number | null;
  duration_ms: number | null;
  success: boolean | null;
  request_body: any;
  response_body: any;
};

function Pill({ ok, label }: { ok: boolean; label: string }) {
  const color = ok ? SUCCESS : DANGER;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full tabular-nums"
      style={{
        fontSize: 11,
        fontWeight: 600,
        color,
        background: `${color}1A`,
        border: `1px solid ${color}33`,
      }}
    >
      {ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />} {label}
    </span>
  );
}

function fmtAgo(iso?: string | null) {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}j`;
}

function KpiCard({
  icon, title, value, subtitle, color,
}: { icon: any; title: string; value: any; subtitle?: any; color: string }) {
  return (
    <div className="pp-card relative overflow-hidden group" style={{ padding: 20 }}>
      <div aria-hidden className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: `linear-gradient(90deg, ${color}, transparent)` }} />
      <div aria-hidden className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-10 group-hover:opacity-20 transition-opacity"
        style={{ background: `radial-gradient(circle, ${color}, transparent 70%)` }} />
      <div className="relative">
        <div className="flex items-start justify-between mb-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ background: `${color}1A`, color, border: `1px solid ${color}33` }}>
            {icon}
          </div>
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1, color: "var(--pp-text-primary)" }} className="tabular-nums">
          {value}
        </div>
        <p style={{ fontSize: 12, color: "var(--pp-text-secondary)", marginTop: 8 }}>{title}</p>
        {subtitle && <p style={{ fontSize: 11, color: "var(--pp-text-faint)", marginTop: 2 }}>{subtitle}</p>}
      </div>
    </div>
  );
}

export default function PAMaestroSync() {
  const { lang } = useMplanipretLang();
  const t = DICT[lang];
  const [status, setStatus] = useState<Status | null>(null);
  const [mirror, setMirror] = useState<MirrorStatus | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [mirroring, setMirroring] = useState(false);
  const [onlyFailures, setOnlyFailures] = useState(false);
  const [actionFilter, setActionFilter] = useState<{ like?: string; eq?: string; label?: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const invokeAll = () => Promise.all([
      supabase.functions.invoke("pp-maestro-admin", { body: { action: "status" } }),
      supabase.functions.invoke("pp-maestro-admin", {
        body: {
          action: "sync-log", limit: 200, since_hours: 72,
          only_failures: onlyFailures,
          action_like: actionFilter?.like,
          action_eq: actionFilter?.eq,
        },
      }),
      supabase.functions.invoke("pp-maestro-admin", { body: { action: "mirror-status" } }),
    ]);
    const is401 = (e: any) =>
      e?.context?.status === 401 || /\b401\b|unauthorized/i.test(e?.message || "");
    try {
      let [s, l, m] = await invokeAll();
      // Stale/revoked session: try one refresh + retry, else sign out.
      if (is401(s.error) || is401(l.error) || is401(m.error)) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (!refreshed?.session) {
          await supabase.auth.signOut().catch(() => {});
          window.location.href = "/auth?redirect=/planipret/admin/maestro-sync";
          return;
        }
        [s, l, m] = await invokeAll();
      }
      if (s.error) throw new Error(s.error.message);
      if (l.error) throw new Error(l.error.message);
      setStatus(s.data as Status);
      setLogs(((l.data as any)?.entries ?? []) as LogRow[]);
      if (!m.error) setMirror(m.data as MirrorStatus);
    } catch (e: any) {
      setErr(e?.message ?? t.genericError);
    } finally {
      setLoading(false);
    }
  }, [onlyFailures, actionFilter, t.genericError]);

  const mirrorAll = useCallback(async () => {
    if (!confirm(t.mirrorAllConfirm)) return;
    setMirroring(true);
    try {
      let cursor: string | null = null;
      let total = 0;
      for (let i = 0; i < 20; i++) {
        const { data, error } = await supabase.functions.invoke("pp-maestro-admin", {
          body: { action: "mirror-all", batch_size: 200, max_batches: 5, cursor },
        });
        if (error) throw error;
        total += (data as any)?.scheduled ?? 0;
        const next = (data as any)?.next_cursor;
        if (!next || next === cursor) break;
        cursor = next;
      }
      alert(t.mirrorGlobalResult(total));
      await load();
    } catch (e: any) {
      alert(t.mirrorAllError(e?.message ?? e));
    } finally {
      setMirroring(false);
    }
  }, [load, t]);

  useEffect(() => {
    void load();
    const t = setInterval(() => { void load(); }, 10_000);
    return () => clearInterval(t);
  }, [load]);

  const byAction = useMemo(() => {
    const m: Record<string, { total: number; failed: number }> = {};
    for (const r of logs) {
      const k = r.action ?? "unknown";
      const b = m[k] ?? { total: 0, failed: 0 };
      b.total += 1;
      if (!r.success) b.failed += 1;
      m[k] = b;
    }
    return Object.entries(m).sort((a, b) => b[1].total - a[1].total);
  }, [logs]);

  const successRate = status?.stats24h?.success_rate;
  const rateColor = successRate == null ? AGENT : successRate >= 95 ? SUCCESS : successRate >= 80 ? WARNING : DANGER;

  return (
    <div className="planipret-scope planipret-admin-scope p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center"
            style={{ background: `${ACCENT}1A`, color: ACCENT, border: `1px solid ${ACCENT}33` }}>
            <Cable className="w-5 h-5" />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--pp-text-primary)", letterSpacing: "-0.01em" }}>
              {t.pageTitle}
            </h1>
            <p style={{ fontSize: 13, color: "var(--pp-text-secondary)", marginTop: 2 }}>
              {t.pageSubtitle}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 pp-card px-3 py-1.5 cursor-pointer" style={{ fontSize: 12 }}>
            <input
              type="checkbox"
              checked={onlyFailures}
              onChange={(e) => setOnlyFailures(e.target.checked)}
              className="accent-current"
              style={{ accentColor: ACCENT }}
            />
            <span style={{ color: "var(--pp-text-secondary)" }}>{t.failuresOnly}</span>
          </label>
          <button
            className="pp-btn flex items-center gap-2"
            onClick={async () => {
              try {
                const { data, error } = await supabase.functions.invoke("pp-maestro-admin", {
                  body: { action: "resync-analysis", since_hours: 72, limit: 200 },
                });
                if (error) throw error;
                alert(t.resyncScheduled((data as any)?.scheduled ?? 0));
                await load();
              } catch (e: any) {
                alert(t.resyncError(e?.message ?? e));
              }
            }}
            disabled={loading}
            style={{ padding: "8px 14px", fontSize: 13 }}
          >
            <Activity className="w-4 h-4" /> {t.resyncAnalyses}
          </button>
          <button
            className="pp-btn flex items-center gap-2"
            onClick={() => void mirrorAll()}
            disabled={mirroring || loading}
            style={{ padding: "8px 14px", fontSize: 13, borderColor: `${AGENT}55`, color: AGENT }}
          >
            <Activity className={`w-4 h-4 ${mirroring ? "animate-spin" : ""}`} /> {t.mirrorEverything}
          </button>
          <button
            className="pp-btn pp-btn-primary flex items-center gap-2"
            onClick={() => void load()}
            disabled={loading}
            style={{ padding: "8px 14px", fontSize: 13 }}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> {t.refresh}
          </button>
        </div>
      </div>

      {/* Embedded OAuth broker connection flow (was /planipret/admin/maestro-status) */}
      <div className="pp-card mb-5" style={{ padding: 0, overflow: "hidden" }}>
        <PAMaestroStatus />
      </div>


      {err && (
        <div className="pp-card mb-5" style={{ padding: 12, borderColor: `${DANGER}55`, background: `${DANGER}0D` }}>
          <div className="flex items-center gap-2" style={{ color: DANGER, fontSize: 13 }}>
            <AlertTriangle className="w-4 h-4" /> {err}
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <KpiCard
          icon={<Server className="w-5 h-5" />}
          color={status?.configured ? SUCCESS : DANGER}
          title={t.configuration}
          value={<Pill ok={!!status?.configured} label={status?.configured ? t.active : t.missing} />}
          subtitle={status?.base_url || "—"}
        />
        <KpiCard
          icon={<Radio className="w-5 h-5" />}
          color={status?.ping?.ok ? SUCCESS : DANGER}
          title={t.authPing}
          value={<Pill ok={!!status?.ping?.ok} label={status?.ping?.ok ? `${t.ok} · ${status.ping.status}` : `${t.errorLabel} · ${status?.ping?.status ?? 0}`} />}
          subtitle={
            <>
              {status?.ping?.ms ? `${status.ping.ms} ms` : "—"}
              {status?.ping?.error ? <span style={{ color: DANGER }}> · {status.ping.error}</span> : null}
            </>
          }
        />
        <KpiCard
          icon={<Activity className="w-5 h-5" />}
          color={rateColor}
          title={t.total24h}
          value={status?.stats24h?.total ?? 0}
          subtitle={
            <>
              {t.failuresCount(status?.stats24h?.failed ?? 0)}{" "}
              {successRate != null ? t.successRate(successRate) : "—"}
            </>
          }
        />
        <KpiCard
          icon={<AlertTriangle className="w-5 h-5" />}
          color={AGENT}
          title={t.lastMirror}
          value={
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2" style={{ fontSize: 12 }}>
                <span style={{ color: "var(--pp-text-secondary)" }}>{t.call}</span>
                <span className="tabular-nums" style={{ color: "var(--pp-text-primary)", fontWeight: 600 }}>
                  {fmtAgo(status?.last_call_mirror?.created_at)}
                </span>
                {status?.last_call_mirror && <Pill ok={!!status.last_call_mirror.success} label={String(status.last_call_mirror.response_status ?? 0)} />}
              </div>
              <div className="flex items-center gap-2" style={{ fontSize: 12 }}>
                <span style={{ color: "var(--pp-text-secondary)" }}>{t.sms}</span>
                <span className="tabular-nums" style={{ color: "var(--pp-text-primary)", fontWeight: 600 }}>
                  {fmtAgo(status?.last_sms_mirror?.created_at)}
                </span>
                {status?.last_sms_mirror && <Pill ok={!!status.last_sms_mirror.success} label={String(status.last_sms_mirror.response_status ?? 0)} />}
              </div>
              <div className="flex items-center gap-2" style={{ fontSize: 12 }}>
                <span style={{ color: "var(--pp-text-secondary)" }}>{t.aiAnalysis}</span>
                <span className="tabular-nums" style={{ color: "var(--pp-text-primary)", fontWeight: 600 }}>
                  {fmtAgo(status?.last_analysis_mirror?.created_at)}
                </span>
                {status?.last_analysis_mirror && <Pill ok={!!status.last_analysis_mirror.success} label={String(status.last_analysis_mirror.response_status ?? 0)} />}
              </div>
            </div>
          }
        />
      </div>

      {/* Live analytics summary → clickable filters into the journal below */}
      <div className="pp-card mb-5" style={{ padding: 20 }}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--pp-text-primary)" }}>
              {t.liveAnalytics}
            </h2>
            <p style={{ fontSize: 11, color: "var(--pp-text-faint)", marginTop: 2 }}>
              {t.liveAnalyticsHint}
            </p>
          </div>
          {mirror && (
            <span style={{ fontSize: 11, color: "var(--pp-text-faint)" }}>
              {t.logWindow(fmtAgo(mirror.window_first_log), fmtAgo(mirror.window_last_log))}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {([
            { label: t.eligible, value: mirror?.eligible ?? "—", color: ACCENT, sub: t.eligibleSub, filter: null },
            { label: t.withMaestroId, value: mirror?.with_maestro_call_id ?? "—", color: AGENT, sub: t.withMaestroIdSub, filter: null },
            { label: t.transferredOk, value: mirror?.mirrored_ok ?? "—", color: SUCCESS, sub: t.transferredOkSub, filter: { eq: "call.analysis.summary", label: t.transferredOkFilterLabel, onlyFailures: false } },
            { label: t.skipped, value: mirror?.skipped_total ?? "—", color: WARNING, sub: t.skippedSub, filter: { like: "call.analysis.skipped.%", label: t.skippedFilterLabel, onlyFailures: false } },
            { label: t.errors, value: mirror?.errors_total ?? "—", color: DANGER, sub: t.errorsSub, filter: { eq: "call.analysis.summary", label: t.errorsFilterLabel, onlyFailures: true } },
            { label: t.toPush, value: mirror?.pending ?? "—", color: AGENT, sub: t.toPushSub, filter: null },
          ] as const).map((c) => {
            const isActive =
              !!c.filter &&
              (actionFilter?.eq === (c.filter as any).eq &&
               actionFilter?.like === (c.filter as any).like &&
               onlyFailures === !!(c.filter as any).onlyFailures);
            const clickable = !!c.filter;
            return (
              <button
                key={c.label}
                type="button"
                disabled={!clickable}
                onClick={() => {
                  if (!c.filter) return;
                  setActionFilter({ eq: (c.filter as any).eq, like: (c.filter as any).like, label: (c.filter as any).label });
                  setOnlyFailures(!!(c.filter as any).onlyFailures);
                  requestAnimationFrame(() => {
                    document.getElementById("pp-maestro-journal")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  });
                }}
                className="pp-card text-left transition-transform"
                style={{
                  padding: 14,
                  borderColor: isActive ? c.color : `${c.color}33`,
                  background: isActive ? `${c.color}1F` : `${c.color}0A`,
                  cursor: clickable ? "pointer" : "default",
                  outline: isActive ? `1px solid ${c.color}` : "none",
                }}
              >
                <div style={{ fontSize: 22, fontWeight: 700, color: c.color, lineHeight: 1 }} className="tabular-nums">{c.value}</div>
                <div style={{ fontSize: 11, color: "var(--pp-text-secondary)", marginTop: 6, fontWeight: 600 }}>{c.label}</div>
                <div style={{ fontSize: 10, color: "var(--pp-text-faint)", marginTop: 2 }}>{c.sub}</div>
              </button>
            );
          })}
        </div>
        {mirror && mirror.eligible > 0 && (
          <div className="mt-3" style={{ height: 6, background: "var(--pp-bg-deep)", borderRadius: 999, overflow: "hidden" }}>
            <div style={{
              width: `${Math.min(100, Math.round((mirror.mirrored_ok / Math.max(1, mirror.eligible)) * 100))}%`,
              height: "100%", background: SUCCESS, transition: "width .4s",
            }} />
          </div>
        )}
      </div>


      {/* By-action breakdown */}
      <div className="pp-card mb-5" style={{ padding: 20 }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--pp-text-primary)" }}>{t.byActionTitle}</h2>
            <p style={{ fontSize: 11, color: "var(--pp-text-faint)", marginTop: 2 }}>{t.byActionSubtitle}</p>
          </div>
        </div>
        {byAction.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--pp-text-secondary)" }}>{t.noRecentActivity}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {byAction.map(([k, v]) => {
              const failed = v.failed > 0;
              const color = failed ? DANGER : ACCENT;
              return (
                <span
                  key={k}
                  className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md font-mono tabular-nums"
                  style={{
                    fontSize: 11,
                    color: "var(--pp-text-primary)",
                    background: `${color}12`,
                    border: `1px solid ${color}33`,
                  }}
                >
                  <span style={{ color }}>{k}</span>
                  <span style={{ color: "var(--pp-text-secondary)" }}>·</span>
                  <span style={{ fontWeight: 700 }}>{v.total}</span>
                  {failed && <span style={{ color: DANGER, fontWeight: 600 }}>({v.failed} ✕)</span>}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Detailed log */}
      <div id="pp-maestro-journal" className="pp-card" style={{ padding: 0, overflow: "hidden", scrollMarginTop: 16 }}>
        <div className="flex items-center justify-between px-5 py-4 flex-wrap gap-2" style={{ borderBottom: "1px solid var(--pp-bg-border-2)" }}>
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--pp-text-primary)" }}>{t.detailedLog}</h2>
            <p style={{ fontSize: 11, color: "var(--pp-text-faint)", marginTop: 2 }}>{t.entriesCount(logs.length)}</p>
          </div>
          {(actionFilter || onlyFailures) && (
            <div className="flex items-center gap-2 flex-wrap">
              {actionFilter?.label && (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md" style={{ fontSize: 11, color: ACCENT, background: `${ACCENT}14`, border: `1px solid ${ACCENT}44` }}>
                  {t.filterLabel(actionFilter.label)}
                </span>
              )}
              {onlyFailures && !actionFilter && (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md" style={{ fontSize: 11, color: DANGER, background: `${DANGER}14`, border: `1px solid ${DANGER}44` }}>
                  {t.failuresOnly}
                </span>
              )}
              <button
                type="button"
                className="pp-btn"
                onClick={() => { setActionFilter(null); setOnlyFailures(false); }}
                style={{ padding: "4px 10px", fontSize: 11 }}
              >
                {t.reset}
              </button>
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ fontSize: 12 }}>
            <thead>
              <tr style={{ background: "var(--pp-bg-deep)" }}>
                {[t.when, t.action, t.endpoint, t.http, t.ms, t.status].map((h, i) => (
                  <th key={h}
                    className={i >= 3 && i <= 4 ? "text-right" : "text-left"}
                    style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                      color: "var(--pp-text-faint)", padding: "10px 14px",
                    }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((r) => (
                <Fragment key={r.id}>
                  <tr
                    className="cursor-pointer transition-colors hover:bg-[var(--pp-bg-deep)]"
                    onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                    style={{ borderTop: "1px solid var(--pp-bg-border-2)" }}
                  >
                    <td style={{ padding: "10px 14px", color: "var(--pp-text-secondary)", whiteSpace: "nowrap" }}>{fmtAgo(r.created_at)}</td>
                    <td style={{ padding: "10px 14px", fontFamily: "monospace", color: "var(--pp-text-primary)" }}>{r.action ?? "—"}</td>
                    <td style={{ padding: "10px 14px", fontFamily: "monospace", color: "var(--pp-text-secondary)", maxWidth: 380 }} className="truncate">
                      {r.maestro_endpoint ?? "—"}
                    </td>
                    <td style={{ padding: "10px 14px", fontFamily: "monospace", textAlign: "right", color: "var(--pp-text-primary)" }} className="tabular-nums">
                      {r.response_status ?? 0}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--pp-text-faint)" }} className="tabular-nums">
                      {r.duration_ms ?? "—"}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <Pill ok={!!r.success} label={r.success ? t.ok : t.fail} />
                    </td>
                  </tr>
                  {expanded === r.id && (
                    <tr style={{ background: "var(--pp-bg-deep)" }}>
                      <td colSpan={6} style={{ padding: 14 }}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {["request_body", "response_body"].map((k) => (
                            <div key={k}>
                              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--pp-text-faint)", marginBottom: 6 }}>
                                {k === "request_body" ? t.request : t.response}
                              </div>
                              <pre
                                className="overflow-x-auto"
                                style={{
                                  background: "var(--pp-bg-primary)",
                                  border: "1px solid var(--pp-bg-border-2)",
                                  borderRadius: 6, padding: 10, maxHeight: 260,
                                  fontSize: 11, color: "var(--pp-text-primary)", fontFamily: "monospace",
                                }}
                              >
                                {JSON.stringify((r as any)[k] ?? {}, null, 2)}
                              </pre>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {logs.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} style={{ padding: "40px 14px", textAlign: "center", color: "var(--pp-text-faint)", fontSize: 13 }}>
                    {t.noEntries}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
