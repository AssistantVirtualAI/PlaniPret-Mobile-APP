import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BarChart3, Headphones, Loader2, Pause, Play, Sparkles } from "lucide-react";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

type Period = "day" | "week" | "month";

const TTL_MS: Record<Period, number> = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

type CacheEntry = { markdown: string; at: number; lang: string };
const cacheKey = (p: Period, lang: string) => `pp.ava.report.${p}.${lang}`;

function loadCache(period: Period, lang: string): CacheEntry | null {
  try {
    const raw = localStorage.getItem(cacheKey(period, lang));
    if (!raw) return null;
    const v = JSON.parse(raw) as CacheEntry;
    if (!v?.markdown || !v?.at) return null;
    if (Date.now() - v.at > TTL_MS[period]) return null;
    return v;
  } catch { return null; }
}
function saveCache(period: Period, lang: string, markdown: string) {
  try {
    localStorage.setItem(cacheKey(period, lang), JSON.stringify({ markdown, at: Date.now(), lang }));
  } catch {}
}

export default function PerformanceReportCard() {
  const { t, lang } = useMplanipretLang();
  const [period, setPeriod] = useState<Period>("day");
  const [busy, setBusy] = useState<Period | null>(null);
  const [ttsBusy, setTtsBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [report, setReport] = useState<{ period: Period; markdown: string } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setPlaying(false);
    setTtsBusy(false);
  };

  const load = async (p: Period, force = false) => {
    // Stop any playing audio when switching reports.
    stopAudio();
    const cached = !force ? loadCache(p, lang) : null;
    if (cached) {
      setReport({ period: p, markdown: cached.markdown });
      return;
    }
    setBusy(p);
    try {
      const { data, error } = await supabase.functions.invoke("pp-ava-report", {
        body: { period: p, language: lang },
      });
      if (error) throw error;
      const md = String((data as any)?.report ?? "").trim();
      if (!md) throw new Error(lang === "en" ? "No report generated" : "Aucun rapport généré");
      saveCache(p, lang, md);
      setReport({ period: p, markdown: md });
    } catch (e: any) {
      toast.error(e?.message ?? (lang === "en" ? "AVA error" : "Erreur AVA"));
    } finally {
      setBusy(null);
    }
  };

  const selectPeriod = (p: Period) => {
    setPeriod(p);
    load(p);
  };

  // Auto-load initial period on mount and when language changes.
  useEffect(() => {
    load(period);
    return () => stopAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const listen = async () => {
    if (!report) return;
    // If audio exists, toggle pause/play.
    if (audioRef.current) {
      if (playing) {
        audioRef.current.pause();
        setPlaying(false);
      } else {
        try { await audioRef.current.play(); setPlaying(true); } catch {}
      }
      return;
    }
    setTtsBusy(true);
    try {
      const clean = report.markdown.replace(/[#*_`>-]/g, "").replace(/\s+\n/g, "\n").slice(0, 3800);
      const { data, error } = await supabase.functions.invoke("pp-ava-tts", {
        body: { text: clean, language: lang },
      });
      if (error) throw error;
      const b64 = (data as any)?.audioContent;
      if (!b64) throw new Error(lang === "en" ? "No audio returned" : "Aucun audio reçu");
      const audio = new Audio(`data:audio/mpeg;base64,${b64}`);
      audioRef.current = audio;
      audio.onended = () => { audioRef.current = null; setPlaying(false); };
      audio.onerror = () => { audioRef.current = null; setPlaying(false); };
      audio.onpause = () => { if (audioRef.current) setPlaying(false); };
      audio.onplay = () => setPlaying(true);
      await audio.play();
      setPlaying(true);
    } catch (e: any) {
      toast.error(e?.message ?? (lang === "en" ? "Voice unavailable" : "Voix indisponible"));
    } finally {
      setTtsBusy(false);
    }
  };

  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border)" }}>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg,#2E9BDC,#7C3AED)" }}>
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold" style={{ color: "var(--pp-text-primary)" }}>
            {t("home.reportTitle")}
          </div>
          <div className="text-[11px]" style={{ color: "var(--pp-text-muted)" }}>
            {t("home.reportSub")}
          </div>
        </div>
        <BarChart3 className="w-4 h-4" style={{ color: "var(--pp-text-muted)" }} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(["day", "week", "month"] as Period[]).map((p) => {
          const active = period === p;
          return (
            <button
              key={p}
              onClick={() => selectPeriod(p)}
              disabled={busy !== null}
              className="rounded-xl py-2 text-[12px] font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60"
              style={{
                background: active ? "rgba(46,155,220,0.15)" : "var(--pp-bg-elevated)",
                border: `1px solid ${active ? "rgba(46,155,220,0.5)" : "var(--pp-bg-border-2)"}`,
                color: "var(--pp-text-primary)",
              }}
            >
              {busy === p ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {p === "day" ? t("home.reportDay") : p === "week" ? t("home.reportWeek") : t("home.reportMonth")}
            </button>
          );
        })}
      </div>
      {busy === period && !report && (
        <div className="mt-3 flex items-center justify-center py-6" style={{ color: "var(--pp-text-muted)" }}>
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      )}
      {report && (
        <>
          <div className="mt-3 rounded-xl p-3 max-h-72 overflow-auto text-[12px] leading-relaxed whitespace-pre-wrap"
            style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}>
            {report.markdown}
          </div>
          <button
            onClick={listen}
            disabled={ttsBusy}
            className="mt-3 w-full py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60"
            style={{ background: "rgba(108,92,231,0.10)", border: "1px solid rgba(108,92,231,0.30)", color: "var(--pp-agent)" }}
          >
            {ttsBusy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : playing ? (
              <Pause className="w-3.5 h-3.5" />
            ) : audioRef.current ? (
              <Play className="w-3.5 h-3.5" />
            ) : (
              <Headphones className="w-3.5 h-3.5" />
            )}
            {t("home.reportListen")}
          </button>
        </>
      )}
    </div>
  );
}
