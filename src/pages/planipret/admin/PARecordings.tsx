import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mic, Sparkles, RefreshCw } from "lucide-react";
import Pagination from "@/components/planipret/admin/Pagination";
import DebugPanel, { type DebugEntry } from "@/components/planipret/admin/DebugPanel";
import { TableErrorState, TableEmptyState } from "@/components/planipret/admin/TableStates";
import { getPlanipretBrokerDirectory } from "@/lib/planipret/adminDirectory";
import { usePlanipretNsAutoSync } from "@/hooks/usePlanipretNsAutoSync";
import NsSyncBar from "@/components/planipret/admin/NsSyncBar";
import AvaCallRecordingsPanel from "@/components/planipret/admin/ava/AvaCallRecordingsPanel";
import RecordingDetailDrawer from "@/components/planipret/recordings/RecordingDetailDrawer";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import PPPageBanner from "@/components/planipret/analytics/PPPageBanner";
import PPActivityCharts from "@/components/planipret/analytics/PPActivityCharts";
import ppBanner from "@/assets/planipret/banner-recordings.jpg";

const ACCENT = "#2E9BDC";
const AGENT = "#9B7FE8";

const DICT = {
  fr: {
    tabPbx: "Enregistrements PBX",
    tabAva: "Agent AVA (IA)",
    processAll: "⚡ Traiter tous les enregistrements",
    queuingAll: "Mise en file de tous les enregistrements…",
    noneQueued: "Aucun appel en attente de traitement",
    queued: (n: number) => `${n} appels en cours de traitement en arrière-plan. La liste se met à jour au fur et à mesure.`,
    backfillFailed: (e: string) => `Backfill échoué: ${e}`,
    backfillLabel: "Backfill enregistrements",
    searchPlaceholder: "Rechercher numéro ou extension…",
    allBrokers: "Tous courtiers",
    transcriptAll: "Transcription : tous",
    transcriptYes: "Avec transcription",
    transcriptNo: "Sans transcription",
    reset: (n: number) => `✕ Réinitialiser (${n})`,
    thBroker: "Courtier",
    thExt: "Ext.",
    thFrom: "De",
    thTo: "Vers",
    thDuration: "Durée",
    thDate: "Date",
    thTranscript: "Transcription",
    thSummary: "Résumé & thèmes",
    available: "● Disponible",
    pending: "⏳ En attente",
    action: (n: number) => `✓ ${n} action${n > 1 ? "s" : ""}`,
    emptyTitle: "Aucun enregistrement trouvé",
    emptyHintFiltered: "Essayez d'élargir vos critères de recherche.",
    emptyHintDefault: "Aucun enregistrement n'est encore synchronisé. La synchronisation NS-API est automatique · vérifiez que les enregistrements sont activés dans la config NetSapiens.",
    resetFilters: "Réinitialiser les filtres",
    goToIntegrations: "Aller aux intégrations →",
    pageUnit: "enregistrements",
    detailTitle: "Enregistrement",
    broker: "Courtier",
    extDirStatus: (ext: string, dir: string, status: string) => `Ext: ${ext} · Direction: ${dir} · Statut: ${status}`,
    fromTo: (from: string, to: string) => `De: ${from} → Vers: ${to}`,
    dateDuration: (date: string, dur: string) => `Date: ${date} · Durée: ${dur}`,
    nsCallid: (id: string) => `NS callid: ${id}`,
    statusSynced: "Synchronisé",
    statusAnalyzed: "Analysé",
    statusTranscribed: "Transcrit",
    statusPending: "En attente",
    analyzedAt: (ts: string) => `analyzed_at: ${ts}`,
    src: (s: string) => `src: ${s}`,
    audioStreamed: "● Audio streamé depuis NS-API",
    audioMeta: "Audio meta:",
    loadingAudio: "Chargement de l'audio depuis NS-API…",
    voicemailNotice: "📵 Appel non enregistré (VMail ou appel manqué)",
    audioLabel: "Audio",
    download: "Télécharger",
    recordingNotFound: "Enregistrement introuvable sur NS-API.",
    retry: "Réessayer",
    aiCorrectedTranscript: "Transcription corrigée par l'IA",
    analyzedBadge: "● Analysé",
    speaker: "Speaker",
    rawNsVersion: "Version brute NetSapiens",
    coachingAnalysis: "Analyse coaching AVA",
    coachQueued: "En attente",
    coachRunning: "En cours",
    coachError: "Erreur",
    coachDone: "Terminé",
    coachQueuedMsg: "En file — préparation du contexte…",
    coachRunningMsg: (s: number) => `AVA analyse et corrige la transcription… (${s}s)`,
    coachErrorMsg: "Analyse échouée — vous pouvez réessayer.",
    retryAnalysis: "Réessayer l'analyse",
    transcription: "Transcription",
    transcriptPendingMsg: (n: number) => `Transcription pas encore prête côté système téléphonique — tentative auto en cours (essai ${n})…`,
    transcriptLoading: "Chargement de la transcription depuis NS-API…",
    transcriptLoadError: "❌ Impossible de charger la transcription",
    transcriptUnavailable: "⚠️ Transcription non trouvée — Diagnostic",
    aiCoaching: "Coaching IA",
    score: "Score :",
    strengths: "Points forts :",
    improvements: "À améliorer :",
    nextSteps: "Prochaines étapes :",
    aiSummary: "Résumé IA",
    topics: "Thèmes abordés",
    actionsToDo: "Actions à faire",
    brokerLabel: "Courtier",
    clientLabel: "Client",
    syncLaunched: (n: number) => `Synchro lancée: ${n} ext · appels/enregistrements en arrière-plan`,
    syncFailed: (e: string) => `Synchro échouée: ${e}`,
    recordingLoaded: "Enregistrement chargé",
    fetchFailed: (e: string) => `Récupération échouée: ${e}`,
    coachingFailed: (e: string) => `Coaching échoué: ${e}`,
    coachingGenerated: (s: string) => `Coaching généré (score ${s}/100)`,
    missingCallId: "Identifiant d'appel manquant — resynchroniser le CDR",
    processingRecording: (s: string, kb: string) => `Enregistrement en traitement (status: ${s}, taille: ${kb} kB)`,
    noRecordingAvailable: "Aucun enregistrement disponible pour cet appel.",
    idsTested: (ids: string) => `IDs testés: ${ids}`,
    noRecordingNsApi: "Aucun enregistrement disponible côté NS-API",
  },
  en: {
    tabPbx: "PBX recordings",
    tabAva: "AVA Agent (AI)",
    processAll: "⚡ Process all recordings",
    queuingAll: "Queuing all recordings…",
    noneQueued: "No calls awaiting processing",
    queued: (n: number) => `${n} calls being processed in the background. The list will update as they complete.`,
    backfillFailed: (e: string) => `Backfill failed: ${e}`,
    backfillLabel: "Recording backfill",
    searchPlaceholder: "Search number or extension…",
    allBrokers: "All brokers",
    transcriptAll: "Transcript: all",
    transcriptYes: "With transcript",
    transcriptNo: "Without transcript",
    reset: (n: number) => `✕ Reset (${n})`,
    thBroker: "Broker",
    thExt: "Ext.",
    thFrom: "From",
    thTo: "To",
    thDuration: "Duration",
    thDate: "Date",
    thTranscript: "Transcript",
    thSummary: "Summary & topics",
    available: "● Available",
    pending: "⏳ Pending",
    action: (n: number) => `✓ ${n} action${n > 1 ? "s" : ""}`,
    emptyTitle: "No recording found",
    emptyHintFiltered: "Try widening your search criteria.",
    emptyHintDefault: "No recording has been synced yet. NS-API sync is automatic · check that recordings are enabled in the NetSapiens config.",
    resetFilters: "Reset filters",
    goToIntegrations: "Go to integrations →",
    pageUnit: "recordings",
    detailTitle: "Recording",
    broker: "Broker",
    extDirStatus: (ext: string, dir: string, status: string) => `Ext: ${ext} · Direction: ${dir} · Status: ${status}`,
    fromTo: (from: string, to: string) => `From: ${from} → To: ${to}`,
    dateDuration: (date: string, dur: string) => `Date: ${date} · Duration: ${dur}`,
    nsCallid: (id: string) => `NS callid: ${id}`,
    statusSynced: "Synced",
    statusAnalyzed: "Analyzed",
    statusTranscribed: "Transcribed",
    statusPending: "Pending",
    analyzedAt: (ts: string) => `analyzed_at: ${ts}`,
    src: (s: string) => `src: ${s}`,
    audioStreamed: "● Audio streamed from NS-API",
    audioMeta: "Audio meta:",
    loadingAudio: "Loading audio from NS-API…",
    voicemailNotice: "📵 Call not recorded (VMail or missed call)",
    audioLabel: "Audio",
    download: "Download",
    recordingNotFound: "Recording not found on NS-API.",
    retry: "Retry",
    aiCorrectedTranscript: "AI-corrected transcript",
    analyzedBadge: "● Analyzed",
    speaker: "Speaker",
    rawNsVersion: "Raw NetSapiens version",
    coachingAnalysis: "AVA coaching analysis",
    coachQueued: "Queued",
    coachRunning: "Running",
    coachError: "Error",
    coachDone: "Done",
    coachQueuedMsg: "Queued — preparing context…",
    coachRunningMsg: (s: number) => `AVA is analyzing and correcting the transcript… (${s}s)`,
    coachErrorMsg: "Analysis failed — you can try again.",
    retryAnalysis: "Retry analysis",
    transcription: "Transcript",
    transcriptPendingMsg: (n: number) => `Transcript not ready yet on the phone system — automatic retry in progress (attempt ${n})…`,
    transcriptLoading: "Loading transcript from NS-API…",
    transcriptLoadError: "❌ Unable to load transcript",
    transcriptUnavailable: "⚠️ Transcript not found — Diagnostic",
    aiCoaching: "AI coaching",
    score: "Score:",
    strengths: "Strengths:",
    improvements: "To improve:",
    nextSteps: "Next steps:",
    aiSummary: "AI summary",
    topics: "Topics discussed",
    actionsToDo: "Action items",
    brokerLabel: "Broker",
    clientLabel: "Client",
    syncLaunched: (n: number) => `Sync started: ${n} ext · calls/recordings in background`,
    syncFailed: (e: string) => `Sync failed: ${e}`,
    recordingLoaded: "Recording loaded",
    fetchFailed: (e: string) => `Fetch failed: ${e}`,
    coachingFailed: (e: string) => `Coaching failed: ${e}`,
    coachingGenerated: (s: string) => `Coaching generated (score ${s}/100)`,
    missingCallId: "Missing call ID — resync the CDR",
    processingRecording: (s: string, kb: string) => `Recording processing (status: ${s}, size: ${kb} kB)`,
    noRecordingAvailable: "No recording available for this call.",
    idsTested: (ids: string) => `IDs tested: ${ids}`,
    noRecordingNsApi: "No recording available from NS-API",
  },
};

export default function PARecordings() {
  const { lang } = useMplanipretLang();
  const t = DICT[lang];
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);
  const pageSizeRaw = parseInt(params.get("pageSize") ?? params.get("ps") ?? "25", 10);
  const pageSize = [25, 50, 100].includes(pageSizeRaw) ? pageSizeRaw : 25;
  const search = params.get("search") ?? "";
  const broker = params.get("broker") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const withTranscript = (params.get("transcript") ?? "") as "" | "yes" | "no";
  const updateParams = (patch: Record<string, string | null>, resetPage = false) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => { if (v == null || v === "") next.delete(k); else next.set(k, v); });
    if (resetPage) next.set("page", "1");
    setParams(next, { replace: true });
  };
  const setPage = (p: number) => updateParams({ page: String(p) });
  const setPageSize = (s: number) => updateParams({ pageSize: String(s), ps: null }, true);
  const setFilterValue = (key: "search" | "broker" | "from" | "to" | "transcript", value: string) => updateParams({ [key]: value }, true);
  const resetFilters = () => updateParams({ search: null, broker: null, from: null, to: null, transcript: null }, true);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [brokers, setBrokers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [debug, setDebug] = useState<DebugEntry[]>([]);
  const [detail, setDetail] = useState<any | null>(null);

  const hasFilters = !!(search || broker || from || to || withTranscript);
  const activeFilterCount = [search, broker, from, to, withTranscript].filter(Boolean).length;

  useEffect(() => {
    (async () => {
      const directory = await getPlanipretBrokerDirectory();
      setBrokers(directory.brokers);
    })();
  }, []);

  const brokerName = (r: any) => r.planipret_profiles?.full_name ?? r.metadata?.ns_user?.name ?? r.metadata?.user_name ?? r.metadata?.extension_name ?? (r.extension ? `Ext. ${r.extension}` : "—");

  const load = async (p = page, ps = pageSize) => {
    setLoading(true);
    setLoadError(null);
    const dbg: DebugEntry[] = [];
    const t0 = performance.now();
    const fromIdx = (p - 1) * ps;
    let q: any = supabase
      .from("planipret_phone_calls")
      .select("*, planipret_profiles(full_name, extension)", { count: "exact" })
      .not("to_number", "ilike", "%vmail%")
      .not("to_number", "ilike", "%voicemail%")
      .not("to_number", "ilike", "%vm@%")
      .or("has_recording.eq.true,ns_callid.not.is.null")
      .order("started_at", { ascending: false })
      .range(fromIdx, fromIdx + ps - 1);
    if (search) q = q.or(`from_number.ilike.%${search}%,to_number.ilike.%${search}%,extension.ilike.%${search}%`);
    if (broker?.startsWith("ext:")) q = q.eq("extension", broker.slice(4));
    else if (broker?.startsWith("user:")) q = q.eq("user_id", broker.slice(5));
    if (from) q = q.gte("started_at", from);
    if (to) q = q.lte("started_at", to);
    if (withTranscript === "yes") q = q.not("transcript", "is", null);
    if (withTranscript === "no") q = q.is("transcript", null);
    const { data, count, error } = await q;
    dbg.push({
      label: "planipret_phone_calls WHERE recording_url IS NOT NULL",
      query: `SELECT * FROM planipret_phone_calls WHERE recording_url IS NOT NULL ORDER BY started_at DESC LIMIT ${ps} OFFSET ${fromIdx}`,
      count,
      ms: Math.round(performance.now() - t0),
      error: error?.message ?? null,
      meta: { search, broker, from, to, withTranscript },
      sample: (data ?? []).slice(0, 3),
    });
    if (error) {
      setLoadError(error.message);
      setRows([]); setTotal(0);
    } else {
      setRows(data ?? []);
      setTotal(count ?? 0);
    }
    setDebug(dbg);
    setLoading(false);
  };

  usePlanipretNsAutoSync({ enabled: false });

  useEffect(() => { load(page, pageSize); /* eslint-disable-next-line */ }, [page, pageSize, search, broker, from, to, withTranscript]);

  // Realtime: throttled reload (max once per 30s) to avoid flicker on our own AI writes
  const pageRef = useRef({ page, pageSize });
  pageRef.current = { page, pageSize };
  useEffect(() => {
    let last = Date.now();
    let pending: ReturnType<typeof setTimeout> | null = null;
    const trigger = () => {
      const wait = Math.max(2000, 30_000 - (Date.now() - last));
      if (pending) return;
      pending = setTimeout(() => {
        last = Date.now(); pending = null;
        load(pageRef.current.page, pageRef.current.pageSize);
      }, wait);
    };
    const ch = supabase.channel("admin-recordings")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "planipret_phone_calls" }, trigger)
      .subscribe();
    return () => { if (pending) clearTimeout(pending); supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, []);

  const syncAll = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("pp-admin-ns-sync", { body: {} });
      if (error) throw error;
      const d = data as any;
      toast.success(t.syncLaunched(d.extensions ?? d.users_total ?? 0));
      await load(1, pageSize);
    } catch (e: any) {
      toast.error(t.syncFailed(e.message ?? e));
    } finally {
      setSyncing(false);
    }
  };


  const inputStyle = { background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" };

  const tab = (params.get("tab") ?? "pbx") as "pbx" | "ava";
  const setTab = (v: "pbx" | "ava") => updateParams({ tab: v === "pbx" ? null : v });

  const localeStr = lang === "en" ? "en-CA" : "fr-CA";

  return (
    <div className="pa-page space-y-5">
      <PPPageBanner
        image={ppBanner}
        accent="#10B981"
        title={lang === "en" ? "Recordings · global view" : "Enregistrements · vue globale"}
        subtitle={lang === "en" ? "Captured recordings and 30-day trends" : "Enregistrements captés et tendances sur 30 jours"}
      />
      <PPActivityCharts kind="recordings" lang={lang === "en" ? "en" : "fr"} />

      <div className="flex gap-1 border-b" style={{ borderColor: "var(--pp-bg-border-2)" }}>
        {([
          ["pbx", t.tabPbx],
          ["ava", t.tabAva],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className="px-4 py-2 -mb-px transition"
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: tab === k ? "#2E9BDC" : "var(--pp-text-muted)",
              borderBottom: tab === k ? "2px solid #2E9BDC" : "2px solid transparent",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "ava" ? <AvaCallRecordingsPanel /> : (
        <>
      <DebugPanel entries={debug} />

      <NsSyncBar features={["recordings", "cdrs"]} onReload={() => load(page, pageSize)} />

      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={async () => {
            try {
              toast.message(t.queuingAll);
              const { data, error } = await supabase.functions.invoke("pp-admin-backfill-calls", { body: { limit: 1000, concurrency: 5 } });
              if (error) throw error;
              const d = data as any;
              const queuedN = d?.queued ?? 0;
              if (queuedN === 0) toast.success(t.noneQueued);
              else toast.success(t.queued(queuedN));
              setDebug((x) => [{ ts: new Date().toISOString(), label: t.backfillLabel, data: d } as any, ...x]);
              setTimeout(() => load(page, pageSize), 5_000);
              setTimeout(() => load(page, pageSize), 20_000);
              setTimeout(() => load(page, pageSize), 60_000);
            } catch (e: any) {
              toast.error(t.backfillFailed(e?.message ?? e));
            }
          }}
          className="px-3 py-2 rounded-lg text-sm text-white"
          style={{ background: ACCENT }}
        >
          {t.processAll}
        </button>
      </div>

      <div className="pp-card p-4 flex items-center gap-2 flex-wrap">
        <input
          value={search}
          onChange={(e) => setFilterValue("search", e.target.value)}
          placeholder={t.searchPlaceholder}
          className="px-3 py-2 rounded-lg text-sm w-64"
          style={inputStyle as any}
        />
        <select value={broker} onChange={(e) => setFilterValue("broker", e.target.value)} className="px-3 py-2 rounded-lg text-sm" style={inputStyle as any}>
          <option value="">{t.allBrokers}</option>
          {brokers.map((b: any, i: number) => {
            const value = b.ns_only ? `ext:${b.extension}` : `user:${b.user_id}`;
            return (
              <option key={`${value}-${b.extension ?? "x"}-${i}`} value={value}>
                {b.full_name}{b.extension ? ` · ${b.extension}` : ""}
              </option>
            );
          })}
        </select>
        <input type="date" value={from} onChange={(e) => setFilterValue("from", e.target.value)} className="px-3 py-2 rounded-lg text-sm" style={inputStyle as any} />
        <input type="date" value={to} onChange={(e) => setFilterValue("to", e.target.value)} className="px-3 py-2 rounded-lg text-sm" style={inputStyle as any} />
        <select value={withTranscript} onChange={(e) => setFilterValue("transcript", e.target.value)} className="px-3 py-2 rounded-lg text-sm" style={inputStyle as any}>
          <option value="">{t.transcriptAll}</option>
          <option value="yes">{t.transcriptYes}</option>
          <option value="no">{t.transcriptNo}</option>
        </select>
        {hasFilters && (
          <button onClick={resetFilters} className="px-2 py-1.5 text-xs underline" style={{ color: "var(--pp-text-muted)" }}>
            {t.reset(activeFilterCount)}
          </button>
        )}
      </div>


      <div className="pp-card pa-scroll">
        {loadError && <TableErrorState message={loadError} onRetry={() => load(page, pageSize)} />}
        <table className="w-full text-sm">
          <thead style={{ background: "var(--pp-bg-elevated)" }}>
            <tr style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--pp-text-faint)" }} className="text-left">
              <th className="p-3">{t.thBroker}</th><th>{t.thExt}</th><th>{t.thFrom}</th><th>{t.thTo}</th><th>{t.thDuration}</th><th>{t.thDate}</th><th>{t.thTranscript}</th><th>{t.thSummary}</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <td key={j} className="p-3"><div className="h-3 w-3/4 animate-pulse rounded" style={{ background: "var(--pp-bg-elevated)" }} /></td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr><td colSpan={9}>
                <TableEmptyState
                  icon="📬"
                  title={t.emptyTitle}
                  hint={hasFilters ? t.emptyHintFiltered : t.emptyHintDefault}
                  action={hasFilters ? (
                    <button onClick={resetFilters} className="px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ background: ACCENT }}>{t.resetFilters}</button>
                  ) : (
                    <Link to="/planipret/admin/integrations" className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}>
                      {t.goToIntegrations}
                    </Link>
                  )}
                />
              </td></tr>
            ) : rows.map((c) => (
              <tr key={c.id} className="cursor-pointer hover:bg-white/[0.02]"
                style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
                onClick={() => setDetail(c)}>
                <td className="p-3" style={{ color: "var(--pp-text-primary)" }}>{brokerName(c)}</td>
                <td style={{ color: "var(--pp-text-secondary)" }}>{c.extension ?? c.planipret_profiles?.extension ?? "—"}</td>
                <td style={{ color: "var(--pp-text-secondary)" }}>{c.from_number ?? "—"}</td>
                <td style={{ color: "var(--pp-text-secondary)" }}>{c.to_number ?? "—"}</td>
                <td style={{ color: "var(--pp-text-muted)" }}>{c.duration_seconds ? `${Math.floor(c.duration_seconds / 60)}m${c.duration_seconds % 60}s` : "—"}</td>
                <td style={{ fontSize: 11, color: "var(--pp-text-faint)" }}>{c.started_at ? new Date(c.started_at).toLocaleString(localeStr, { dateStyle: "short", timeStyle: "short" }) : ""}</td>
                <td>
                  {c.transcript || (Array.isArray(c.transcript_segments) && c.transcript_segments.length) ? (
                    <span style={{ fontSize: 10, color: "var(--pp-success)" }}>{t.available}</span>
                  ) : c.transcript_pending ? (
                    <span style={{ fontSize: 10, color: "#f59e0b" }}>{t.pending}</span>
                  ) : c.transcript_status === "no_audio" ? (
                    <span style={{ fontSize: 10, color: "var(--pp-text-faint)" }}>Sans enregistrement</span>
                  ) : (
                    <span style={{ fontSize: 10, color: "var(--pp-text-faint)" }}>—</span>
                  )}
                </td>
                <td style={{ maxWidth: 260 }}>
                  {c.ai_summary_short || c.ai_summary ? (
                    <div className="space-y-1">
                      <div style={{ fontSize: 11, color: "var(--pp-text-secondary)", lineHeight: 1.35 }} className="line-clamp-2">
                        {c.ai_summary_short ?? c.ai_summary}
                      </div>
                      {Array.isArray(c.ai_topics) && c.ai_topics.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {c.ai_topics.slice(0, 3).map((tp: string, i: number) => (
                            <span key={i} className="px-1.5 py-0.5 rounded-full text-[9px]" style={{ background: "rgba(155,127,232,0.14)", color: AGENT, border: `1px solid ${AGENT}55` }}>{tp}</span>
                          ))}
                          {c.ai_topics.length > 3 && <span style={{ fontSize: 9, color: "var(--pp-text-faint)" }}>+{c.ai_topics.length - 3}</span>}
                        </div>
                      )}
                      {Array.isArray(c.ai_action_items) && c.ai_action_items.length > 0 && (
                        <div style={{ fontSize: 9, color: ACCENT }}>{t.action(c.ai_action_items.length)}</div>
                      )}
                    </div>
                  ) : (
                    <span style={{ fontSize: 10, color: "var(--pp-text-faint)" }}>—</span>
                  )}
                </td>
                <td><Mic className="w-3.5 h-3.5" style={{ color: "var(--pp-text-muted)" }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          loading={loading}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          unit={t.pageUnit}
        />
      </div>

      {detail && (
        <RecordingDetailDrawer
          call={detail}
          onClose={() => setDetail(null)}
          onUpdated={() => load(page, pageSize)}
          showBroker
        />
      )}
        </>
      )}
    </div>
  );
}
