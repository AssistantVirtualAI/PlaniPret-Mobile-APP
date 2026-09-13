import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw, AlertCircle, CheckCircle2, XCircle, Clock,
  Activity, Zap, Pause, Play, AlertTriangle, TrendingUp,
  TrendingDown, Radio, Server, Send,
} from "lucide-react";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { toast } from "sonner";
import { PAPage, PAPageHeader } from "@/components/planipret/admin/PAPageShell";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const ACCENT = "#2E9BDC";
const SUCCESS = "#00D4AA";
const DANGER = "#E84C4C";
const WARNING = "#F5A623";
const PURPLE = "#9B7FE8";

const DICT = {
  fr: {
    title: "Tableau de bord Maestro",
    subtitle: "Toutes les données synchronisées vers/depuis Maestro en temps réel",
    refresh: "Actualiser",
    live: "En direct",
    paused: "En pause",
    active: "Actif",
    resume: "Reprendre",
    processQueue: "Traiter la file",
    runAudit: "Audit reconnexion",
    auditStarted: "Audit lancé — notifications envoyées",
    queue: "File de retry",
    pending: "En attente",
    done: "Terminés",
    dead: "Échoués",
    syncRate: "Taux de sync",
    callsSynced: "Appels synchronisés",
    smsPushed: "SMS envoyés",
    commissionsSynced: "Commissions",
    errors24h: "Erreurs 24h",
    syncActivity: "Activité de sync (24h)",
    success: "Succès",
    error: "Erreurs",
    errorBreakdown: "Répartition des erreurs",
    pipelineHealth: "Santé de la chaîne (CDR → Enreg → Trans → IA → SMS)",
    step: "Étape",
    count: "Nombre",
    perEndpoint: "Taux de succès par endpoint",
    proxyHealth: "Santé du proxy PBX (502 / timeouts)",
    proxyOk: "OK",
    proxy502: "502",
    proxyTimeout: "Timeouts",
    proxyOther: "Autres erreurs",
    proxyRate: "Taux d'échec proxy",
    aiFailover: "IA — Claude vs failover OpenAI",
    aiByEndpoint: "Usage IA par endpoint",
    claude: "Claude",
    openai: "OpenAI (failover)",
    failoverRate: "Taux de failover",
    commissionSync: "Synchronisation des commissions",
    broker: "Courtier",
    connected: "Connecté",
    rows: "Lignes",
    lastOk: "Dernier succès",
    reason: "Raison",
    recentErrors: "Erreurs récentes",
    filterByCall: "Filtrer par call_id",
    filterByDeal: "Filtrer par deal_id",
    all: "Tous",
    clear: "Effacer",
    noData: "Aucune donnée",
    loading: "Chargement…",
    httpStatus: "HTTP",
    endpoint: "Endpoint",
    correlation: "Correlation",
    time: "Heure",
    errorMessage: "Message d'erreur",
    edgeFunctions: "Edge Functions",
    functionName: "Fonction",
    status: "Statut",
    duration: "Durée",
    lastRun: "Maestro API — dernières 24h",
    apiCalls: "Appels API",
    avgDuration: "Durée moy.",
    circuitBreaker: "Circuit breaker actif",
    totalCalls: "Total appels",
    notSynced: "Non synchronisés",
    hasMaestroId: "Avec Maestro ID",
    none: "—",
    brokerDisconnected: "Déconnecté",
    brokerError: "Erreur",
    brokerOk: "OK",
  },
  en: {
    title: "Maestro Dashboard",
    subtitle: "All data synced to/from Maestro in real time",
    refresh: "Refresh",
    live: "Live",
    paused: "Paused",
    active: "Active",
    resume: "Resume",
    processQueue: "Process queue",
    runAudit: "Reconnection audit",
    auditStarted: "Audit started — notifications sent",
    queue: "Retry queue",
    pending: "Pending",
    done: "Done",
    dead: "Dead",
    syncRate: "Sync rate",
    callsSynced: "Calls synced",
    smsPushed: "SMS pushed",
    commissionsSynced: "Commissions",
    errors24h: "Errors 24h",
    syncActivity: "Sync activity (24h)",
    success: "Success",
    error: "Errors",
    errorBreakdown: "Error breakdown",
    pipelineHealth: "Chain health (CDR → Rec → Trans → AI → SMS)",
    step: "Step",
    count: "Count",
    perEndpoint: "Success rate per endpoint",
    proxyHealth: "PBX proxy health (502 / timeouts)",
    proxyOk: "OK",
    proxy502: "502",
    proxyTimeout: "Timeouts",
    proxyOther: "Other errors",
    proxyRate: "Proxy failure rate",
    aiFailover: "AI — Claude vs OpenAI failover",
    aiByEndpoint: "AI usage per endpoint",
    claude: "Claude",
    openai: "OpenAI (failover)",
    failoverRate: "Failover rate",
    commissionSync: "Commission sync",
    broker: "Broker",
    connected: "Connected",
    rows: "Rows",
    lastOk: "Last OK",
    reason: "Reason",
    recentErrors: "Recent errors",
    filterByCall: "Filter by call_id",
    filterByDeal: "Filter by deal_id",
    all: "All",
    clear: "Clear",
    noData: "No data",
    loading: "Loading…",
    httpStatus: "HTTP",
    endpoint: "Endpoint",
    correlation: "Correlation",
    time: "Time",
    errorMessage: "Error message",
    edgeFunctions: "Edge Functions",
    functionName: "Function",
    status: "Status",
    duration: "Duration",
    lastRun: "Maestro API — last 24h",
    apiCalls: "API calls",
    avgDuration: "Avg duration",
    circuitBreaker: "Circuit breaker active",
    totalCalls: "Total calls",
    notSynced: "Not synced",
    hasMaestroId: "With Maestro ID",
    none: "—",
    brokerDisconnected: "Disconnected",
    brokerError: "Error",
    brokerOk: "OK",
  },
} as const;

interface LogRow {
  id: string;
  call_id: string | null;
  step: string;
  status: string;
  endpoint: string | null;
  http_status: number | null;
  error_message: string | null;
  correlation_id: string | null;
  created_at: string;
  payload: unknown;
}

interface SyncLogRow {
  id: string;
  action: string;
  maestro_endpoint: string | null;
  response_status: number;
  success: boolean;
  duration_ms: number | null;
  created_at: string;
}

interface CommissionDiagRow {
  id: string;
  broker_label: string | null;
  broker_email: string | null;
  maestro_broker_id: string | null;
  connected: boolean;
  status: string | null;
  reason: string | null;
  http_status: number | null;
  rows_count: number | null;
  last_ok_at: string | null;
  last_attempt_at: string | null;
}

interface EdgeRunRow {
  id: string;
  function_name: string;
  status: string;
  error: string | null;
  started_at: string;
  finished_at: string | null;
  summary: unknown;
}

interface ProxyHealthRow {
  id: string;
  action: string | null;
  status_code: number | null;
  outcome: string | null;
  duration_ms: number | null;
  error_code: string | null;
  created_at: string;
}

interface AiUsageRow {
  id: string;
  endpoint: string | null;
  provider: string;
  model: string | null;
  status_code: number | null;
  failover: boolean | null;
  duration_ms: number | null;
  created_at: string;
}

interface QueueState {
  state: string;
  queue: { pending: number; done: number; dead: number };
  paused_reason: string | null;
  paused_at: string | null;
  last_run_at: string | null;
}

const STEP_LABELS: Record<string, { fr: string; en: string }> = {
  cdr: { fr: "CDR", en: "CDR" },
  recording: { fr: "Enregistrement", en: "Recording" },
  transcription: { fr: "Transcription", en: "Transcription" },
  ai_summary: { fr: "Résumé IA", en: "AI summary" },
  sms: { fr: "SMS", en: "SMS" },
  maestro_sync: { fr: "Sync Maestro", en: "Maestro sync" },
};

function classifyError(msg: string | null): "maestro_404" | "maestro_put_404" | "maestro_500" | "other" {
  if (!msg) return "other";
  if (msg.includes("put_404")) return "maestro_put_404";
  if (msg.includes("maestro_404") || msg === "404" || /404/.test(msg)) return "maestro_404";
  if (msg.includes("maestro_500") || /500/.test(msg)) return "maestro_500";
  return "other";
}

const ERROR_COLORS: Record<string, string> = {
  maestro_404: DANGER,
  maestro_put_404: WARNING,
  maestro_500: PURPLE,
  other: "#888",
};

const TIME_RANGES = [
  { value: 1, label: "1h" },
  { value: 6, label: "6h" },
  { value: 24, label: "24h" },
  { value: 72, label: "3j" },
  { value: 168, label: "7j" },
];

export default function PAMaestroDashboard() {
  const { lang } = useMplanipretLang();
  const t = DICT[lang];

  const [logs, setLogs] = useState<LogRow[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLogRow[]>([]);
  const [commissionDiag, setCommissionDiag] = useState<CommissionDiagRow[]>([]);
  const [edgeRuns, setEdgeRuns] = useState<EdgeRunRow[]>([]);
  const [proxyHealth, setProxyHealth] = useState<ProxyHealthRow[]>([]);
  const [aiUsage, setAiUsage] = useState<AiUsageRow[]>([]);
  const [callStats, setCallStats] = useState({ synced: 0, total: 0, hasMaestroId: 0 });
  const [queueState, setQueueState] = useState<QueueState | null>(null);
  const [loading, setLoading] = useState(false);
  const [hours, setHours] = useState(24);
  const [callFilter, setCallFilter] = useState("");
  const [dealFilter, setDealFilter] = useState("");
  const [stepFilter, setStepFilter] = useState("all");
  const [httpFilter, setHttpFilter] = useState("all");
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queueIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const since = new Date(Date.now() - hours * 3600_000).toISOString();

      // Pipeline logs
      let logQ = supabase
        .from("planipret_pipeline_logs")
        .select("id, call_id, step, status, endpoint, http_status, error_message, correlation_id, created_at, payload")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(3000);

      if (callFilter.trim()) logQ = logQ.eq("call_id", callFilter.trim());

      // Maestro sync log
      const syncQ = supabase
        .from("planipret_maestro_sync_log")
        .select("id, action, maestro_endpoint, response_status, success, duration_ms, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(2000);

      // Commission sync diag
      const diagQ = supabase
        .from("planipret_commission_sync_diag")
        .select("id, broker_label, broker_email, maestro_broker_id, connected, status, reason, http_status, rows_count, last_ok_at, last_attempt_at")
        .order("broker_label", { ascending: true });

      // Edge function runs
      const edgeQ = supabase
        .from("planipret_edge_function_runs")
        .select("id, function_name, status, error, started_at, finished_at, summary")
        .order("started_at", { ascending: false })
        .limit(30);

      const proxyQ = supabase
        .from("planipret_proxy_health")
        .select("id, action, status_code, outcome, duration_ms, error_code, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(3000);

      const aiQ = supabase
        .from("planipret_ai_provider_usage")
        .select("id, endpoint, provider, model, status_code, failover, duration_ms, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(3000);

      const [logRes, syncRes, diagRes, edgeRes, proxyRes, aiRes] = await Promise.all([
        logQ,
        syncQ,
        diagQ,
        edgeQ,
        proxyQ,
        aiQ,
      ]);
      setProxyHealth((proxyRes.data as ProxyHealthRow[]) ?? []);
      setAiUsage((aiRes.data as AiUsageRow[]) ?? []);

      if (logRes.error) throw logRes.error;
      if (syncRes.error) throw syncRes.error;
      setLogs(logRes.data ?? []);
      setSyncLogs(syncRes.data ?? []);
      setCommissionDiag(diagRes.data ?? []);
      setEdgeRuns(edgeRes.data ?? []);

      // Call stats via direct query
      const { data: callData } = await supabase
        .from("planipret_phone_calls")
        .select("maestro_synced, maestro_call_id")
        .gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString());
      if (callData) {
        setCallStats({
          synced: callData.filter((c: any) => c.maestro_synced === true).length,
          total: callData.length,
          hasMaestroId: callData.filter((c: any) => c.maestro_call_id).length,
        });
      }

      setLastRefresh(new Date());
    } catch (e: any) {
      console.error("[PAMaestroDashboard]", e);
    } finally {
      setLoading(false);
    }
  }, [hours, callFilter, dealFilter]);

  const fetchQueueState = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("pp-call-queue", {
        body: { action: "status" },
      });
      if (error) return;
      setQueueState(data as QueueState);
    } catch {
      // queue function may not be deployed
    }
  }, []);

  // Initial load + 10s polling
  useEffect(() => {
    fetchData();
    fetchQueueState();
    intervalRef.current = setInterval(fetchData, 10_000);
    queueIntervalRef.current = setInterval(fetchQueueState, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (queueIntervalRef.current) clearInterval(queueIntervalRef.current);
    };
  }, [fetchData, fetchQueueState]);

  // ── Derived data ────────────────────────────────────────

  const filteredLogs = useMemo(() => {
    let r = logs;
    if (dealFilter.trim()) {
      const q = dealFilter.trim().toLowerCase();
      r = r.filter((l) => {
        try {
          return JSON.stringify(l.payload ?? "").toLowerCase().includes(q)
            || (l.call_id ?? "").toLowerCase().includes(q);
        } catch {
          return false;
        }
      });
    }
    if (stepFilter !== "all") r = r.filter((l) => l.step === stepFilter);
    if (httpFilter !== "all") {
      r = r.filter((l) => {
        const s = l.http_status ?? 0;
        if (httpFilter === "4xx") return s >= 400 && s < 500;
        if (httpFilter === "5xx") return s >= 500;
        return true;
      });
    }
    return r;
  }, [logs, stepFilter, httpFilter, dealFilter]);

  const errorBreakdown = useMemo(() => {
    const counts: Record<string, number> = { maestro_404: 0, maestro_put_404: 0, maestro_500: 0, other: 0 };
    for (const log of filteredLogs) {
      if (log.status !== "error" && log.status !== "skipped") continue;
      counts[classifyError(log.error_message)]++;
    }
    return Object.entries(counts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
  }, [filteredLogs]);

  const timelineData = useMemo(() => {
    const buckets = Math.min(hours, 24);
    const bucketSize = (hours * 3600_000) / buckets;
    const now = Date.now();
    const data: Array<{ time: string; success: number; error: number }> = [];
    for (let i = buckets - 1; i >= 0; i--) {
      const start = now - i * bucketSize;
      const end = start + bucketSize;
      const bucketLogs = filteredLogs.filter((l) => {
        const ts = new Date(l.created_at).getTime();
        return ts >= start && ts < end;
      });
      data.push({
        time: new Date(start).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" }),
        success: bucketLogs.filter((l) => l.status === "success").length,
        error: bucketLogs.filter((l) => l.status === "error" || l.status === "skipped").length,
      });
    }
    return data;
  }, [filteredLogs, hours, lang]);

  const pipelineSteps = useMemo(() => {
    const steps = ["cdr", "cdr_sync", "recording", "recording_push", "transcription", "transcript", "ai_summary", "ai_summary_push", "ai_analysis", "sms", "maestro_sync"];
    const data: Array<{ step: string; success: number; error: number }> = [];
    for (const s of steps) {
      const matching = filteredLogs.filter((l) => l.step === s || l.step?.startsWith(s));
      if (matching.length === 0) continue;
      data.push({
        step: STEP_LABELS[s]?.[lang] ?? s,
        success: matching.filter((l) => l.status === "success").length,
        error: matching.filter((l) => l.status === "error" || l.status === "skipped").length,
      });
    }
    return data;
  }, [filteredLogs, lang]);

  const endpointMetrics = useMemo(() => {
    const byEndpoint = new Map<string, { total: number; ok: number; errors: number }>();
    for (const log of syncLogs) {
      // Normalize endpoint: strip IDs from the path
      const ep = (log.maestro_endpoint ?? log.action ?? "unknown")
        .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/{id}")
        .replace(/\/\d{4,}/g, "/{broker}")
        .replace(/\?machine=1$/, "");
      const m = byEndpoint.get(ep) ?? { total: 0, ok: 0, errors: 0 };
      m.total++;
      if (log.success) m.ok++;
      else m.errors++;
      byEndpoint.set(ep, m);
    }
    return Array.from(byEndpoint.entries())
      .map(([endpoint, m]) => ({
        endpoint: endpoint.length > 40 ? "…" + endpoint.slice(-38) : endpoint,
        rate: m.total > 0 ? Math.round((m.ok / m.total) * 100) : 0,
        total: m.total,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [syncLogs]);

  // Proxy health over time (bucketed like the sync timeline)
  const proxyTimeline = useMemo(() => {
    const buckets = Math.min(hours, 24);
    const bucketSize = (hours * 3600_000) / buckets;
    const now = Date.now();
    const data: Array<{ time: string; ok: number; bad_gateway: number; timeout: number; other: number }> = [];
    for (let i = buckets - 1; i >= 0; i--) {
      const start = now - i * bucketSize;
      const end = start + bucketSize;
      const rows = proxyHealth.filter((r) => {
        const ts = new Date(r.created_at).getTime();
        return ts >= start && ts < end;
      });
      data.push({
        time: new Date(start).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" }),
        ok: rows.filter((r) => r.outcome === "ok").length,
        bad_gateway: rows.filter((r) => r.outcome === "bad_gateway" || r.status_code === 502).length,
        timeout: rows.filter((r) => r.outcome === "timeout").length,
        other: rows.filter((r) => r.outcome !== "ok" && r.outcome !== "timeout" && r.outcome !== "bad_gateway" && r.status_code !== 502).length,
      });
    }
    return data;
  }, [proxyHealth, hours, lang]);

  const proxyStats = useMemo(() => {
    const total = proxyHealth.length;
    const failed = proxyHealth.filter((r) => (r.status_code ?? 0) >= 400).length;
    return { total, failed, rate: total > 0 ? Math.round((failed / total) * 100) : 0 };
  }, [proxyHealth]);

  // AI provider usage over time
  const aiTimeline = useMemo(() => {
    const buckets = Math.min(hours, 24);
    const bucketSize = (hours * 3600_000) / buckets;
    const now = Date.now();
    const data: Array<{ time: string; claude: number; openai: number }> = [];
    for (let i = buckets - 1; i >= 0; i--) {
      const start = now - i * bucketSize;
      const end = start + bucketSize;
      const rows = aiUsage.filter((r) => {
        const ts = new Date(r.created_at).getTime();
        return ts >= start && ts < end;
      });
      data.push({
        time: new Date(start).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" }),
        claude: rows.filter((r) => r.provider === "claude").length,
        openai: rows.filter((r) => r.provider === "openai").length,
      });
    }
    return data;
  }, [aiUsage, hours, lang]);

  const aiByEndpoint = useMemo(() => {
    const map = new Map<string, { claude: number; openai: number }>();
    for (const r of aiUsage) {
      const key = r.endpoint || "unknown";
      const m = map.get(key) ?? { claude: 0, openai: 0 };
      if (r.provider === "openai") m.openai++;
      else m.claude++;
      map.set(key, m);
    }
    return Array.from(map.entries())
      .map(([endpoint, m]) => ({ endpoint, ...m, total: m.claude + m.openai }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [aiUsage]);

  const failoverRate = useMemo(() => {
    const total = aiUsage.length;
    if (!total) return 0;
    return Math.round((aiUsage.filter((r) => r.provider === "openai").length / total) * 100);
  }, [aiUsage]);

  const recentErrors = useMemo(
    () => filteredLogs.filter((l) => l.status === "error" || l.status === "skipped").slice(0, 25),
    [filteredLogs],
  );

  const apiStats = useMemo(() => {
    const ok = syncLogs.filter((s) => s.success).length;
    const total = syncLogs.length;
    const avgMs = syncLogs.length > 0
      ? Math.round(syncLogs.reduce((sum, s) => sum + (s.duration_ms ?? 0), 0) / syncLogs.length)
      : 0;
    return { ok, total, avgMs, rate: total > 0 ? Math.round((ok / total) * 100) : 0 };
  }, [syncLogs]);

  const { smsCount, smsOkCount } = useMemo(() => {
    const smsLogs = syncLogs.filter((s) => {
      const act = (s.action ?? "").toLowerCase();
      const ep = (s.maestro_endpoint ?? "").toLowerCase();
      return act.includes("sms") || act.includes("message") || ep.includes("sms") || ep.includes("message");
    });
    return { smsCount: smsLogs.length, smsOkCount: smsLogs.filter((s) => s.success).length };
  }, [syncLogs]);

  // ── Actions ──────────────────────────────────────────────

  const handleProcessQueue = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("pp-call-queue", { body: { action: "process" } });
      if (error) throw error;
      toast.success(`Queue: ${(data as any)?.done ?? 0} done, ${(data as any)?.retried ?? 0} retried`);
      fetchQueueState();
    } catch (e: any) {
      toast.error(e?.message ?? "process_failed");
    }
  };

  const handleResume = async () => {
    try {
      const { error } = await supabase.functions.invoke("pp-call-queue", { body: { action: "resume" } });
      if (error) throw error;
      toast.success(lang === "fr" ? "File reprise" : "Queue resumed");
      fetchQueueState();
    } catch (e: any) {
      toast.error(e?.message ?? "resume_failed");
    }
  };

  const handleAudit = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("pp-connection-audit", {
        body: { notify: true, limit: 500 },
      });
      if (error) throw error;
      toast.success(t.auditStarted);
    } catch (e: any) {
      toast.error(e?.message ?? "audit_failed");
    }
  };

  const isPaused = queueState?.state === "paused";
  const syncRate = callStats.total > 0 ? Math.round((callStats.synced / callStats.total) * 100) : 0;
  const totalErrors = filteredLogs.filter((l) => l.status === "error" || l.status === "skipped").length;
  const edgeErrors = edgeRuns.filter((e) => e.status === "error").length;

  return (
    <PAPage>
      <PAPageHeader icon={<Activity className="w-5 h-5" />} title={t.title} subtitle={`${t.subtitle} · ${lastRefresh.toLocaleTimeString(lang)} · ${loading ? t.loading : `${filteredLogs.length} logs`}`} actions={
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="bg-card border rounded-md px-3 py-1.5 text-sm"
          >
            {TIME_RANGES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <Button onClick={fetchData} disabled={loading} variant="outline" size="sm">
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            {t.refresh}
          </Button>
          <Button onClick={handleAudit} variant="outline" size="sm">
            <Radio className="w-4 h-4 mr-1.5" />
            {t.runAudit}
          </Button>
        </div>}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">{t.syncRate}</span>
              <TrendingUp className="w-4 h-4" style={{ color: syncRate >= 80 ? SUCCESS : WARNING }} />
            </div>
            <div className="text-2xl font-bold" style={{ color: syncRate >= 80 ? SUCCESS : WARNING }}>
              {syncRate}%
            </div>
            <div className="text-xs text-muted-foreground">{callStats.synced}/{callStats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">{t.callsSynced}</span>
              <CheckCircle2 className="w-4 h-4" style={{ color: SUCCESS }} />
            </div>
            <div className="text-2xl font-bold">{callStats.synced}</div>
            <div className="text-xs text-muted-foreground">{t.hasMaestroId}: {callStats.hasMaestroId}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">{t.smsPushed}</span>
              <Send className="w-4 h-4" style={{ color: ACCENT }} />
            </div>
            <div className="text-2xl font-bold">{smsCount}</div>
            <div className="text-xs text-muted-foreground">{smsCount > 0 ? `${smsOkCount} OK` : t.noData}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">{t.commissionsSynced}</span>
              <CheckCircle2 className="w-4 h-4" style={{ color: commissionDiag.filter(d => d.connected).length > 0 ? SUCCESS : DANGER }} />
            </div>
            <div className="text-2xl font-bold">{commissionDiag.filter(d => d.connected).length}</div>
            <div className="text-xs text-muted-foreground">/ {commissionDiag.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">{t.queue}</span>
              <Zap className="w-4 h-4" style={{ color: (queueState?.queue.pending ?? 0) > 0 ? WARNING : SUCCESS }} />
            </div>
            <div className="text-2xl font-bold" style={{ color: (queueState?.queue.pending ?? 0) > 0 ? WARNING : SUCCESS }}>
              {queueState?.queue.pending ?? 0}
            </div>
            <div className="text-xs text-muted-foreground">
              {queueState?.queue.done ?? 0} {t.done} · {queueState?.queue.dead ?? 0} {t.dead}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">{t.errors24h}</span>
              <XCircle className="w-4 h-4" style={{ color: totalErrors > 0 ? DANGER : SUCCESS }} />
            </div>
            <div className="text-2xl font-bold" style={{ color: totalErrors > 0 ? DANGER : SUCCESS }}>
              {totalErrors}
            </div>
            <div className="text-xs text-muted-foreground">{apiStats.total} {t.apiCalls}</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t.syncActivity}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={timelineData}>
                <defs>
                  <linearGradient id="gradSuccess" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SUCCESS} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={SUCCESS} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradError" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={DANGER} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={DANGER} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="success" name={t.success} stroke={SUCCESS} fill="url(#gradSuccess)" strokeWidth={2} />
                <Area type="monotone" dataKey="error" name={t.error} stroke={DANGER} fill="url(#gradError)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t.errorBreakdown}</CardTitle>
          </CardHeader>
          <CardContent>
            {errorBreakdown.length === 0 ? (
              <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">
                <CheckCircle2 className="w-5 h-5 mr-2" style={{ color: SUCCESS }} />
                {t.noData}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={errorBreakdown}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                  >
                    {errorBreakdown.map((entry) => (
                      <Cell key={entry.name} fill={ERROR_COLORS[entry.name] ?? "#888"} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t.pipelineHealth}</CardTitle>
          </CardHeader>
          <CardContent>
            {pipelineSteps.length === 0 ? (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">{t.noData}</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={pipelineSteps}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="step" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="success" name={t.success} fill={SUCCESS} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="error" name={t.error} fill={DANGER} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t.perEndpoint}</CardTitle>
          </CardHeader>
          <CardContent>
            {endpointMetrics.length === 0 ? (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">{t.noData}</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={endpointMetrics} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" unit="%" />
                  <YAxis type="category" dataKey="endpoint" tick={{ fontSize: 9 }} stroke="var(--muted-foreground)" width={120} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                  <Bar dataKey="rate" name="%" radius={[0, 4, 4, 0]}>
                    {endpointMetrics.map((entry, i) => (
                      <Cell key={i} fill={entry.rate >= 90 ? SUCCESS : entry.rate >= 70 ? WARNING : DANGER} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Proxy health + AI failover */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Server className="w-4 h-4" style={{ color: WARNING }} />
              {t.proxyHealth}
              <Badge variant={proxyStats.rate > 10 ? "destructive" : "secondary"} className="ml-1 text-xs">
                {t.proxyRate}: {proxyStats.rate}%
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {proxyHealth.length === 0 ? (
              <p className="text-sm text-muted-foreground py-10 text-center">{t.noData}</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={proxyTimeline}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="time" fontSize={11} />
                  <YAxis fontSize={11} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="ok" name={t.proxyOk} stackId="1" stroke={SUCCESS} fill={SUCCESS} fillOpacity={0.25} />
                  <Area type="monotone" dataKey="bad_gateway" name={t.proxy502} stackId="1" stroke={DANGER} fill={DANGER} fillOpacity={0.35} />
                  <Area type="monotone" dataKey="timeout" name={t.proxyTimeout} stackId="1" stroke={WARNING} fill={WARNING} fillOpacity={0.35} />
                  <Area type="monotone" dataKey="other" name={t.proxyOther} stackId="1" stroke={PURPLE} fill={PURPLE} fillOpacity={0.25} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="w-4 h-4" style={{ color: PURPLE }} />
              {t.aiFailover}
              <Badge variant={failoverRate > 25 ? "destructive" : "secondary"} className="ml-1 text-xs">
                {t.failoverRate}: {failoverRate}%
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {aiUsage.length === 0 ? (
              <p className="text-sm text-muted-foreground py-10 text-center">{t.noData}</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={aiTimeline}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="time" fontSize={11} />
                  <YAxis fontSize={11} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="claude" name={t.claude} stackId="1" stroke={ACCENT} fill={ACCENT} fillOpacity={0.3} />
                  <Area type="monotone" dataKey="openai" name={t.openai} stackId="1" stroke={WARNING} fill={WARNING} fillOpacity={0.35} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* AI usage per endpoint */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{t.aiByEndpoint}</CardTitle>
        </CardHeader>
        <CardContent>
          {aiByEndpoint.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">{t.noData}</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, aiByEndpoint.length * 38)}>
              <BarChart data={aiByEndpoint} layout="vertical" margin={{ left: 90 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis type="number" fontSize={11} allowDecimals={false} />
                <YAxis type="category" dataKey="endpoint" fontSize={11} width={140} />
                <Tooltip />
                <Legend />
                <Bar dataKey="claude" name={t.claude} stackId="a" fill={ACCENT} radius={[0, 0, 0, 0]} />
                <Bar dataKey="openai" name={t.openai} stackId="a" fill={WARNING} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Circuit breaker + queue controls */}
      <Card>
        <CardContent className="py-4 px-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              {isPaused ? (
                <Badge variant="destructive" className="flex items-center gap-1">
                  <Pause className="w-3 h-3" />
                  {t.paused}
                </Badge>
              ) : (
                <Badge variant="secondary" className="flex items-center gap-1 bg-green-500/10 text-green-600">
                  <Play className="w-3 h-3" />
                  {t.active}
                </Badge>
              )}
              {isPaused && (
                <span className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {queueState?.paused_reason ?? t.circuitBreaker}
                </span>
              )}
              <div className="flex gap-4 text-sm">
                <span><strong>{queueState?.queue.pending ?? 0}</strong> {t.pending}</span>
                <span><strong style={{ color: SUCCESS }}>{queueState?.queue.done ?? 0}</strong> {t.done}</span>
                <span><strong style={{ color: DANGER }}>{queueState?.queue.dead ?? 0}</strong> {t.dead}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleProcessQueue} variant="outline" size="sm">
                <RefreshCw className="w-3 h-3 mr-1" />
                {t.processQueue}
              </Button>
              {isPaused && (
                <Button onClick={handleResume} variant="outline" size="sm">
                  <Play className="w-3 h-3 mr-1" />
                  {t.resume}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Commission sync table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Server className="w-4 h-4" style={{ color: ACCENT }} />
            {t.commissionSync}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {commissionDiag.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t.noData}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 px-2">{t.broker}</th>
                    <th className="py-2 px-2">{t.connected}</th>
                    <th className="py-2 px-2 text-right">{t.rows}</th>
                    <th className="py-2 px-2">{t.lastOk}</th>
                    <th className="py-2 px-2">{t.httpStatus}</th>
                    <th className="py-2 px-2">{t.reason}</th>
                  </tr>
                </thead>
                <tbody>
                  {commissionDiag.map((d) => (
                    <tr key={d.id} className="border-b hover:bg-muted/50">
                      <td className="py-1.5 px-2">{d.broker_label ?? d.broker_email ?? t.none}</td>
                      <td className="py-1.5 px-2">
                        <Badge variant="secondary" className={d.connected ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"}>
                          {d.connected ? t.brokerOk : t.brokerDisconnected}
                        </Badge>
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono">{d.rows_count ?? 0}</td>
                      <td className="py-1.5 px-2 text-xs text-muted-foreground">
                        {d.last_ok_at ? new Date(d.last_ok_at).toLocaleString(lang) : t.none}
                      </td>
                      <td className="py-1.5 px-2 text-xs">
                        {d.http_status ? (
                          <span style={{ color: d.http_status >= 400 ? DANGER : SUCCESS }}>{d.http_status}</span>
                        ) : t.none}
                      </td>
                      <td className="py-1.5 px-2 text-xs text-muted-foreground">{d.reason ?? t.none}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edge function health */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="w-4 h-4" style={{ color: WARNING }} />
            {t.edgeFunctions}
            {edgeErrors > 0 && (
              <Badge variant="destructive" className="text-xs">{edgeErrors}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {edgeRuns.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t.noData}</p>
          ) : (
            <div className="overflow-x-auto max-h-48 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground sticky top-0 bg-card">
                    <th className="py-1.5 px-2">{t.functionName}</th>
                    <th className="py-1.5 px-2">{t.status}</th>
                    <th className="py-1.5 px-2">{t.duration}</th>
                    <th className="py-1.5 px-2">{t.errorMessage}</th>
                    <th className="py-1.5 px-2">{t.time}</th>
                  </tr>
                </thead>
                <tbody>
                  {edgeRuns.map((e) => {
                    const dur = e.finished_at
                      ? Math.round(new Date(e.finished_at).getTime() - new Date(e.started_at).getTime())
                      : null;
                    return (
                      <tr key={e.id} className="border-b hover:bg-muted/50">
                        <td className="py-1 px-2 font-mono text-xs">{e.function_name}</td>
                        <td className="py-1 px-2">
                          <Badge variant="secondary" className={e.status === "error" ? "bg-red-500/10 text-red-600" : "bg-green-500/10 text-green-600"}>
                            {e.status}
                          </Badge>
                        </td>
                        <td className="py-1 px-2 text-xs text-muted-foreground">{dur != null ? `${dur}ms` : "—"}</td>
                        <td className="py-1 px-2 text-xs text-muted-foreground max-w-xs truncate">{e.error ?? "—"}</td>
                        <td className="py-1 px-2 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(e.started_at).toLocaleTimeString(lang)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          placeholder={t.filterByCall}
          value={callFilter}
          onChange={(e) => setCallFilter(e.target.value)}
          className="w-52"
          onKeyDown={(e) => e.key === "Enter" && fetchData()}
        />
        <Input
          placeholder={t.filterByDeal}
          value={dealFilter}
          onChange={(e) => setDealFilter(e.target.value)}
          className="w-52"
          onKeyDown={(e) => e.key === "Enter" && fetchData()}
        />
        <select
          value={stepFilter}
          onChange={(e) => setStepFilter(e.target.value)}
          className="bg-card border rounded-md px-3 py-1.5 text-sm"
        >
          <option value="all">{t.all} — {t.step}</option>
          <option value="cdr">CDR</option>
          <option value="recording">{lang === "fr" ? "Enregistrement" : "Recording"}</option>
          <option value="transcription">Transcription</option>
          <option value="ai_summary">AI summary</option>
          <option value="maestro_sync">Maestro sync</option>
        </select>
        <select
          value={httpFilter}
          onChange={(e) => setHttpFilter(e.target.value)}
          className="bg-card border rounded-md px-3 py-1.5 text-sm"
        >
          <option value="all">{t.all} — HTTP</option>
          <option value="4xx">4xx</option>
          <option value="5xx">5xx</option>
        </select>
        <Button variant="ghost" size="sm" onClick={() => { setCallFilter(""); setDealFilter(""); setStepFilter("all"); setHttpFilter("all"); }}>
          {t.clear}
        </Button>
      </div>

      {/* Error log */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="w-4 h-4" />
            {t.recentErrors}
            {totalErrors > 0 && <Badge variant="destructive" className="text-xs">{totalErrors}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentErrors.length === 0 ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
              <CheckCircle2 className="w-5 h-5" style={{ color: SUCCESS }} />
              {t.noData}
            </div>
          ) : (
            <div className="space-y-1.5 max-h-96 overflow-y-auto">
              {recentErrors.map((log) => (
                <div key={log.id} className="flex items-start gap-2 p-2 rounded-md border text-xs hover:bg-muted/50">
                  <Badge
                    variant="secondary"
                    className={
                      (log.http_status ?? 0) >= 500
                        ? "bg-red-500/10 text-red-600"
                        : (log.http_status ?? 0) >= 400
                          ? "bg-orange-500/10 text-orange-600"
                          : "bg-muted"
                    }
                  >
                    {log.http_status ?? log.status}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono truncate">
                      {log.correlation_id ?? log.call_id?.slice(0, 8) ?? "—"} · {log.step}
                    </div>
                    <div className="text-muted-foreground truncate">
                      {log.endpoint ?? "—"} — {log.error_message ?? "—"}
                    </div>
                  </div>
                  <span className="text-muted-foreground whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString(lang)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </PAPage>
  );
}
