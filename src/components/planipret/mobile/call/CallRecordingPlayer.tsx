import { useState, useRef, useEffect, useCallback } from "react";
import { Loader2, Play, Pause, SkipBack, SkipForward, Download, RotateCw } from "lucide-react";
import { recordingsApi } from "@/lib/planipret/nsApi";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

interface Props {
  callId: string;
  duration?: number;
}

/**
 * Streams NS-API call recording through the authenticated ns-recordings proxy.
 * The proxy sends the NS Bearer token server-side; we get audio bytes back and
 * render them as a blob URL so the <audio> element can play them.
 */
export function CallRecordingPlayer({ callId, duration = 0 }: Props) {
  const { t } = useMplanipretLang();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(duration);
  const [speed, setSpeed] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = await recordingsApi.fetchAudioUrl(callId);
      setAudioUrl(url);
    } catch (e: any) {
      setError(e?.message ?? "load_error");
    } finally {
      setLoading(false);
    }
  }, [callId]);

  useEffect(() => {
    load();
    return () => {
      setAudioUrl((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return null;
      });
    };
     
  }, [callId]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play();
  };

  const skip = (s: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(0, Math.min(total || duration, audioRef.current.currentTime + s));
  };

  const cycleSpeed = () => {
    const arr = [1, 1.25, 1.5, 2];
    const next = arr[(arr.indexOf(speed) + 1) % arr.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const fmt = (s: number) => {
    if (!isFinite(s) || s < 0) s = 0;
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className="pp-card p-6 flex flex-col items-center gap-2">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--pp-brand-accent)" }} />
        <div className="text-xs" style={{ color: "var(--pp-text-secondary)" }}>{t("calls.loadingAudio") || "Chargement…"}</div>
      </div>
    );
  }

  if (error || !audioUrl) {
    const [errMain, ...errRest] = (error ?? "").split(" — ");
    const errHint = errRest.join(" — ");
    return (
      <div className="pp-card p-4 space-y-3">
        <div className="text-xs" style={{ color: "var(--pp-danger, #E84C4C)" }}>
          ❌ {t("calls.recordingUnavailable") || "Enregistrement indisponible"}
          {errMain ? ` — ${errMain}` : ""}
        </div>
        {errHint && (
          <div className="text-[11px]" style={{ color: "var(--pp-text-secondary)" }}>
            💡 {errHint}
          </div>
        )}
        <button
          onClick={load}
          className="w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2"
          style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}
        >
          <RotateCw className="w-3.5 h-3.5" /> {t("common.retry") || "Réessayer"}
        </button>
      </div>
    );
  }

  const progress = total > 0 ? current / total : 0;

  return (
    <div className="pp-card p-4 space-y-3">
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (isFinite(d) && d > 0) setTotal(d);
        }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />

      {/* Waveform placeholder */}
      <div className="flex items-end justify-between h-12 gap-[2px]">
        {Array.from({ length: 48 }).map((_, i) => {
          const h = 20 + Math.abs(Math.sin(i * 0.55)) * 60;
          const filled = i / 48 < progress;
          return (
            <div
              key={i}
              className="flex-1 rounded-sm"
              style={{
                height: `${h}%`,
                background: filled ? "var(--pp-brand-accent)" : "var(--pp-bg-border-2)",
                opacity: filled ? 0.9 : 0.5,
              }}
            />
          );
        })}
      </div>

      {/* Scrubber */}
      <input
        type="range"
        min={0}
        max={total || duration || 1}
        step={0.1}
        value={current}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          setCurrent(v);
          if (audioRef.current) audioRef.current.currentTime = v;
        }}
        className="w-full"
        style={{ accentColor: "var(--pp-brand-accent)" }}
      />

      <div className="flex justify-between text-[11px]" style={{ color: "var(--pp-text-tertiary, var(--pp-text-secondary))" }}>
        <span>{fmt(current)}</span>
        <span>{fmt(total || duration)}</span>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3">
        <button onClick={() => skip(-15)} className="p-2 rounded-lg" style={ctrl}>
          <SkipBack className="w-4 h-4" />
        </button>
        <button
          onClick={togglePlay}
          className="p-3 rounded-full text-white"
          style={{ background: "linear-gradient(135deg, var(--pp-brand-accent-2), var(--pp-brand-accent))" }}
        >
          {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
        </button>
        <button onClick={() => skip(15)} className="p-2 rounded-lg" style={ctrl}>
          <SkipForward className="w-4 h-4" />
        </button>
        <button onClick={cycleSpeed} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold" style={ctrl}>
          {speed}×
        </button>
        <a href={audioUrl} download={`call_${callId}.mp3`} className="p-2 rounded-lg" style={ctrl}>
          <Download className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}

const ctrl = {
  background: "var(--pp-bg-elevated)",
  border: "1px solid var(--pp-bg-border-2)",
  color: "var(--pp-text-primary)",
} as const;
