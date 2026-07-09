import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mic, Sparkles, RefreshCw, X, Download } from "lucide-react";
import Pagination from "@/components/planipret/admin/Pagination";
import DebugPanel, { type DebugEntry } from "@/components/planipret/admin/DebugPanel";
import { TableErrorState, TableEmptyState } from "@/components/planipret/admin/TableStates";
import { getPlanipretBrokerDirectory } from "@/lib/planipret/adminDirectory";
import { usePlanipretNsAutoSync } from "@/hooks/usePlanipretNsAutoSync";
import NsSyncBar from "@/components/planipret/admin/NsSyncBar";

const ACCENT = "#2E9BDC";
const AGENT = "#9B7FE8";

export default function PARecordings() {
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
  const [transcribing, setTranscribing] = useState<string | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [transcriptionUnavailable, setTranscriptionUnavailable] = useState<boolean>(false);
  const [transcriptionDebug, setTranscriptionDebug] = useState<any | null>(null);

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
  useEffect(() => {
    let last = 0;
    let pending: ReturnType<typeof setTimeout> | null = null;
    const trigger = () => {
      const now = Date.now();
      const wait = Math.max(0, 30_000 - (now - last));
      if (pending) return;
      pending = setTimeout(() => { last = Date.now(); pending = null; load(page, pageSize); }, wait);
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
      toast.success(`Synchro lancée: ${d.extensions ?? d.users_total ?? 0} ext · appels/enregistrements en arrière-plan`);
      await load(1, pageSize);
    } catch (e: any) {
      toast.error(`Synchro échouée: ${e.message ?? e}`);
    } finally {
      setSyncing(false);
    }
  };

  const transcribe = async (callId: string) => {
    setTranscribing(callId);
    setTranscriptionError(null);
    setTranscriptionUnavailable(false);
    setTranscriptionDebug(null);
    try {
      const { data, error } = await supabase.functions.invoke("ns-get-transcription", { body: { call_db_id: callId } });
      if (error) throw error;
      const d = data as any;
      if (d?.success && Array.isArray(d.segments) && d.segments.length) {
        const text = d.segments.map((s: any) => `${s.speaker}: ${s.text}`).join("\n");
        await supabase.from("planipret_phone_calls").update({
          transcript: text,
          transcript_segments: d.segments,
          transcript_source: "ns-api",
          has_transcript: true,
        }).eq("id", callId);
        setDetail((cur: any) => cur && cur.id === callId ? { ...cur, transcript: text, transcript_segments: d.segments, has_transcript: true } : cur);
        await load(page, pageSize);
      } else {
        // Transcript unavailable — capture full debug payload for the diagnostic panel
        setTranscriptionUnavailable(true);
        setTranscriptionDebug(d);
      }
    } catch (e: any) {
      setTranscriptionError(e?.message ?? String(e));
    } finally {
      setTranscribing(null);
    }
  };

  const [resolving, setResolving] = useState<string | null>(null);
  const resolveRecording = async (row: any, _force = false) => {
    setResolving(row.id);
    setRecordingError(null);
    try {
      // Phase 4: stream audio bytes from ns-get-recording
      const projectId = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID ?? "gejxisrqtvxavbrfcoxz";
      const anonKey = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY ?? (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`https://${projectId}.supabase.co/functions/v1/ns-get-recording`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey ?? "",
          Authorization: `Bearer ${session?.access_token ?? anonKey ?? ""}`,
        },
        body: JSON.stringify({ call_db_id: row.id }),
      });
      const ct = resp.headers.get("Content-Type") ?? "";
      if (resp.ok && ct.includes("audio")) {
        const blob = await resp.blob();
        const objUrl = URL.createObjectURL(blob);
        const recordingMeta = {
          duration_sec: resp.headers.get("X-NS-Duration-Seconds"),
          file_size_kb: resp.headers.get("X-NS-File-Size-KB"),
          status: resp.headers.get("X-NS-Recording-Status"),
          callid: resp.headers.get("X-NS-CallID"),
          source_path: resp.headers.get("X-NS-Source-Path"),
        };
        setDetail((cur: any) => ({ ...(cur && cur.id === row.id ? cur : row), recording_url: objUrl, __recording_meta: recordingMeta }));
        toast.success("Enregistrement chargé");
      } else {
        const j = await resp.json().catch(() => ({}));
        let msg: string;
        switch (j?.error) {
          case "MISSING_CALLID":
            msg = "Identifiant d'appel manquant — resynchroniser le CDR";
            break;
          case "NO_FILE_ACCESS_URL":
            msg = `Enregistrement en traitement (status: ${j.recording_status ?? "?"}, taille: ${j.file_size_kb ?? 0} kB)`;
            break;
          case "RECORDING_NOT_FOUND":
            msg = [
              j?.message ?? "Aucun enregistrement disponible pour cet appel.",
              Array.isArray(j?.attempted_ids) && j.attempted_ids.length ? `IDs testés: ${j.attempted_ids.slice(0, 3).join(", ")}` : null,
            ].filter(Boolean).join(" ");
            break;
          default:
            msg = [j?.message ?? j?.error ?? "Aucun enregistrement disponible côté NS-API",
              Array.isArray(j?.possible_causes) ? j.possible_causes[0] : null].filter(Boolean).join(" — ");
        }
        setRecordingError(msg);
        toast.error(msg);
        console.warn("[ns-get-recording] failure", j);
      }
    } catch (e: any) {
      toast.error(`Récupération échouée: ${e.message ?? e}`);
    } finally {
      setResolving(null);
    }
  };

  const [coaching, setCoaching] = useState<string | null>(null);
  // Coaching status per call: 'queued' | 'running' | 'done' | 'error'
  const [coachStatus, setCoachStatus] = useState<Record<string, "queued" | "running" | "done" | "error">>({});
  const [coachStartedAt, setCoachStartedAt] = useState<Record<string, number>>({});
  const [coachElapsed, setCoachElapsed] = useState<number>(0);

  // Tick elapsed while any coaching is running
  useEffect(() => {
    const running = Object.values(coachStatus).some((s) => s === "queued" || s === "running");
    if (!running) return;
    const id = setInterval(() => setCoachElapsed((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [coachStatus]);

  const runCoaching = async (callId: string) => {
    // Guard: never call coaching without a transcript in local state
    const cur = detail;
    const hasT = cur && cur.id === callId && (Boolean(cur.transcript) || (Array.isArray(cur.transcript_segments) && cur.transcript_segments.length > 0));
    if (!hasT) return;
    // Cache: si déjà analysé, ne relance pas
    if (cur.ai_coaching) {
      setCoachStatus((s) => ({ ...s, [callId]: "done" }));
      return;
    }
    setCoaching(callId);
    setCoachStatus((s) => ({ ...s, [callId]: "queued" }));
    setCoachStartedAt((s) => ({ ...s, [callId]: Date.now() }));
    setCoachElapsed(0);
    // Bascule "en cours" après un court délai pour matérialiser la queue → running
    setTimeout(() => setCoachStatus((s) => (s[callId] === "queued" ? { ...s, [callId]: "running" } : s)), 400);
    try {
      // Fallback transcript: envoyer le texte local si la DB n'est pas encore synchro
      const localTranscript = cur.transcript || (Array.isArray(cur.transcript_segments) ? cur.transcript_segments.map((s: any) => s?.text).filter(Boolean).join("\n") : "");
      const { data, error } = await supabase.functions.invoke("pp-coach-call", { body: { call_id: callId, transcript: localTranscript } });
      const d = (data as any) ?? {};
      if (d?.error === "TRANSCRIPT_MISSING") {
        // Transcript pas encore prêt côté serveur — reste en "queued", retry dans 3s
        setCoachStatus((s) => ({ ...s, [callId]: "queued" }));
        setTimeout(() => runCoaching(callId), 3000);
        return;
      }
      if (error) {
        setCoachStatus((s) => ({ ...s, [callId]: "error" }));
        toast.error(`Coaching échoué: ${error.message ?? error}`);
        return;
      }
      if (d?.success) {
        toast.success(`Coaching généré (score ${d.score ?? "—"}/100)`);
        setDetail((c: any) => c && c.id === callId ? { ...c, ai_summary: d.summary, ai_coaching: d.coaching, transcript: d.corrected_transcript ?? c.transcript, lead_score: d.score } : c);
        setCoachStatus((s) => ({ ...s, [callId]: "done" }));
      }
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (!msg.includes("TRANSCRIPT_MISSING")) toast.error(`Coaching échoué: ${msg}`);
      setCoachStatus((s) => ({ ...s, [callId]: "error" }));
    } finally {
      setCoaching(null);
    }
  };

  // Realtime: auto-refresh detail when ai_coaching lands (from any source)
  useEffect(() => {
    if (!detail?.id) return;
    const callId = detail.id;
    const ch = supabase
      .channel(`pa-call-${callId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "planipret_phone_calls", filter: `id=eq.${callId}` }, (payload: any) => {
        const n = payload?.new;
        if (!n) return;
        setDetail((c: any) => (c && c.id === callId ? { ...c, ...n } : c));
        if (n.ai_coaching) setCoachStatus((s) => ({ ...s, [callId]: "done" }));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [detail?.id]);

  // Auto-fetch transcription via ns-get-transcription when a recording detail opens
  useEffect(() => {
    if (!detail?.id) return;
    if (detail.transcript || (Array.isArray(detail.transcript_segments) && detail.transcript_segments.length)) return;
    if (transcribing === detail.id) return;
    transcribe(detail.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.id]);

  // Auto-run Claude coaching once transcript is available and no analysis yet
  useEffect(() => {
    if (!detail?.id) return;
    const hasTranscript = Boolean(detail.transcript) || (Array.isArray(detail.transcript_segments) && detail.transcript_segments.length > 0);
    if (!hasTranscript) return;
    if (detail.ai_coaching || detail.ai_summary) return;
    if (coaching === detail.id) return;
    runCoaching(detail.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.id, detail?.transcript, detail?.transcript_segments]);

  // Auto-fetch audio via ns-get-recording when a recording detail opens (skip voicemails)
  useEffect(() => {
    if (!detail?.id) return;
    const to = String(detail.to_number ?? "").toLowerCase();
    const isVoicemail = to.includes("vmail") || to.includes("voicemail") || to.includes("vm@");
    if (isVoicemail) return;
    if (detail.has_recording === false && !detail.ns_callid && !detail.ns_orig_callid) return;
    if (detail.recording_url && String(detail.recording_url).startsWith("blob:")) return;
    if (detail.recording_url && String(detail.recording_url).startsWith("http")) return;
    if (resolving === detail.id) return;
    resolveRecording(detail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.id]);



  const inputStyle = { background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" };
  const detailSegments = Array.isArray(detail?.transcript_segments) ? detail.transcript_segments.filter((s: any) => s?.text) : [];
  const hasDetailTranscript = Boolean(detail?.transcript) || detailSegments.length > 0;

  return (
    <div className="space-y-4">
      <DebugPanel entries={debug} />

      <NsSyncBar features={["recordings", "cdrs"]} onReload={() => load(page, pageSize)} />

      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={async () => {
            try {
              const { data: recentCall } = await supabase
                .from("planipret_phone_calls")
                .select("*")
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              const { data: rawCdr, error } = await supabase.functions.invoke("ns-debug-cdr", { body: {} });
              const payload = { db_row_fields: recentCall ? Object.keys(recentCall) : [], db_row: recentCall, ns_debug: rawCdr, invoke_error: error?.message };
              console.log("[CDR DEBUG]", payload);
              setDebug((d) => [{ ts: new Date().toISOString(), label: "CDR fields debug", data: payload } as any, ...d]);
              toast.success("Debug CDR — voir DebugPanel + console");
            } catch (e: any) {
              toast.error(`Debug échoué: ${e?.message ?? e}`);
            }
          }}
          className="px-3 py-2 rounded-lg text-sm border"
          style={{ borderColor: "var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}
        >
          🔍 Debug CDR Fields
        </button>

        <button
          type="button"
          onClick={async () => {
            try {
              toast.message("Diagnostic en cours (peut prendre ~30s)…");
              const { data, error } = await supabase.functions.invoke("ns-debug-real-cdr", { body: {} });
              if (error) throw error;
              console.log("[NS RECORDING DIAG]", data);
              setDebug((d) => [{ ts: new Date().toISOString(), label: "Diagnostic enregistrements NS-API", data } as any, ...d]);
              const successes = (data as any)?.successes ?? [];
              if (successes.length) toast.success(`✅ ${successes.length} endpoint(s) audio trouvé(s) — voir DebugPanel`);
              else toast.error("Aucun endpoint audio n'a répondu 200 — voir DebugPanel");
            } catch (e: any) {
              toast.error(`Diagnostic échoué: ${e?.message ?? e}`);
            }
          }}
          className="px-3 py-2 rounded-lg text-sm border"
          style={{ borderColor: "var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}
        >
          🔬 Diagnostiquer les enregistrements
        </button>
      </div>





      <div className="pp-card p-4 flex items-center gap-2 flex-wrap">
        <input
          value={search}
          onChange={(e) => setFilterValue("search", e.target.value)}
          placeholder="Rechercher numéro ou extension…"
          className="px-3 py-2 rounded-lg text-sm w-64"
          style={inputStyle as any}
        />
        <select value={broker} onChange={(e) => setFilterValue("broker", e.target.value)} className="px-3 py-2 rounded-lg text-sm" style={inputStyle as any}>
          <option value="">Tous courtiers</option>
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
          <option value="">Transcription : tous</option>
          <option value="yes">Avec transcription</option>
          <option value="no">Sans transcription</option>
        </select>
        {hasFilters && (
          <button onClick={resetFilters} className="px-2 py-1.5 text-xs underline" style={{ color: "var(--pp-text-muted)" }}>
            ✕ Réinitialiser ({activeFilterCount})
          </button>
        )}
      </div>


      <div className="pp-card overflow-hidden">
        {loadError && <TableErrorState message={loadError} onRetry={() => load(page, pageSize)} />}
        <table className="w-full text-sm">
          <thead style={{ background: "var(--pp-bg-elevated)" }}>
            <tr style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--pp-text-faint)" }} className="text-left">
              <th className="p-3">Courtier</th><th>Ext.</th><th>De</th><th>Vers</th><th>Durée</th><th>Date</th><th>Transcription</th><th>IA</th><th></th>
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
                  title="Aucun enregistrement trouvé"
                  hint={hasFilters
                    ? "Essayez d'élargir vos critères de recherche."
                    : "Aucun enregistrement n'est encore synchronisé. La synchronisation NS-API est automatique · vérifiez que les enregistrements sont activés dans la config NetSapiens."}
                  action={hasFilters ? (
                    <button onClick={resetFilters} className="px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ background: ACCENT }}>Réinitialiser les filtres</button>
                  ) : (
                    <Link to="/planipret/admin/integrations" className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}>
                      Aller aux intégrations →
                    </Link>
                  )}
                />
              </td></tr>
            ) : rows.map((c) => (
              <tr key={c.id} className="cursor-pointer hover:bg-white/[0.02]"
                style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
                onClick={() => { setRecordingError(null); setTranscriptionError(null); setTranscriptionUnavailable(false); setDetail(c); }}>
                <td className="p-3" style={{ color: "var(--pp-text-primary)" }}>{brokerName(c)}</td>
                <td style={{ color: "var(--pp-text-secondary)" }}>{c.extension ?? c.planipret_profiles?.extension ?? "—"}</td>
                <td style={{ color: "var(--pp-text-secondary)" }}>{c.from_number ?? "—"}</td>
                <td style={{ color: "var(--pp-text-secondary)" }}>{c.to_number ?? "—"}</td>
                <td style={{ color: "var(--pp-text-muted)" }}>{c.duration_seconds ? `${Math.floor(c.duration_seconds / 60)}m${c.duration_seconds % 60}s` : "—"}</td>
                <td style={{ fontSize: 11, color: "var(--pp-text-faint)" }}>{c.started_at ? new Date(c.started_at).toLocaleString("fr-CA", { dateStyle: "short", timeStyle: "short" }) : ""}</td>
                <td>
                  {c.transcript || (Array.isArray(c.transcript_segments) && c.transcript_segments.length) ? (
                    <span style={{ fontSize: 10, color: "var(--pp-success)" }}>● Disponible</span>
                  ) : (
                    <span style={{ fontSize: 10, color: "var(--pp-text-faint)" }}>—</span>
                  )}
                </td>
                <td>{c.ai_summary && <Sparkles className="w-3.5 h-3.5" style={{ color: AGENT }} />}</td>
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
          unit="enregistrements"
        />
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 bg-black/60 flex justify-end" onClick={() => setDetail(null)}>
          <div className="h-full w-full max-w-md overflow-y-auto p-5"
            style={{ background: "var(--pp-bg-surface)", borderLeft: "1px solid var(--pp-bg-border-2)" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 style={{ fontWeight: 600, color: "var(--pp-text-primary)" }}>Enregistrement</h3>
              <button onClick={() => { setRecordingError(null); setTranscriptionError(null); setTranscriptionUnavailable(false); setDetail(null); }}><X className="w-4 h-4" style={{ color: "var(--pp-text-muted)" }} /></button>
            </div>
            <div className="space-y-3 text-sm" style={{ color: "var(--pp-text-secondary)" }}>
              <div>Courtier: <span style={{ color: "var(--pp-text-primary)" }}>{brokerName(detail)}</span></div>
              <div>Ext: {detail.extension ?? "—"} · Direction: {detail.direction ?? "—"} · Statut: {detail.status ?? "—"}</div>
              <div>De: {detail.from_number ?? "—"} → Vers: {detail.to_number ?? "—"}</div>
              <div>Date: {detail.started_at ? new Date(detail.started_at).toLocaleString("fr-CA") : "—"} · Durée: {detail.duration_seconds ? `${Math.floor(detail.duration_seconds / 60)}m${detail.duration_seconds % 60}s` : "—"}</div>
              <div style={{ fontSize: 10, color: "var(--pp-text-faint)", fontFamily: "monospace" }}>NS callid: {detail.ns_callid ?? detail.ns_orig_callid ?? "—"}</div>
              {String(detail.recording_url ?? "").startsWith("blob:") && resolving !== detail.id && (
                <div style={{ fontSize: 10, color: "var(--pp-success)" }}>● Audio streamé depuis NS-API</div>
              )}
              {detail.__recording_meta && String(detail.recording_url ?? "").startsWith("blob:") && (
                <div style={{ fontSize: 10, color: "var(--pp-text-faint)", fontFamily: "monospace" }}>
                  Audio meta: {detail.__recording_meta.duration_sec ? `${detail.__recording_meta.duration_sec}s` : `${detail.duration_seconds ?? "?"}s`}
                  {detail.__recording_meta.file_size_kb ? ` · ${detail.__recording_meta.file_size_kb} kB` : ""}
                  {detail.__recording_meta.callid ? ` · ${detail.__recording_meta.callid}` : ""}
                </div>
              )}
              {resolving === detail.id && (
                <div style={{ fontSize: 11, color: "var(--pp-text-muted)" }}>Chargement de l'audio depuis NS-API…</div>
              )}
              {(() => {
                const toLc = String(detail.to_number ?? "").toLowerCase();
                const isVoicemail = toLc.includes("vmail") || toLc.includes("voicemail") || toLc.includes("vm@");
                if (isVoicemail) {
                  return (
                    <div className="p-3 rounded-lg text-xs" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}>
                      📵 Appel non enregistré (VMail ou appel manqué)
                    </div>
                  );
                }
                if (resolving === detail.id) {
                  return (
                    <div>
                      <p style={{ fontSize: 11, color: "var(--pp-text-muted)", marginBottom: 4 }}>Audio</p>
                      <div className="h-10 w-full animate-pulse rounded" style={{ background: "var(--pp-bg-elevated)" }} />
                    </div>
                  );
                }
                if (detail.recording_url && String(detail.recording_url).startsWith("blob:")) {
                  return (
                    <div>
                      <p style={{ fontSize: 11, color: "var(--pp-text-muted)", marginBottom: 4 }}>Audio</p>
                      <audio key={detail.recording_url} src={detail.recording_url} controls className="w-full" />
                    </div>
                  );
                }
                if (detail.recording_url && String(detail.recording_url).startsWith("http")) {
                  return (
                    <div>
                      <p style={{ fontSize: 11, color: "var(--pp-text-muted)", marginBottom: 4 }}>Audio</p>
                      <audio
                        key={detail.recording_url}
                        src={detail.recording_url}
                        controls
                        className="w-full"
                        onError={() => {
                          if (resolving !== detail.id && !(detail as any).__autoRefreshed) {
                            (detail as any).__autoRefreshed = true;
                            resolveRecording(detail, true);
                          }
                        }}
                      />
                      <a href={detail.recording_url} download className="inline-flex items-center gap-1 text-xs mt-2" style={{ color: ACCENT }}>
                        <Download className="w-3 h-3" /> Télécharger
                      </a>
                    </div>
                  );
                }
                return (
                  <div className="p-3 rounded-lg text-xs" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-danger, #E84C4C)" }}>
                    {recordingError ?? "Enregistrement introuvable sur NS-API."}
                  </div>
                );
              })()}

              {hasDetailTranscript && detail.ai_coaching ? (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p style={{ fontSize: 11, color: "var(--pp-text-muted)" }}>Transcription corrigée (IA)</p>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "rgba(16,185,129,0.14)", color: "#10b981", border: "1px solid #10b98155", fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }}>● Terminé</span>
                  </div>
                  <div className="p-3 rounded-lg" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", fontSize: 12 }}>
                    <div className="whitespace-pre-wrap">{detail.transcript}</div>
                  </div>
                </div>
              ) : (hasDetailTranscript && !detail.ai_coaching) || coaching === detail.id ? (
                (() => {
                  const st = coachStatus[detail.id] ?? "queued";
                  const label = st === "queued" ? "En attente" : st === "running" ? "En cours" : st === "error" ? "Erreur" : "Terminé";
                  const color = st === "queued" ? "#f59e0b" : st === "running" ? "#2E9BDC" : st === "error" ? "#ef4444" : "#10b981";
                  const started = coachStartedAt[detail.id];
                  const elapsed = started ? Math.max(0, Math.floor((Date.now() - started) / 1000)) + Math.min(coachElapsed, 0) : 0;
                  // Estimation ~15s, barre progressive plafonnée à 92% tant que pas fini
                  const pct = st === "error" ? 100 : Math.min(92, Math.round((elapsed / 15) * 100));
                  return (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <p style={{ fontSize: 11, color: "var(--pp-text-muted)" }}>Analyse coaching AVA</p>
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: `${color}22`, color, border: `1px solid ${color}55`, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }}>● {label}</span>
                      </div>
                      <div className="p-3 rounded-lg space-y-2" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}>
                        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--pp-text-secondary)" }}>
                          {st !== "error" && <div className="w-3 h-3 rounded-full border-2 animate-spin" style={{ borderColor: color, borderTopColor: "transparent" }} />}
                          <span>
                            {st === "queued" && "En file — préparation du contexte…"}
                            {st === "running" && `AVA analyse et corrige la transcription… (${elapsed}s)`}
                            {st === "error" && "Analyse échouée — vous pouvez réessayer."}
                          </span>
                        </div>
                        <div style={{ height: 4, borderRadius: 999, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: color, transition: "width 0.6s linear" }} />
                        </div>
                        {st === "error" && (
                          <button onClick={() => runCoaching(detail.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs" style={{ background: ACCENT }}>
                            <RefreshCw className="w-3 h-3" /> Réessayer l'analyse
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()
              ) : transcribing === detail.id ? (
                <div>
                  <p style={{ fontSize: 11, color: "var(--pp-text-muted)", marginBottom: 4 }}>Transcription</p>
                  <div className="flex items-center gap-2 p-3 rounded-lg text-xs" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}>
                    <div className="w-3 h-3 rounded-full border-2 animate-spin" style={{ borderColor: "var(--pp-text-muted)", borderTopColor: "transparent" }} />
                    Chargement de la transcription depuis NS-API…
                  </div>
                </div>
              ) : transcriptionError ? (
                <div className="space-y-2">
                  <div className="p-3 rounded-lg text-xs" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-danger, #E84C4C)" }}>
                    ❌ Impossible de charger la transcription
                  </div>
                  <button
                    onClick={() => transcribe(detail.id)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-white text-sm"
                    style={{ background: ACCENT }}
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Réessayer
                  </button>
                </div>
              ) : transcriptionUnavailable ? (
                <div>
                  <div className="p-3 rounded-lg text-xs text-center mb-2" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}>
                    ⚠️ Transcription non trouvée — Diagnostic
                  </div>
                  <div style={{ background: "#040B16", border: "1px solid #0E2A45", borderRadius: 10, padding: 10, fontSize: 10, fontFamily: "monospace", color: "#8FA8C0", maxHeight: 320, overflowY: "auto" }}>
                    <div style={{ color: "#2E9BDC" }}>NS callid: {transcriptionDebug?.ns_callid ?? "null"}</div>
                    <div style={{ color: "#2E9BDC", marginBottom: 6 }}>Extension: {transcriptionDebug?.ns_extension ?? "null"}</div>
                    {(transcriptionDebug?.attempts ?? []).map((a: any, i: number) => (
                      <div key={i} style={{ marginBottom: 6, paddingBottom: 6, borderBottom: "1px solid #0E2A45" }}>
                        <div style={{ color: a.status === 200 ? "#00D4AA" : "#E84C4C", wordBreak: "break-all" }}>
                          HTTP {a.status ?? "ERR"} — {String(a.url ?? "").slice(0, 120)}
                        </div>
                        {a.fields_found?.length > 0 && (
                          <div style={{ color: "#9B7FE8" }}>Fields: {a.fields_found.join(", ")}</div>
                        )}
                        {a.items_count > 0 && (
                          <div style={{ color: "#F5A623" }}>Items: {a.items_count}</div>
                        )}
                        {a.transcript_found && (
                          <div style={{ color: "#00D4AA" }}>✅ Transcript field found</div>
                        )}
                        {a.body_preview && (
                          <div style={{ color: "#6B8CAE", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{a.body_preview}</div>
                        )}
                        {a.error && <div style={{ color: "#E84C4C" }}>Error: {a.error}</div>}
                      </div>
                    ))}
                    {transcriptionDebug?.action_required && (
                      <div style={{ color: "#4A7FA5", marginTop: 6 }}>Note: {transcriptionDebug.action_required}</div>
                    )}
                  </div>
                </div>
              ) : null}
              {detail.ai_coaching && (
                <div>
                  <p style={{ fontSize: 11, color: "var(--pp-text-muted)", marginBottom: 4 }}>Coaching IA</p>
                  <div className="p-3 rounded-lg space-y-2" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", fontSize: 12 }}>
                    {typeof detail.ai_coaching === "object" && (
                      <>
                        {detail.lead_score != null && <div>Score : <b>{detail.lead_score}/100</b></div>}
                        {(detail.ai_coaching as any).strengths?.length ? (
                          <div><b>Points forts :</b><ul className="list-disc pl-4">{(detail.ai_coaching as any).strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></div>
                        ) : null}
                        {(detail.ai_coaching as any).improvements?.length ? (
                          <div><b>À améliorer :</b><ul className="list-disc pl-4">{(detail.ai_coaching as any).improvements.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></div>
                        ) : null}
                        {(detail.ai_coaching as any).next_steps?.length ? (
                          <div><b>Prochaines étapes :</b><ul className="list-disc pl-4">{(detail.ai_coaching as any).next_steps.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></div>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              )}
              {detail.ai_summary && (
                <div>
                  <p style={{ fontSize: 11, color: "var(--pp-text-muted)", marginBottom: 4 }}>Résumé IA</p>
                  <div className="p-3 rounded-lg" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", fontSize: 12 }}>
                    {detail.ai_summary}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
