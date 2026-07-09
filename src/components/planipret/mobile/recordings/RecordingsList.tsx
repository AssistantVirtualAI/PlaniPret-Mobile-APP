import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Play, Pause, Download, RotateCcw, RotateCw, Sparkles, FileText, Bot,
  Loader2, Search, Copy, Check, ChevronDown, Link2, User, Flame, Snowflake, Thermometer, ListChecks,
  CloudUpload, CloudOff, CheckCircle2,
} from "lucide-react";

export type AudioStatus = "idle" | "uploading" | "uploaded" | "error";


type Pipeline = {
  cdr?: "pending" | "done" | "error";
  transcript?: "pending" | "done" | "error";
  ai?: "pending" | "done" | "error";
  maestro?: "pending" | "done" | "error";
};

export type RecordingCall = {
  id: string;
  user_id: string;
  ns_call_id: string | null;
  ns_callid?: string | null;
  ns_orig_callid?: string | null;
  ns_term_callid?: string | null;
  extension?: string | null;
  direction: string;
  from_number: string | null;
  from_name: string | null;
  to_number: string | null;
  to_name: string | null;
  started_at: string;
  duration_seconds: number | null;
  recording_url: string | null;
  has_recording?: boolean | null;
  transcript: string | null;
  transcript_segments?: any;
  transcript_language?: string | null;
  ai_summary: string | null;
  ai_coaching?: any;
  ai_key_points?: any;
  ai_client_insights?: any;
  ai_tasks?: any;
  lead_score?: number | null;
  coaching_score?: number | null;
  lead_temperature?: string | null;
  maestro_synced?: boolean | null;
  maestro_client_id?: string | null;
  pipeline_state?: Pipeline | null;
  stream_via_proxy?: boolean | null;
  proxy_call_db_id?: string | null;
  proxy_ns_callid?: string | null;
};

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const isEn = typeof document !== "undefined" && document.documentElement.lang === "en";
  if (sameDay) return `${isEn ? "Today" : "Aujourd'hui"} · ${hh}h${mm}`;
  return `${d.toLocaleDateString(isEn ? "en-CA" : "fr-CA", { day: "2-digit", month: "short" })} · ${hh}h${mm}`;
};
const fmtDuration = (s: number | null) => {
  if (!s) return "—";
  const m = Math.floor(s / 60); const sec = s % 60;
  return m === 0 ? `${sec}s` : `${m}m ${sec}s`;
};
const otherLabel = (c: RecordingCall) => {
  const out = c.direction === "outbound";
  return (out ? c.to_name : c.from_name) || (out ? c.to_number : c.from_number) || "Inconnu";
};
const hasResolvableAudio = (c: RecordingCall) => !!(
  c.recording_url || c.has_recording || c.stream_via_proxy || c.proxy_call_db_id || c.proxy_ns_callid || c.ns_callid || c.ns_orig_callid || c.ns_term_callid || c.ns_call_id
);
const callDbId = (c: RecordingCall) => c.proxy_call_db_id ?? c.id;
const recordingLookupBody = (c: RecordingCall) => ({
  call_db_id: callDbId(c),
  ns_callid: c.proxy_ns_callid ?? c.ns_callid ?? c.ns_orig_callid ?? c.ns_term_callid ?? c.ns_call_id,
  ns_orig_callid: c.ns_orig_callid,
  ns_term_callid: c.ns_term_callid,
  ns_extension: c.extension,
});
const applyCoachPayload = (call: RecordingCall, payload: any): RecordingCall => ({
  ...call,
  transcript: payload?.corrected_transcript ?? payload?.transcript ?? call.transcript,
  ai_summary: payload?.summary ?? payload?.ai_summary ?? call.ai_summary,
  ai_coaching: payload?.coaching ?? payload?.ai_coaching ?? call.ai_coaching,
  lead_score: payload?.score ?? call.lead_score,
  coaching_score: payload?.coaching_score ?? call.coaching_score,
});
async function fetchNsTranscript(call: RecordingCall) {
  const { data, error } = await supabase.functions.invoke("ns-get-transcription", { body: recordingLookupBody(call) });
  if (error) throw error;
  const d = (data as any) ?? {};
  if (!d?.success || !Array.isArray(d.segments) || d.segments.length === 0) return null;
  const text = d.segments.map((s: any) => `${s.speaker ?? "Speaker"}: ${s.text}`).join("\n");
  return { text, segments: d.segments, language: d.language ?? null };
}

// Fetch the audio blob via the backend proxy. Retries with backoff when the
// recording is not yet available on the PBX ("not ready" / 404 / 425).
async function fetchAudioBlob(call: RecordingCall, opts: { retries?: number; signal?: AbortSignal } = {}): Promise<string> {
  const retries = opts.retries ?? 3;
  const projectId = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID;
  const anonKey = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY ?? (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;
  if (!projectId) throw new Error("Backend URL indisponible");
  const { data: { session } } = await supabase.auth.getSession();
  let lastErr: any = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (opts.signal?.aborted) throw new Error("aborted");
    try {
      const resp = await fetch(`https://${projectId}.supabase.co/functions/v1/ns-get-recording`, {
        method: "POST",
        signal: opts.signal,
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey ?? "",
          Authorization: `Bearer ${session?.access_token ?? anonKey ?? ""}`,
        },
        body: JSON.stringify(recordingLookupBody(call)),
      });
      const ct = resp.headers.get("Content-Type") ?? "";
      if (resp.ok && ct.includes("audio")) {
        const blob = await resp.blob();
        return URL.createObjectURL(blob);
      }
      const j = await resp.json().catch(() => ({}));
      const msg: string = j?.message ?? j?.error ?? `HTTP ${resp.status}`;
      const retriable = resp.status === 404 || resp.status === 425 || resp.status === 503 || /not ready|processing|pending|indisponible/i.test(msg);
      lastErr = new Error(msg);
      if (!retriable || attempt === retries) throw lastErr;
    } catch (e: any) {
      lastErr = e;
      if (e?.name === "AbortError" || attempt === retries) throw e;
    }
    await new Promise((r) => window.setTimeout(r, 1500 * (attempt + 1)));
  }
  throw lastErr ?? new Error("Audio indisponible");
}

const tempIcon = (t?: string | null) => {
  if (t === "hot") return { Icon: Flame, color: "var(--pp-danger)", label: "Chaud" };
  if (t === "warm") return { Icon: Thermometer, color: "var(--pp-warning, #f59e0b)", label: "Tiède" };
  if (t === "cold") return { Icon: Snowflake, color: "var(--pp-brand-accent)", label: "Froid" };
  return null;
};

// ===================== List =====================
export default function RecordingsList({
  calls,
  loading,
  userId,
  onUpdated,
}: {
  calls: RecordingCall[];
  loading: boolean;
  userId: string | undefined;
  onUpdated: (c: RecordingCall) => void;
}) {
  const withRec = useMemo(
    () => calls.filter((c) => hasResolvableAudio(c) || !!c.transcript || !!c.ai_summary),
    [calls]
  );
  const autoPipelineDoneRef = useRef<Set<string>>(new Set());
  const audioBlobCacheRef = useRef<Map<string, string>>(new Map());
  const [audioStatus, setAudioStatus] = useState<Record<string, AudioStatus>>({});

  const setStatus = (id: string, s: AudioStatus) =>
    setAudioStatus((prev) => (prev[id] === s ? prev : { ...prev, [id]: s }));

  // Background preload: transcript + AI + audio blob for the 5 most recent recordings.
  // Runs one-by-one so the recordings screen stays responsive.
  useEffect(() => {
    if (!withRec.length) return;
    const controller = new AbortController();
    let cancelled = false;
    const queue = withRec.slice(0, 5).filter((c) => hasResolvableAudio(c));

    (async () => {
      for (const call of queue) {
        if (cancelled) break;
        const who = otherLabel(call);

        // Auto-upload / cache audio blob (skip if already cached or blob-backed).
        const alreadyBlob = !!call.recording_url && /^blob:/i.test(String(call.recording_url));
        if (!audioBlobCacheRef.current.has(call.id) && !alreadyBlob) {
          setStatus(call.id, "uploading");
          const tId = toast.loading(`Upload audio — ${who}`);
          try {
            const url = await fetchAudioBlob(call, { retries: 3, signal: controller.signal });
            if (cancelled) { URL.revokeObjectURL(url); toast.dismiss(tId); break; }
            audioBlobCacheRef.current.set(call.id, url);
            setStatus(call.id, "uploaded");
            onUpdated({ ...call, recording_url: url, has_recording: true, stream_via_proxy: true });
            toast.success(`Audio uploadé — ${who}`, { id: tId });
          } catch (e: any) {
            if (!cancelled) {
              setStatus(call.id, "error");
              toast.error(`Audio indisponible — ${who}`, { id: tId, description: e?.message });
            } else {
              toast.dismiss(tId);
            }
          }
        } else if (alreadyBlob || audioBlobCacheRef.current.has(call.id)) {
          setStatus(call.id, "uploaded");
        }

        // Transcript + coaching pipeline.
        if (!autoPipelineDoneRef.current.has(call.id) && (!call.transcript || !call.ai_summary)) {
          autoPipelineDoneRef.current.add(call.id);
          try {
            let working = call;
            if (!working.transcript) {
              const tId = toast.loading(`Transcription — ${who}`);
              try {
                const { data, error } = await supabase.functions.invoke("pp-admin-transcribe", { body: { call_id: callDbId(working) } });
                if (error) throw error;
                const tx = (data as any) ?? {};
                if (tx.transcript) {
                  working = {
                    ...working,
                    transcript: tx.transcript,
                    transcript_segments: tx.segments ?? working.transcript_segments,
                    transcript_language: tx.language ?? working.transcript_language,
                  };
                  if (!cancelled) onUpdated(working);
                  toast.success(`Transcription prête — ${who}`, { id: tId });
                } else {
                  toast.dismiss(tId);
                }
              } catch (e: any) {
                toast.error(`Transcription échouée — ${who}`, { id: tId, description: e?.message });
                throw e;
              }
            }
            if (!cancelled && working.transcript && !working.ai_summary) {
              const tId = toast.loading(`Analyse IA — ${who}`);
              try {
                const { data, error } = await supabase.functions.invoke("pp-coach-call", {
                  body: { call_id: callDbId(working), transcript: working.transcript, force: true },
                });
                if (error) throw error;
                if (!cancelled) onUpdated(applyCoachPayload(working, data));
                toast.success(`Coaching prêt — ${who}`, { id: tId });
              } catch (e: any) {
                toast.error(`Analyse échouée — ${who}`, { id: tId, description: e?.message });
                throw e;
              }
            }
          } catch (e) {
            console.warn("[RecordingsList] background pipeline failed", e);
          }
        }

        await new Promise((resolve) => window.setTimeout(resolve, 400));
      }

    })();

    return () => { cancelled = true; controller.abort(); };
  }, [withRec, onUpdated]);

  // Cleanup blob URLs on unmount
  useEffect(() => () => {
    for (const url of audioBlobCacheRef.current.values()) {
      try { URL.revokeObjectURL(url); } catch {}
    }
    audioBlobCacheRef.current.clear();
  }, []);

  // Realtime AI insights broadcast
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`ai-insights:${userId}`)
      .on("broadcast", { event: "analysis_ready" }, ({ payload }) => {
        const score = payload?.lead_score;
        const temp = payload?.lead_temperature;
        toast.success(`🤖 Analyse prête${score != null ? ` — ${score}/100` : ""}`, {
          description: temp === "hot" ? "🔥 Lead chaud!" : undefined,
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId]);

  if (loading) {
    return (
      <ul className="px-3 pt-3 pb-4 space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className="rounded-2xl p-3" style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)" }}>
            <div className="h-3 w-1/2 rounded animate-pulse mb-2" style={{ background: "var(--pp-bg-elevated)" }} />
            <div className="h-12 w-full rounded animate-pulse" style={{ background: "var(--pp-bg-elevated)" }} />
          </li>
        ))}
      </ul>
    );
  }

  if (withRec.length === 0) {
    return (
      <div className="p-10 text-center">
        <div className="w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-3"
             style={{ background: "rgba(46,155,220,0.12)", color: "var(--pp-brand-accent)" }}>
          <Play className="w-6 h-6" />
        </div>
        <div className="font-semibold" style={{ color: "var(--pp-text-secondary)" }}>Aucun enregistrement</div>
        <div className="text-xs mt-1" style={{ color: "var(--pp-text-muted)" }}>
          Les appels enregistrés et analysés apparaîtront ici.
        </div>
      </div>
    );
  }

  const retryAudio = async (call: RecordingCall) => {
    setStatus(call.id, "uploading");
    try {
      const url = await fetchAudioBlob(call, { retries: 3 });
      const prev = audioBlobCacheRef.current.get(call.id);
      if (prev) { try { URL.revokeObjectURL(prev); } catch {} }
      audioBlobCacheRef.current.set(call.id, url);
      setStatus(call.id, "uploaded");
      onUpdated({ ...call, recording_url: url, has_recording: true, stream_via_proxy: true });
    } catch (e: any) {
      setStatus(call.id, "error");
      toast.error("Enregistrement indisponible", { description: e?.message });
    }
  };

  const top = withRec.slice(0, 5);
  const audioReady = top.filter((c) => audioStatus[c.id] === "uploaded" || /^blob:/i.test(String(c.recording_url ?? ""))).length;
  const txReady = top.filter((c) => !!c.transcript).length;
  const aiReady = top.filter((c) => !!c.ai_summary).length;
  const pct = top.length ? Math.round(((audioReady + txReady + aiReady) / (top.length * 3)) * 100) : 100;
  const showProgress = top.length > 0 && pct < 100;

  return (
    <>
      {showProgress && (
        <div className="px-3 pt-3">
          <div className="rounded-xl p-2.5" style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)" }}>
            <div className="flex items-center justify-between text-[11px] mb-1.5" style={{ color: "var(--pp-text-secondary)" }}>
              <span className="font-semibold">Traitement des {top.length} derniers appels</span>
              <span style={{ color: "var(--pp-text-muted)" }}>{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--pp-bg-border-2)" }}>
              <div className="h-full transition-all"
                   style={{ width: `${pct}%`, background: "linear-gradient(90deg, var(--pp-brand-accent), var(--pp-brand-accent-2))" }} />
            </div>
            <div className="flex items-center justify-between mt-1.5 text-[10px]" style={{ color: "var(--pp-text-muted)" }}>
              <span>Audio {audioReady}/{top.length}</span>
              <span>Transcript {txReady}/{top.length}</span>
              <span>IA {aiReady}/{top.length}</span>
            </div>
          </div>
        </div>
      )}
      <ul className="px-3 pt-3 pb-4 space-y-2">

      {withRec.map((c) => (
        <RecordingCard
          key={c.id}
          call={c}
          onUpdated={onUpdated}
          audioStatus={audioStatus[c.id] ?? "idle"}
          cachedAudioUrl={audioBlobCacheRef.current.get(c.id) ?? null}
          onRetryAudio={() => retryAudio(c)}
        />
      ))}
    </ul>
    </>
  );

}

// ===================== Card =====================
function RecordingCard({
  call, onUpdated, audioStatus, cachedAudioUrl, onRetryAudio,
}: {
  call: RecordingCall;
  onUpdated: (c: RecordingCall) => void;
  audioStatus: AudioStatus;
  cachedAudioUrl: string | null;
  onRetryAudio: () => void;
}) {
  const [open, setOpen] = useState<"rec" | "txt" | "ai" | "crm" | null>(null);
  const temp = tempIcon(call.lead_temperature);


  return (
    <li
      className="rounded-2xl p-3"
      style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate" style={{ color: "var(--pp-text-primary)" }}>
            {otherLabel(call)}
          </div>
          <div className="text-[11px] truncate" style={{ color: "var(--pp-text-muted)" }}>
            {fmtDate(call.started_at)} · {fmtDuration(call.duration_seconds)}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <AudioStatusBadge status={audioStatus} onRetry={onRetryAudio} />
          {temp && (
            <span
              className="text-[10px] font-semibold px-2 py-1 rounded-full flex items-center gap-1"
              style={{ background: `${temp.color}22`, color: temp.color }}
            >
              <temp.Icon className="w-3 h-3" />
              {call.lead_score != null ? `${call.lead_score}` : temp.label}
            </span>
          )}
        </div>
      </div>


      {/* Pipeline progress */}
      <PipelineProgress state={call.pipeline_state ?? inferPipeline(call)} />

      {/* Status pills */}
      <div className="flex items-center gap-1.5 mt-2.5">
        <Pill active={open === "rec"} hasData={hasResolvableAudio(call)} onClick={() => setOpen(open === "rec" ? null : "rec")}
              icon={<Play className="w-3.5 h-3.5" />} label="Audio" />
        <Pill active={open === "txt"} hasData={!!call.transcript} onClick={() => setOpen(open === "txt" ? null : "txt")}
              icon={<FileText className="w-3.5 h-3.5" />} label="Transcript" />
        <Pill active={open === "ai"} hasData={!!call.ai_summary} onClick={() => setOpen(open === "ai" ? null : "ai")}
              icon={<Bot className="w-3.5 h-3.5" />} label="IA" />
        <Pill active={open === "crm"} hasData={!!call.maestro_synced} onClick={() => setOpen(open === "crm" ? null : "crm")}
              icon={<Link2 className="w-3.5 h-3.5" />} label="CRM" />
      </div>

      {/* Sections */}
      {open === "rec" && <RecordingSection call={call} onUpdated={onUpdated} />}
      {open === "txt" && <TranscriptSection call={call} onUpdated={onUpdated} />}
      {open === "ai" && <AISection call={call} onUpdated={onUpdated} />}
      {open === "crm" && <MaestroSyncSection call={call} onUpdated={onUpdated} />}
    </li>
  );
}

function inferPipeline(c: RecordingCall): Pipeline {
  return {
    cdr: c.ns_call_id ? "done" : "pending",
    transcript: c.transcript ? "done" : "pending",
    ai: c.ai_summary ? "done" : "pending",
    maestro: c.maestro_synced ? "done" : "pending",
  };
}

function PipelineProgress({ state }: { state: Pipeline }) {
  const steps: Array<{ k: keyof Pipeline; label: string }> = [
    { k: "cdr", label: "CDR" },
    { k: "transcript", label: "Texte" },
    { k: "ai", label: "IA" },
    { k: "maestro", label: "CRM" },
  ];
  const colorFor = (s?: string) =>
    s === "done" ? "var(--pp-success)" : s === "error" ? "var(--pp-danger)" : "var(--pp-bg-border-2)";
  return (
    <div className="flex items-center gap-1">
      {steps.map((s, i) => (
        <div key={s.k} className="flex-1 flex items-center gap-1">
          <div
            className="flex-1 h-1.5 rounded-full transition-all"
            style={{ background: colorFor(state[s.k]) }}
            title={`${s.label}: ${state[s.k] ?? "pending"}`}
          />
          {i < steps.length - 1 && <span className="w-0.5" />}
        </div>
      ))}
    </div>
  );
}

function Pill({
  active, hasData, onClick, icon, label,
}: { active: boolean; hasData: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium transition"
      style={{
        background: active
          ? "linear-gradient(135deg, var(--pp-brand-accent), var(--pp-brand-accent-2))"
          : hasData ? "var(--pp-bg-elevated)" : "transparent",
        color: active ? "white" : hasData ? "var(--pp-text-secondary)" : "var(--pp-text-muted)",
        border: "1px solid var(--pp-bg-border-2)",
        opacity: hasData || active ? 1 : 0.7,
      }}
    >
      {icon}
      <span>{label}</span>
      {hasData && !active && <Check className="w-3 h-3" style={{ color: "var(--pp-success)" }} />}
    </button>
  );
}

function AudioStatusBadge({ status, onRetry }: { status: AudioStatus; onRetry: () => void }) {
  if (status === "idle") return null;
  if (status === "uploading") {
    return (
      <span className="text-[10px] font-semibold px-2 py-1 rounded-full flex items-center gap-1"
            style={{ background: "rgba(46,155,220,0.12)", color: "var(--pp-brand-accent)" }}>
        <Loader2 className="w-3 h-3 animate-spin" />
        Uploading
      </span>
    );
  }
  if (status === "uploaded") {
    return (
      <span className="text-[10px] font-semibold px-2 py-1 rounded-full flex items-center gap-1"
            style={{ background: "rgba(34,197,94,0.14)", color: "var(--pp-success)" }}>
        <CheckCircle2 className="w-3 h-3" />
        Uploaded
      </span>
    );
  }
  return (
    <button onClick={onRetry}
            className="text-[10px] font-semibold px-2 py-1 rounded-full flex items-center gap-1"
            style={{ background: "rgba(239,68,68,0.14)", color: "var(--pp-danger)" }}>
      <CloudOff className="w-3 h-3" />
      Retry
    </button>
  );
}


// ===================== Recording =====================
function RecordingSection({ call, onUpdated }: { call: RecordingCall; onUpdated: (c: RecordingCall) => void }) {
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const playAfterLoadRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const localObjectUrlRef = useRef<string | null>(null);
  const playableUrl = localUrl ?? (!!call.recording_url && (/^(blob:|data:)/i.test(String(call.recording_url)) || call.stream_via_proxy === false) ? call.recording_url : null);

  const fetchRec = async (opts: { play?: boolean } = {}) => {
    setLoading(true);
    try {
      const url = await fetchAudioBlob(call, { retries: 3 });
      if (localObjectUrlRef.current?.startsWith("blob:")) URL.revokeObjectURL(localObjectUrlRef.current);
      localObjectUrlRef.current = url;
      playAfterLoadRef.current = !!opts.play;
      setLocalUrl(url);
      onUpdated({ ...call, recording_url: url, has_recording: true, stream_via_proxy: true });
      toast.success("Enregistrement chargé");
    } catch (e: any) {
      // Fallback : maestro-recording
      try {
        const { data } = await supabase.functions.invoke("maestro-recording", {
          body: { call_id: callDbId(call), ns_call_id: call.ns_call_id },
        });
        const url = (data as any)?.recording_url;
        if (!url) throw new Error("nope");
        if (localObjectUrlRef.current?.startsWith("blob:")) URL.revokeObjectURL(localObjectUrlRef.current);
        localObjectUrlRef.current = null;
        playAfterLoadRef.current = !!opts.play;
        setLocalUrl(url);
        onUpdated({ ...call, recording_url: url, stream_via_proxy: false });
        toast.success("Enregistrement chargé");
      } catch {
        toast.error("Enregistrement indisponible", { description: e?.message });
      }
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    return () => {
      if (localObjectUrlRef.current?.startsWith("blob:")) URL.revokeObjectURL(localObjectUrlRef.current);
      localObjectUrlRef.current = null;
    };
  }, [call.id]);

  useEffect(() => {
    if (!playAfterLoadRef.current || !playableUrl || !audioRef.current) return;
    playAfterLoadRef.current = false;
    void audioRef.current.play().catch(() => setPlaying(false));
  }, [playableUrl]);

  const seek = (delta: number) => {
      if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(0, Math.min(dur, audioRef.current.currentTime + delta));
  };
  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause(); else audioRef.current.play();
  };
  const setRate = (r: number) => {
    setSpeed(r);
    if (audioRef.current) audioRef.current.playbackRate = r;
  };

  return (
    <div className="mt-3 p-3 rounded-xl space-y-2" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}>
      {!playableUrl ? (
        <button
          onClick={() => fetchRec({ play: true })}
          disabled={loading}
          className="w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
          style={{ background: "var(--pp-bg-surface)", color: "var(--pp-text-primary)", border: "1px solid var(--pp-bg-border-2)" }}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {loading ? "Chargement…" : "Play"}
        </button>
      ) : (
        <>
          <audio
            ref={audioRef}
            src={playableUrl}
            preload="metadata"
            onError={() => { setPlaying(false); toast.error("Audio non disponible"); }}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(e) => setCur((e.target as HTMLAudioElement).currentTime)}
            onLoadedMetadata={(e) => setDur((e.target as HTMLAudioElement).duration || 0)}
            className="hidden"
          />

          <div className="flex items-center gap-2">
            <button onClick={() => seek(-15)} className="w-9 h-9 rounded-full flex items-center justify-center"
                    style={{ background: "var(--pp-bg-surface)", color: "var(--pp-text-secondary)" }}>
              <RotateCcw className="w-4 h-4" />
            </button>
            <button onClick={togglePlay} className="w-11 h-11 rounded-full flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, var(--pp-brand-accent), var(--pp-brand-accent-2))", color: "white" }}>
              {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>
            <button onClick={() => seek(15)} className="w-9 h-9 rounded-full flex items-center justify-center"
                    style={{ background: "var(--pp-bg-surface)", color: "var(--pp-text-secondary)" }}>
              <RotateCw className="w-4 h-4" />
            </button>
            <div className="flex-1 mx-1">
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--pp-bg-border-2)" }}>
                <div className="h-full transition-all" style={{
                  width: dur ? `${(cur / dur) * 100}%` : "0%",
                  background: "linear-gradient(90deg, var(--pp-brand-accent), var(--pp-brand-accent-2))",
                }} />
              </div>
              <div className="flex justify-between text-[10px] mt-0.5" style={{ color: "var(--pp-text-muted)" }}>
                <span>{formatTime(cur)}</span><span>{formatTime(dur)}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              {[0.75, 1, 1.5, 2].map((r) => (
                <button key={r} onClick={() => setRate(r)}
                        className="text-[10px] font-semibold px-2 py-1 rounded-md"
                        style={{
                          background: speed === r ? "var(--pp-brand-accent-2)" : "var(--pp-bg-surface)",
                          color: speed === r ? "white" : "var(--pp-text-secondary)",
                        }}>
                  {r}×
                </button>
              ))}
            </div>
            <a href={playableUrl} download
               className="text-[11px] flex items-center gap-1 px-2 py-1 rounded-md"
               style={{ background: "var(--pp-bg-surface)", color: "var(--pp-text-secondary)" }}>
              <Download className="w-3 h-3" /> MP3
            </a>
          </div>
        </>
      )}
    </div>
  );
}

const formatTime = (s: number) => {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60); const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
};

// ===================== Transcript =====================
function TranscriptSection({ call, onUpdated }: { call: RecordingCall; onUpdated: (c: RecordingCall) => void }) {
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState(false);

  const segments: Array<{ speaker?: string; text: string; start?: number }> = useMemo(() => {
    if (Array.isArray(call.transcript_segments) && call.transcript_segments.length) return call.transcript_segments;
    if (call.transcript) return [{ text: call.transcript }];
    return [];
  }, [call.transcript_segments, call.transcript]);

  const run = async () => {
    setLoading(true);
    try {
      let text: string | null = null;
      let segmentsNext = call.transcript_segments;
      let languageNext = call.transcript_language;
      const nsTranscript = await fetchNsTranscript(call);
      if (nsTranscript) {
        text = nsTranscript.text;
        segmentsNext = nsTranscript.segments;
        languageNext = nsTranscript.language;
      } else {
        const { data, error } = await supabase.functions.invoke("pp-admin-transcribe", {
          body: { call_id: callDbId(call) },
        });
        if (error) throw error;
        const next = (data as any) ?? {};
        if (next.ok === false && next.error) throw new Error(next.hint ?? next.error);
        text = next.transcript ?? null;
        segmentsNext = next.segments ?? segmentsNext;
        languageNext = next.language ?? languageNext;
      }
      const updated = { ...call, transcript: text ?? call.transcript, transcript_segments: segmentsNext, transcript_language: languageNext };
      onUpdated(updated);
      if (text) {
        const { data: coached } = await supabase.functions.invoke("pp-coach-call", {
          body: { call_id: callDbId(call), transcript: text, force: true },
        });
        onUpdated(applyCoachPayload(updated, coached));
      }
      toast.success("Transcription et analyse terminées");
    } catch (e: any) {
      toast.error("Échec transcription", { description: e?.message });
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    const txt = segments.map((s) => `${s.speaker ? s.speaker + ": " : ""}${s.text}`).join("\n");
    await navigator.clipboard.writeText(txt);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mt-3 p-3 rounded-xl space-y-2" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}>
      {segments.length === 0 ? (
        <button
          onClick={run} disabled={loading || !hasResolvableAudio(call)}
          className="w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: "var(--pp-bg-surface)", color: "var(--pp-text-primary)", border: "1px solid var(--pp-bg-border-2)" }}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          {hasResolvableAudio(call) ? "Transcrire l'appel" : "Audio requis"}
        </button>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2" style={{ color: "var(--pp-text-muted)" }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher..."
                     className="w-full pl-7 pr-2 py-1.5 rounded-md text-xs outline-none"
                     style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }} />
            </div>
            <button onClick={copy} className="px-2 py-1.5 rounded-md text-[11px] flex items-center gap-1"
                    style={{ background: "var(--pp-bg-surface)", color: "var(--pp-text-secondary)" }}>
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copié" : "Copier"}
            </button>
          </div>
          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {segments.filter((s) => !q || s.text.toLowerCase().includes(q.toLowerCase())).map((s, i) => {
              const isAgent = (s.speaker || "").toLowerCase().includes("agent") || (s.speaker || "").toLowerCase().includes("courtier") || s.speaker === "A";
              return (
                <div key={i} className={`flex ${isAgent ? "justify-start" : "justify-end"}`}>
                  <div className="max-w-[85%] px-2.5 py-1.5 rounded-xl text-xs"
                       style={{
                         background: isAgent ? "rgba(46,155,220,0.12)" : "var(--pp-bg-surface)",
                         color: "var(--pp-text-primary)",
                         border: "1px solid var(--pp-bg-border-2)",
                       }}>
                    {s.speaker && <div className="text-[9px] font-semibold mb-0.5" style={{ color: "var(--pp-text-muted)" }}>{s.speaker}</div>}
                    <Highlight text={s.text} q={q} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === q.toLowerCase()
          ? <mark key={i} style={{ background: "rgba(245,158,11,0.4)", color: "inherit" }}>{p}</mark>
          : <span key={i}>{p}</span>
      )}
    </>
  );
}

// ===================== AI =====================
function AISection({ call, onUpdated }: { call: RecordingCall; onUpdated: (c: RecordingCall) => void }) {
  const [loading, setLoading] = useState(false);
  const hasAI = !!call.ai_summary;

  const run = async () => {
    setLoading(true);
    try {
      let transcriptForAi = call.transcript;
      let baseCall = call;
      if (!transcriptForAi) {
        const nsTranscript = await fetchNsTranscript(call);
        if (nsTranscript) {
          transcriptForAi = nsTranscript.text;
          baseCall = { ...call, transcript: nsTranscript.text, transcript_segments: nsTranscript.segments, transcript_language: nsTranscript.language };
          onUpdated(baseCall);
        } else {
          const { data: tx, error: txErr } = await supabase.functions.invoke("pp-admin-transcribe", { body: { call_id: callDbId(call) } });
          if (txErr) throw txErr;
          const t = (tx as any)?.transcript;
          if (t) {
            transcriptForAi = t;
            baseCall = { ...call, transcript: t, transcript_segments: (tx as any)?.segments ?? call.transcript_segments, transcript_language: (tx as any)?.language ?? call.transcript_language };
            onUpdated(baseCall);
          }
        }
      }
      if (!transcriptForAi) throw new Error("Transcription indisponible côté système téléphonique");
      const { data, error } = await supabase.functions.invoke("pp-coach-call", {
        body: { call_id: callDbId(call), transcript: transcriptForAi, force: true },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any)?.message ?? (data as any)?.error);
      onUpdated(applyCoachPayload(baseCall, data));
      toast.success("Analyse IA terminée");
    } catch (e: any) {
      toast.error("Échec analyse IA", { description: e?.message });
    } finally {
      setLoading(false);
    }
  };

  if (!hasAI) {
    return (
      <div className="mt-3 p-3 rounded-xl" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}>
        <button onClick={run} disabled={loading}
                className="w-full py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(135deg, var(--pp-agent), var(--pp-brand-accent-2))", color: "white" }}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {call.transcript ? "Analyser avec l'IA" : "Transcrire + Analyser"}
        </button>
      </div>
    );
  }

  const coaching = call.ai_coaching || {};
  const coachingScore: number | undefined = call.coaching_score ?? coaching.score ?? coaching.global_score ?? (call.lead_score != null ? call.lead_score : undefined);
  const insights = call.ai_client_insights || {};
  const objections: string[] = insights.objections || coaching.objections || [];
  const buyingSignals: string[] = insights.buying_signals || [];
  const keyPoints: string[] = Array.isArray(call.ai_key_points) ? call.ai_key_points : (call.ai_key_points?.points || []);
  const tasks: any[] = Array.isArray(call.ai_tasks) ? call.ai_tasks : [];

  return (
    <div className="mt-3 space-y-2">
      {/* Résumé */}
      <Block title="Résumé" icon={<Bot className="w-3.5 h-3.5" />}>
        <p className="text-xs leading-relaxed" style={{ color: "var(--pp-text-secondary)" }}>{call.ai_summary}</p>
        {keyPoints.length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {keyPoints.slice(0, 5).map((p, i) => (
              <li key={i} className="text-[11px] flex gap-1.5" style={{ color: "var(--pp-text-secondary)" }}>
                <span style={{ color: "var(--pp-brand-accent)" }}>•</span>{p}
              </li>
            ))}
          </ul>
        )}
      </Block>

      {/* Coaching */}
      {(coachingScore != null || coaching.strengths || coaching.improvements) && (
        <Block title="Coaching" icon={<Sparkles className="w-3.5 h-3.5" />}>
          {coachingScore != null && (
            <div className="flex items-center gap-3 mb-2">
              <ScoreCircle score={coachingScore} />
              <div className="text-[11px]" style={{ color: "var(--pp-text-muted)" }}>
                Score global de l'appel
              </div>
            </div>
          )}
          {coaching.strengths?.length > 0 && (
            <div className="mb-1.5">
              <div className="text-[10px] font-semibold uppercase mb-0.5" style={{ color: "var(--pp-success)" }}>Forces</div>
              {coaching.strengths.map((s: string, i: number) => (
                <div key={i} className="text-[11px]" style={{ color: "var(--pp-text-secondary)" }}>✓ {s}</div>
              ))}
            </div>
          )}
          {coaching.improvements?.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase mb-0.5" style={{ color: "var(--pp-warning, #f59e0b)" }}>À améliorer</div>
              {coaching.improvements.map((s: string, i: number) => (
                <div key={i} className="text-[11px]" style={{ color: "var(--pp-text-secondary)" }}>→ {s}</div>
              ))}
            </div>
          )}
        </Block>
      )}

      {/* Insights client */}
      {(objections.length > 0 || buyingSignals.length > 0 || call.lead_score != null) && (
        <Block title="Insights client" icon={<User className="w-3.5 h-3.5" />}>
          {call.lead_score != null && (
            <div className="mb-2">
              <div className="flex justify-between text-[10px] mb-1" style={{ color: "var(--pp-text-muted)" }}>
                <span>Lead score</span><span>{call.lead_score}/100</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--pp-bg-border-2)" }}>
                <div className="h-full" style={{
                  width: `${Math.min(100, call.lead_score)}%`,
                  background: call.lead_temperature === "hot"
                    ? "var(--pp-danger)"
                    : call.lead_temperature === "warm"
                    ? "var(--pp-warning, #f59e0b)"
                    : "var(--pp-brand-accent)",
                }} />
              </div>
            </div>
          )}
          {buyingSignals.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1.5">
              {buyingSignals.map((s, i) => (
                <span key={i} className="text-[10px] px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(34,197,94,0.15)", color: "var(--pp-success)" }}>✓ {s}</span>
              ))}
            </div>
          )}
          {objections.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {objections.map((s, i) => (
                <span key={i} className="text-[10px] px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(239,68,68,0.15)", color: "var(--pp-danger)" }}>⚠ {s}</span>
              ))}
            </div>
          )}
        </Block>
      )}

      {/* Actions */}
      {tasks.length > 0 && <TasksBlock call={call} tasks={tasks} />}
    </div>
  );
}

function Block({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="p-3 rounded-xl" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}>
      <div className="flex items-center gap-1.5 mb-1.5 text-[11px] font-semibold uppercase tracking-wide"
           style={{ color: "var(--pp-text-muted)" }}>
        {icon}{title}
      </div>
      {children}
    </div>
  );
}

function ScoreCircle({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  const color = pct >= 80 ? "var(--pp-success)" : pct >= 50 ? "var(--pp-warning, #f59e0b)" : "var(--pp-danger)";
  return (
    <div
      className="relative w-12 h-12 rounded-full flex items-center justify-center"
      style={{ background: `conic-gradient(${color} ${pct * 3.6}deg, var(--pp-bg-border-2) 0)` }}
    >
      <div className="w-9 h-9 rounded-full flex items-center justify-center"
           style={{ background: "var(--pp-bg-surface)", color: "var(--pp-text-primary)" }}>
        <span className="text-xs font-bold">{Math.round(pct)}</span>
      </div>
    </div>
  );
}

function TasksBlock({ call, tasks }: { call: RecordingCall; tasks: any[] }) {
  const [busy, setBusy] = useState<number | "all" | null>(null);

  const createOne = async (idx: number, t: any) => {
    setBusy(idx);
    try {
      const { error } = await supabase.functions.invoke("maestro-task", {
        body: {
          call_id: call.id,
          client_id: call.maestro_client_id,
          title: t.title || t.label,
          description: t.description,
          priority: t.priority || "medium",
          due_date: t.due_date,
        },
      });
      if (error) throw error;
      toast.success("Tâche créée dans Maestro");
    } catch (e: any) {
      toast.error("Échec création tâche", { description: e?.message });
    } finally {
      setBusy(null);
    }
  };

  const createAll = async () => {
    setBusy("all");
    try {
      for (let i = 0; i < tasks.length; i++) await createOne(i, tasks[i]);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Block title="Actions suggérées" icon={<ListChecks className="w-3.5 h-3.5" />}>
      <div className="space-y-1.5">
        {tasks.map((t, i) => (
          <div key={i} className="flex items-start gap-2 p-2 rounded-lg"
               style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)" }}>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium" style={{ color: "var(--pp-text-primary)" }}>
                {t.title || t.label}
              </div>
              {t.description && (
                <div className="text-[10px] mt-0.5" style={{ color: "var(--pp-text-muted)" }}>{t.description}</div>
              )}
              {t.priority && (
                <span className="inline-block mt-1 text-[9px] px-1.5 py-0.5 rounded-full"
                      style={{
                        background: t.priority === "high" ? "rgba(239,68,68,0.15)" : "rgba(46,155,220,0.15)",
                        color: t.priority === "high" ? "var(--pp-danger)" : "var(--pp-brand-accent)",
                      }}>{t.priority}</span>
              )}
            </div>
            <button onClick={() => createOne(i, t)} disabled={busy != null}
                    className="text-[10px] px-2 py-1 rounded-md shrink-0"
                    style={{ background: "var(--pp-brand-accent-2)", color: "white" }}>
              {busy === i ? <Loader2 className="w-3 h-3 animate-spin" /> : "Créer"}
            </button>
          </div>
        ))}
      </div>
      {tasks.length > 1 && (
        <button onClick={createAll} disabled={busy != null}
                className="w-full mt-2 py-1.5 rounded-md text-[11px] font-semibold"
                style={{ background: "var(--pp-bg-surface)", color: "var(--pp-text-primary)", border: "1px solid var(--pp-bg-border-2)" }}>
          {busy === "all" ? "Création…" : "Tout créer dans Maestro"}
        </button>
      )}
    </Block>
  );
}

// ===================== Maestro Sync =====================
function MaestroSyncSection({ call, onUpdated }: { call: RecordingCall; onUpdated: (c: RecordingCall) => void }) {
  const [busy, setBusy] = useState<"sync" | "lookup" | null>(null);

  const sync = async () => {
    setBusy("sync");
    try {
      const { error } = await supabase.functions.invoke("maestro-cdr", { body: { call_id: call.id } });
      if (error) throw error;
      onUpdated({ ...call, maestro_synced: true });
      toast.success("Synchronisé avec Maestro");
    } catch (e: any) {
      toast.error("Sync échouée", { description: e?.message });
    } finally {
      setBusy(null);
    }
  };

  const lookup = async () => {
    setBusy("lookup");
    try {
      const phone = call.direction === "outbound" ? call.to_number : call.from_number;
      const { data, error } = await supabase.functions.invoke("maestro-client-lookup", {
        body: { phone, call_id: call.id },
      });
      if (error) throw error;
      const clientId = (data as any)?.client_id;
      if (clientId) {
        onUpdated({ ...call, maestro_client_id: clientId });
        toast.success("Client lié");
      } else {
        toast.info("Aucun client trouvé");
      }
    } catch (e: any) {
      toast.error("Recherche échouée", { description: e?.message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-3 p-3 rounded-xl space-y-2" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}>
      <div className="flex items-center justify-between">
        <div className="text-[11px]" style={{ color: "var(--pp-text-secondary)" }}>
          Statut Maestro
        </div>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{
                background: call.maestro_synced ? "rgba(34,197,94,0.15)" : "var(--pp-bg-surface)",
                color: call.maestro_synced ? "var(--pp-success)" : "var(--pp-text-muted)",
              }}>
          {call.maestro_synced ? "Synchronisé" : "Non synchronisé"}
        </span>
      </div>
      {call.maestro_client_id && (
        <div className="text-[11px]" style={{ color: "var(--pp-text-secondary)" }}>
          Client : <span className="font-mono">{call.maestro_client_id}</span>
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={lookup} disabled={busy != null}
                className="flex-1 py-2 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1"
                style={{ background: "var(--pp-bg-surface)", color: "var(--pp-text-primary)", border: "1px solid var(--pp-bg-border-2)" }}>
          {busy === "lookup" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
          Rechercher client
        </button>
        <button onClick={sync} disabled={busy != null}
                className="flex-1 py-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1"
                style={{ background: "linear-gradient(135deg, var(--pp-brand-accent), var(--pp-brand-accent-2))", color: "white" }}>
          {busy === "sync" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
          {call.maestro_synced ? "Resynchroniser" : "Synchroniser"}
        </button>
      </div>
    </div>
  );
}
