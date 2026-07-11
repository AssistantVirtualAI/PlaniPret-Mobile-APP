import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  User,
  XCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type NextAction = { title?: string; description?: string; due?: string; type?: string } | string;

type MaestroCall = {
  id: string;
  maestro_synced?: boolean | null;
  maestro_client_id?: string | null;
  ai_summary?: string | null;
  ai_summary_short?: string | null;
  ai_analysis_json?: any;
  next_actions?: any;
  metadata?: any;
  transcript?: string | null;
  transcript_segments?: any;
};

function extractNextActions(call: MaestroCall): NextAction[] {
  const na = call.next_actions;
  if (Array.isArray(na)) return na;
  const aij = call.ai_analysis_json ?? {};
  const ns = aij?.summary?.next_steps ?? aij?.next_actions ?? aij?.next_steps;
  if (Array.isArray(ns)) return ns;
  const meta = call.metadata ?? {};
  if (Array.isArray(meta.ai_tasks)) return meta.ai_tasks;
  return [];
}

export default function MaestroTab({ call, onUpdated }: { call: MaestroCall; onUpdated: () => void }) {
  const { t, lang } = useMplanipretLang();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [pushing, setPushing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [syncLog, setSyncLog] = useState<any[]>([]);
  const [maestroClient, setMaestroClient] = useState<any>(null);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("planipret_integration_config")
        .select("integration_key,is_enabled")
        .eq("integration_key", "maestro")
        .maybeSingle();
      setConfigured(!!(data as any)?.is_enabled);
    })();
  }, []);

  const reloadLog = useCallback(async () => {
    const { data } = await supabase
      .from("planipret_maestro_sync_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    const rows = ((data as any[]) ?? []).filter((r) => {
      const body = typeof r.request_body === "string" ? r.request_body : JSON.stringify(r.request_body ?? {});
      const resp = typeof r.response_body === "string" ? r.response_body : JSON.stringify(r.response_body ?? {});
      return body.includes(call.id) || resp.includes(call.id);
    });
    setSyncLog(rows);
  }, [call.id]);

  useEffect(() => { reloadLog(); }, [reloadLog]);

  useEffect(() => {
    if (!call.maestro_client_id) { setMaestroClient(null); return; }
    (async () => {
      const { data } = await supabase
        .from("planipret_maestro_clients")
        .select("*")
        .eq("maestro_client_id", call.maestro_client_id!)
        .maybeSingle();
      setMaestroClient(data);
    })();
  }, [call.maestro_client_id]);

  const nextActions = extractNextActions(call);
  const hasAiContent = !!(call.ai_summary || call.ai_summary_short || call.ai_analysis_json);
  const hasTranscript = !!(call.transcript || (Array.isArray(call.transcript_segments) && call.transcript_segments.length > 0));

  const runAiAnalysis = async () => {
    if (!hasTranscript) {
      toast.error(t("maestro.aiFailed"), { description: lang === "fr" ? "Transcription requise avant analyse." : "Transcript required before analysis." });
      return;
    }
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("pp-coach-call", {
        body: { call_id: call.id, force: true },
      });
      if (error || (data as any)?.success === false) {
        toast.error(t("maestro.aiFailed"), { description: (data as any)?.error ?? error?.message });
      } else {
        toast.success(t("maestro.aiGenerated"));
        onUpdated();
      }
    } catch (e: any) {
      toast.error(t("maestro.aiFailed"), { description: e?.message });
    } finally {
      setAnalyzing(false);
    }
  };

  const doPush = async () => {
    setConfirmOpen(false);
    setPushing(true);
    try {
      const { data, error } = await supabase.functions.invoke("maestro-pipeline-orchestrator", {
        body: { call_id: call.id, actions: nextActions },
      });
      if (error || (data as any)?.success === false) {
        toast.error(t("maestro.pushFailed"), { description: (data as any)?.error ?? error?.message });
      } else {
        toast.success(t("maestro.pushSuccess"));
        onUpdated();
      }
    } catch (e: any) {
      toast.error(t("maestro.pushFailed"), { description: e?.message });
    } finally {
      setPushing(false);
      reloadLog();
    }
  };

  const dateLocale = lang === "en" ? "en-CA" : "fr-CA";

  // Not configured — enhanced i18n fallback
  if (configured === false) {
    return (
      <div className="pp-card p-5 flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{ background: "rgba(245,166,35,0.12)" }}>
          <Building2 className="w-7 h-7" style={{ color: "var(--pp-warning)" }} />
        </div>
        <div className="text-sm font-bold mb-1" style={{ color: "var(--pp-text-primary)" }}>{t("maestro.notConfiguredTitle")}</div>
        <div className="text-xs mb-4 max-w-xs" style={{ color: "var(--pp-text-secondary)" }}>
          {t("maestro.notConfiguredBody")}
        </div>
        <Link
          to="/planipret/integrations"
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold"
          style={{ background: "var(--pp-brand-accent-2)", color: "white" }}
        >
          <ExternalLink className="w-3.5 h-3.5" /> {t("maestro.configure")}
        </Link>
        <div className="text-[10px] mt-2 font-mono" style={{ color: "var(--pp-text-muted)" }}>{t("maestro.openIntegrations")}</div>
      </div>
    );
  }

  if (configured === null) {
    return (
      <div className="text-xs text-center py-4 flex items-center justify-center gap-2" style={{ color: "var(--pp-text-muted)" }}>
        <Loader2 className="w-3 h-3 animate-spin" /> {t("maestro.checking")}
      </div>
    );
  }

  const lastAttempt = syncLog[0];
  const lastFailed = lastAttempt && !(lastAttempt.status === "success" || lastAttempt.success);

  return (
    <>
      {/* Status */}
      <div className="pp-card p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--pp-text-secondary)" }}>{t("maestro.syncStatus")}</div>
          <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold inline-flex items-center gap-1" style={{
            background: call.maestro_synced ? "rgba(0,212,170,0.15)" : lastFailed ? "rgba(255,71,87,0.15)" : "rgba(245,166,35,0.15)",
            color: call.maestro_synced ? "var(--pp-success)" : lastFailed ? "var(--pp-danger)" : "var(--pp-warning)",
          }}>
            {call.maestro_synced
              ? <><CheckCircle2 className="w-3 h-3" /> {t("maestro.synced")}</>
              : lastFailed
                ? <><XCircle className="w-3 h-3" /> {t("maestro.failed")}</>
                : <><Clock className="w-3 h-3" /> {t("maestro.pending")}</>}
          </span>
        </div>

        {/* Linked client */}
        {maestroClient ? (
          <div className="mt-3 rounded-lg p-2.5 flex items-start gap-2" style={{ background: "var(--pp-bg-elevated)" }}>
            <User className="w-4 h-4 mt-0.5" style={{ color: "var(--pp-brand-accent-2)" }} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate" style={{ color: "var(--pp-text-primary)" }}>
                {maestroClient.first_name} {maestroClient.last_name}
              </div>
              <div className="text-[11px] truncate" style={{ color: "var(--pp-text-muted)" }}>
                {maestroClient.email ?? maestroClient.phone ?? maestroClient.maestro_client_id}
              </div>
            </div>
          </div>
        ) : call.maestro_client_id ? (
          <div className="text-xs mt-2" style={{ color: "var(--pp-text-secondary)" }}>
            {t("maestro.linkedClient")}: <span style={{ color: "var(--pp-text-primary)", fontFamily: "monospace" }}>{String(call.maestro_client_id).slice(0, 12)}</span>
          </div>
        ) : (
          <div className="text-xs mt-2" style={{ color: "var(--pp-text-muted)" }}>{t("maestro.noLinkedClient")}</div>
        )}

        {/* AI generation CTA */}
        {!hasAiContent && (
          <button
            onClick={runAiAnalysis}
            disabled={analyzing || !hasTranscript}
            className="mt-3 w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-primary)", border: "1px solid var(--pp-brand-accent-2)" }}
          >
            {analyzing ? <><Loader2 className="w-4 h-4 animate-spin" /> {t("maestro.generating")}</> : <><Sparkles className="w-4 h-4" /> {t("maestro.generateAi")}</>}
          </button>
        )}

        {/* Push CTA */}
        {!call.maestro_synced && hasAiContent && (
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={pushing}
            className="mt-3 w-full py-2.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, var(--pp-brand-accent-2), var(--pp-brand-accent))" }}
          >
            {pushing ? <><Loader2 className="w-4 h-4 animate-spin" /> {t("maestro.pushing")}</> : <><Send className="w-4 h-4" /> {t("maestro.push")}</>}
          </button>
        )}

        {/* Retry CTA on last failure */}
        {lastFailed && !pushing && (
          <button
            onClick={() => setConfirmOpen(true)}
            className="mt-2 w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5"
            style={{ background: "rgba(255,71,87,0.1)", color: "var(--pp-danger)", border: "1px solid rgba(255,71,87,0.3)" }}
          >
            <RefreshCw className="w-3.5 h-3.5" /> {t("maestro.retry")}
          </button>
        )}
      </div>

      {/* Next actions */}
      <div className="pp-card p-4">
        <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--pp-text-secondary)" }}>{t("maestro.nextActions")}</div>
        {nextActions.length === 0 ? (
          <div className="text-xs py-2" style={{ color: "var(--pp-text-muted)" }}>{t("maestro.noNextActions")}</div>
        ) : (
          <ul className="space-y-2">
            {nextActions.map((a, i) => {
              const title = typeof a === "string" ? a : (a.title ?? a.description ?? "Action");
              const due = typeof a === "object" ? a.due : undefined;
              const type = typeof a === "object" ? a.type : undefined;
              return (
                <li key={i} className="rounded-lg p-2.5 flex items-start gap-2" style={{ background: "var(--pp-bg-elevated)" }}>
                  <div className="mt-0.5 w-1.5 h-1.5 rounded-full" style={{ background: "var(--pp-brand-accent-2)" }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm" style={{ color: "var(--pp-text-primary)" }}>{title}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: "var(--pp-text-muted)" }}>
                      {type && <span className="mr-2">#{type}</span>}
                      {due && <span>📅 {due}</span>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Sync log */}
      <div className="pp-card p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--pp-text-secondary)" }}>{t("maestro.log")}</div>
          <button onClick={reloadLog} className="text-[11px] flex items-center gap-1" style={{ color: "var(--pp-text-muted)" }}>
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
        {syncLog.length === 0 ? (
          <div className="text-xs py-2" style={{ color: "var(--pp-text-muted)" }}>{t("maestro.noLog")}</div>
        ) : (
          <ul className="space-y-1.5">
            {syncLog.map((l) => {
              const ok = l.status === "success" || l.success;
              const err = l.status === "error" || l.success === false;
              const expanded = expandedLog === l.id;
              return (
                <li key={l.id} className="text-[11px] rounded-md" style={{ background: expanded ? "var(--pp-bg-elevated)" : "transparent" }}>
                  <button
                    onClick={() => setExpandedLog(expanded ? null : l.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5"
                  >
                    {ok ? <CheckCircle2 className="w-3 h-3 shrink-0" style={{ color: "var(--pp-success)" }} />
                      : err ? <XCircle className="w-3 h-3 shrink-0" style={{ color: "var(--pp-danger)" }} />
                      : <AlertTriangle className="w-3 h-3 shrink-0" style={{ color: "var(--pp-warning)" }} />}
                    <span className="truncate" style={{ color: "var(--pp-text-secondary)" }}>{l.action ?? l.operation ?? l.event_type ?? "sync"}</span>
                    <span className="ml-auto shrink-0" style={{ color: "var(--pp-text-muted)" }}>
                      {new Date(l.created_at).toLocaleString(dateLocale, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {expanded ? <ChevronUp className="w-3 h-3" style={{ color: "var(--pp-text-muted)" }} /> : <ChevronDown className="w-3 h-3" style={{ color: "var(--pp-text-muted)" }} />}
                  </button>
                  {expanded && (
                    <div className="px-2 pb-2">
                      {l.error_message && (
                        <div className="text-[10px] mb-1 font-mono break-all p-1.5 rounded" style={{ background: "rgba(255,71,87,0.08)", color: "var(--pp-danger)" }}>
                          {l.error_message}
                        </div>
                      )}
                      <pre className="text-[10px] font-mono break-all whitespace-pre-wrap max-h-32 overflow-auto p-1.5 rounded" style={{ background: "var(--pp-bg-base)", color: "var(--pp-text-muted)" }}>
                        {JSON.stringify(l.response_body ?? l.request_body ?? {}, null, 2).slice(0, 800)}
                      </pre>
                      {err && (
                        <button
                          onClick={() => setConfirmOpen(true)}
                          className="mt-1.5 text-[11px] font-semibold flex items-center gap-1"
                          style={{ color: "var(--pp-brand-accent-2)" }}
                        >
                          <RefreshCw className="w-3 h-3" /> {t("maestro.retry")}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Confirm dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("maestro.confirmPushTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("maestro.confirmPushBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("maestro.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={doPush}>{t("maestro.confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
