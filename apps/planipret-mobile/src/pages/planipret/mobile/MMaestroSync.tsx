/**
 * MMaestroSync — history of the latest Maestro sync jobs (call logs, recordings,
 * AI summary, AI coaching, SMS) with endpoint, timestamps, errors and retry.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, CheckCircle2, XCircle, Loader2, RotateCcw, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

type LogRow = {
  id: string;
  action: string | null;
  maestro_endpoint: string | null;
  response_status: number | null;
  response_body: any;
  request_body: any;
  duration_ms: number | null;
  success: boolean | null;
  created_at: string;
};

function matchesFilter(row: LogRow, filter: string) {
  const a = (row.action ?? "").toLowerCase();
  switch (filter) {
    case "call": return /call|cdr/.test(a);
    case "recording": return /record/.test(a);
    case "summary": return /summary|coach|analys|resume/.test(a);
    case "sms": return /sms|message|texto/.test(a);
    case "failed": return row.success === false;
    default: return true;
  }
}

function retryErrorMessage(data: any, fallback: string) {
  const result = data?.result ?? data;
  return result?.detail ?? result?.error ?? data?.error ?? fallback;
}

export default function MMaestroSync() {
  const nav = useNavigate();
  const { t, lang } = useMplanipretLang();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [retrying, setRetrying] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const FILTERS = [
    { id: "all", label: t("screens.maestroSync.filterAll") },
    { id: "call", label: t("screens.maestroSync.filterCall") },
    { id: "recording", label: t("screens.maestroSync.filterRecording") },
    { id: "summary", label: t("screens.maestroSync.filterSummary") },
    { id: "sms", label: t("screens.maestroSync.filterSms") },
    { id: "failed", label: t("screens.maestroSync.filterFailed") },
  ] as const;

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("planipret_maestro_sync_log")
      .select("id, action, maestro_endpoint, response_status, response_body, request_body, duration_ms, success, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) toast.error(t("screens.maestroSync.historyUnavailableToast"), { description: error.message });
    setRows((data ?? []) as LogRow[]);
    setLoading(false);
  }, [t]);

  useEffect(() => { load(); }, [load]);

  async function retry(id: string) {
    setRetrying(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("pp-maestro-retry", {
        body: { log_id: id },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (error) throw error;
      if ((data as any)?.success === false || (data as any)?.error) {
        throw new Error(retryErrorMessage(data, t("screens.maestroSync.retryDeniedFallback")));
      }
      toast.success(`${t("screens.maestroSync.retriedViaToast")} ${(data as any)?.invoked ?? "Maestro"}`);
      await load();
    } catch (e: any) {
      toast.error(t("screens.maestroSync.retryFailedToast"), { description: e?.message ?? String(e) });
    } finally {
      setRetrying(null);
    }
  }

  const visible = rows.filter((r) => matchesFilter(r, filter));

  return (
    <div className="min-h-screen p-4" style={{ background: "var(--pp-bg-base, #060D1A)", color: "var(--pp-text-primary, #E8EDF5)" }}>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => nav(-1)} className="p-2 rounded-lg" style={{ background: "#0A1628", border: "1px solid #0E2A45" }} aria-label={t("screens.maestroSync.back")}>
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-lg font-bold flex-1">{t("screens.maestroSync.title")}</h1>
          <button onClick={load} className="p-2 rounded-lg" style={{ background: "#0A1628", border: "1px solid #0E2A45" }} aria-label={t("screens.maestroSync.refresh")}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-3">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className="text-[11px] font-semibold px-3 py-1.5 rounded-full whitespace-nowrap"
              style={{
                background: filter === f.id ? "rgba(46,155,220,0.16)" : "#0A1628",
                border: `1px solid ${filter === f.id ? "#17527d" : "#0E2A45"}`,
                color: filter === f.id ? "#5EC2FF" : "#8FA8C0",
              }}
            >{f.label}</button>
          ))}
        </div>

        {loading && <p className="text-xs" style={{ color: "#8FA8C0" }}>{t("screens.maestroSync.loading")}</p>}
        {!loading && visible.length === 0 && <p className="text-xs" style={{ color: "#8FA8C0" }}>{t("screens.maestroSync.noJobs")}</p>}

        <ul className="space-y-2">
          {visible.map((r) => {
            const ok = r.success === true;
            const expanded = open === r.id;
            return (
              <li key={r.id} className="rounded-xl p-3" style={{ background: "#0A1628", border: "1px solid #0E2A45" }}>
                <div className="flex items-start gap-2">
                  {ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#2EDC78" }} />
                      : <XCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#E84C4C" }} />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{r.action ?? t("screens.maestroSync.sync")}</p>
                    <p className="text-[11px] font-mono truncate" style={{ color: "#8FA8C0" }}>{r.maestro_endpoint ?? "—"}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: "#5E7A96" }}>
                      {new Date(r.created_at).toLocaleString(lang === "fr" ? "fr-CA" : "en-CA")}
                      {r.response_status != null ? ` · HTTP ${r.response_status}` : ""}
                      {r.duration_ms != null ? ` · ${r.duration_ms} ms` : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {!ok && (
                      <button
                        onClick={() => retry(r.id)}
                        disabled={retrying === r.id}
                        className="text-[11px] font-semibold px-3 py-1.5 rounded-full inline-flex items-center gap-1 disabled:opacity-60"
                        style={{ background: "rgba(245,166,35,0.14)", border: "1px solid #4A3000", color: "#F5A623" }}
                      >
                        {retrying === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                        {t("screens.maestroSync.retry")}
                      </button>
                    )}
                    <button onClick={() => setOpen(expanded ? null : r.id)} className="p-1" aria-label={t("screens.maestroSync.details")}>
                      <ChevronDown className="w-4 h-4" style={{ color: "#8FA8C0", transform: expanded ? "rotate(180deg)" : undefined }} />
                    </button>
                  </div>
                </div>
                {expanded && (
                  <pre className="mt-2 text-[10px] overflow-x-auto p-2 rounded" style={{ background: "#060D1A", color: "#8FA8C0" }}>
{JSON.stringify({ request: r.request_body, response: r.response_body }, null, 2)}
                  </pre>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
