import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, CheckCircle2, XCircle, AlertTriangle, Activity, Server, Radio, Cable } from "lucide-react";

const ACCENT = "#2E9BDC";
const SUCCESS = "#00D4AA";
const DANGER = "#E84C4C";
const WARNING = "#F5A623";
const AGENT = "#9B7FE8";

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
    try {
      const [s, l, m] = await Promise.all([
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
      if (s.error) throw new Error(s.error.message);
      if (l.error) throw new Error(l.error.message);
      setStatus(s.data as Status);
      setLogs(((l.data as any)?.entries ?? []) as LogRow[]);
      if (!m.error) setMirror(m.data as MirrorStatus);
    } catch (e: any) {
      setErr(e?.message ?? "erreur");
    } finally {
      setLoading(false);
    }
  }, [onlyFailures, actionFilter]);

  const mirrorAll = useCallback(async () => {
    if (!confirm("Mirror TOUS les appels avec résumé/analyse IA vers Maestro (depuis le début) ?")) return;
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
      alert(`Miroir global : ${total} appel(s) planifié(s).`);
      await load();
    } catch (e: any) {
      alert(`Erreur mirror-all : ${e?.message ?? e}`);
    } finally {
      setMirroring(false);
    }
  }, [load]);

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
              Synchronisation Maestro Télécom
            </h1>
            <p style={{ fontSize: 13, color: "var(--pp-text-secondary)", marginTop: 2 }}>
              Vue globale des appels &amp; SMS mirrorés depuis NS-API vers Maestro.
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
            <span style={{ color: "var(--pp-text-secondary)" }}>Échecs seulement</span>
          </label>
          <button
            className="pp-btn flex items-center gap-2"
            onClick={async () => {
              try {
                const { data, error } = await supabase.functions.invoke("pp-maestro-admin", {
                  body: { action: "resync-analysis", since_hours: 72, limit: 200 },
                });
                if (error) throw error;
                alert(`Resync planifié : ${data?.scheduled ?? 0} analyse(s)`);
                await load();
              } catch (e: any) {
                alert(`Erreur resync : ${e?.message ?? e}`);
              }
            }}
            disabled={loading}
            style={{ padding: "8px 14px", fontSize: 13 }}
          >
            <Activity className="w-4 h-4" /> Resync analyses (72h)
          </button>
          <button
            className="pp-btn flex items-center gap-2"
            onClick={() => void mirrorAll()}
            disabled={mirroring || loading}
            style={{ padding: "8px 14px", fontSize: 13, borderColor: `${AGENT}55`, color: AGENT }}
          >
            <Activity className={`w-4 h-4 ${mirroring ? "animate-spin" : ""}`} /> Mirror everything
          </button>
          <button
            className="pp-btn pp-btn-primary flex items-center gap-2"
            onClick={() => void load()}
            disabled={loading}
            style={{ padding: "8px 14px", fontSize: 13 }}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Actualiser
          </button>
        </div>
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
          title="Configuration"
          value={<Pill ok={!!status?.configured} label={status?.configured ? "Active" : "Manquante"} />}
          subtitle={status?.base_url || "—"}
        />
        <KpiCard
          icon={<Radio className="w-5 h-5" />}
          color={status?.ping?.ok ? SUCCESS : DANGER}
          title="Auth & Ping API"
          value={<Pill ok={!!status?.ping?.ok} label={status?.ping?.ok ? `OK · ${status.ping.status}` : `Erreur · ${status?.ping?.status ?? 0}`} />}
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
          title="24h · Total transféré"
          value={status?.stats24h?.total ?? 0}
          subtitle={
            <>
              {status?.stats24h?.failed ?? 0} échec(s) ·{" "}
              {successRate != null ? `${successRate}% réussis` : "—"}
            </>
          }
        />
        <KpiCard
          icon={<AlertTriangle className="w-5 h-5" />}
          color={AGENT}
          title="Dernier miroir"
          value={
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2" style={{ fontSize: 12 }}>
                <span style={{ color: "var(--pp-text-secondary)" }}>Appel</span>
                <span className="tabular-nums" style={{ color: "var(--pp-text-primary)", fontWeight: 600 }}>
                  {fmtAgo(status?.last_call_mirror?.created_at)}
                </span>
                {status?.last_call_mirror && <Pill ok={!!status.last_call_mirror.success} label={String(status.last_call_mirror.response_status ?? 0)} />}
              </div>
              <div className="flex items-center gap-2" style={{ fontSize: 12 }}>
                <span style={{ color: "var(--pp-text-secondary)" }}>SMS</span>
                <span className="tabular-nums" style={{ color: "var(--pp-text-primary)", fontWeight: 600 }}>
                  {fmtAgo(status?.last_sms_mirror?.created_at)}
                </span>
                {status?.last_sms_mirror && <Pill ok={!!status.last_sms_mirror.success} label={String(status.last_sms_mirror.response_status ?? 0)} />}
              </div>
              <div className="flex items-center gap-2" style={{ fontSize: 12 }}>
                <span style={{ color: "var(--pp-text-secondary)" }}>Analyse IA</span>
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
              Analytics live · miroir vers Maestro
            </h2>
            <p style={{ fontSize: 11, color: "var(--pp-text-faint)", marginTop: 2 }}>
              Cliquer sur une carte pour filtrer le journal détaillé ci-dessous. Rafraîchi toutes les 10 s.
            </p>
          </div>
          {mirror && (
            <span style={{ fontSize: 11, color: "var(--pp-text-faint)" }}>
              Fenêtre journal : {fmtAgo(mirror.window_first_log)} → {fmtAgo(mirror.window_last_log)}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {([
            { label: "Éligibles", value: mirror?.eligible ?? "—", color: ACCENT, sub: "résumé ou analyse", filter: null },
            { label: "Avec maestro_call_id", value: mirror?.with_maestro_call_id ?? "—", color: AGENT, sub: "prêts à mirrorer", filter: null },
            { label: "Transférés OK", value: mirror?.mirrored_ok ?? "—", color: SUCCESS, sub: "voir dans le journal →", filter: { eq: "call.analysis.summary", label: "Transférés (call.analysis.summary OK)", onlyFailures: false } },
            { label: "Skipped", value: mirror?.skipped_total ?? "—", color: WARNING, sub: "sans broker / maestro_id →", filter: { like: "call.analysis.skipped.%", label: "Skipped (call.analysis.skipped.*)", onlyFailures: false } },
            { label: "Erreurs", value: mirror?.errors_total ?? "—", color: DANGER, sub: "échecs de transfert →", filter: { eq: "call.analysis.summary", label: "Erreurs (call.analysis.summary ✕)", onlyFailures: true } },
            { label: "À pousser", value: mirror?.pending ?? "—", color: AGENT, sub: "éligibles − OK", filter: null },
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
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--pp-text-primary)" }}>Répartition par action</h2>
            <p style={{ fontSize: 11, color: "var(--pp-text-faint)", marginTop: 2 }}>Fenêtre glissante · 72 heures</p>
          </div>
        </div>
        {byAction.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--pp-text-secondary)" }}>Aucune activité récente.</p>
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
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--pp-text-primary)" }}>Journal détaillé</h2>
            <p style={{ fontSize: 11, color: "var(--pp-text-faint)", marginTop: 2 }}>{logs.length} entrée(s) · cliquer pour voir requête/réponse</p>
          </div>
          {(actionFilter || onlyFailures) && (
            <div className="flex items-center gap-2 flex-wrap">
              {actionFilter?.label && (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md" style={{ fontSize: 11, color: ACCENT, background: `${ACCENT}14`, border: `1px solid ${ACCENT}44` }}>
                  Filtre : {actionFilter.label}
                </span>
              )}
              {onlyFailures && !actionFilter && (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md" style={{ fontSize: 11, color: DANGER, background: `${DANGER}14`, border: `1px solid ${DANGER}44` }}>
                  Échecs seulement
                </span>
              )}
              <button
                type="button"
                className="pp-btn"
                onClick={() => { setActionFilter(null); setOnlyFailures(false); }}
                style={{ padding: "4px 10px", fontSize: 11 }}
              >
                Réinitialiser
              </button>
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ fontSize: 12 }}>
            <thead>
              <tr style={{ background: "var(--pp-bg-deep)" }}>
                {["Quand", "Action", "Endpoint", "HTTP", "ms", "Statut"].map((h, i) => (
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
                      <Pill ok={!!r.success} label={r.success ? "OK" : "ÉCHEC"} />
                    </td>
                  </tr>
                  {expanded === r.id && (
                    <tr style={{ background: "var(--pp-bg-deep)" }}>
                      <td colSpan={6} style={{ padding: 14 }}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {["request_body", "response_body"].map((k) => (
                            <div key={k}>
                              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--pp-text-faint)", marginBottom: 6 }}>
                                {k === "request_body" ? "Requête" : "Réponse"}
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
                    Aucune entrée dans le journal.
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
