import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BarChart3, Headphones, Loader2, Sparkles, Square } from "lucide-react";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

type Period = "day" | "week" | "month";

export default function PerformanceReportCard() {
  const { t, lang } = useMplanipretLang();
  const [busy, setBusy] = useState<Period | null>(null);
  const [ttsBusy, setTtsBusy] = useState(false);
  const [report, setReport] = useState<{ period: Period; markdown: string } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const run = async (period: Period) => {
    setBusy(period);
    try {
      const { data, error } = await supabase.functions.invoke("pp-ava-report", {
        body: { period, language: lang },
      });
      if (error) throw error;
      const md = String((data as any)?.report ?? "").trim();
      if (!md) throw new Error(lang === "en" ? "No report generated" : "Aucun rapport généré");
      setReport({ period, markdown: md });
    } catch (e: any) {
      toast.error(e?.message ?? (lang === "en" ? "AVA error" : "Erreur AVA"));
    } finally {
      setBusy(null);
    }
  };

  const stopAudio = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setTtsBusy(false);
  };

  const listen = async () => {
    if (!report) return;
    if (audioRef.current) { stopAudio(); return; }
    setTtsBusy(true);
    try {
      // Strip markdown for cleaner speech.
      const clean = report.markdown.replace(/[#*_`>-]/g, "").replace(/\s+\n/g, "\n").slice(0, 3800);
      const { data, error } = await supabase.functions.invoke("pp-ava-tts", {
        body: { text: clean, language: lang },
      });
      if (error) throw error;
      const b64 = (data as any)?.audioContent;
      if (!b64) throw new Error(lang === "en" ? "No audio returned" : "Aucun audio reçu");
      const audio = new Audio(`data:audio/mpeg;base64,${b64}`);
      audioRef.current = audio;
      audio.onended = () => { audioRef.current = null; setTtsBusy(false); };
      audio.onerror = () => { audioRef.current = null; setTtsBusy(false); };
      await audio.play();
    } catch (e: any) {
      setTtsBusy(false);
      toast.error(e?.message ?? (lang === "en" ? "Voice unavailable" : "Voix indisponible"));
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
        {(["day", "week", "month"] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => run(p)}
            disabled={busy !== null}
            className="rounded-xl py-2 text-[12px] font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60"
            style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}
          >
            {busy === p ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {p === "day" ? t("home.reportDay") : p === "week" ? t("home.reportWeek") : t("home.reportMonth")}
          </button>
        ))}
      </div>
      {report && (
        <>
          <div className="mt-3 rounded-xl p-3 max-h-72 overflow-auto text-[12px] leading-relaxed whitespace-pre-wrap"
            style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}>
            {report.markdown}
          </div>
          <button
            onClick={listen}
            disabled={ttsBusy && !audioRef.current}
            className="mt-3 w-full py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60"
            style={{ background: "rgba(108,92,231,0.10)", border: "1px solid rgba(108,92,231,0.30)", color: "var(--pp-agent)" }}
          >
            {audioRef.current ? <Square className="w-3.5 h-3.5" /> : ttsBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Headphones className="w-3.5 h-3.5" />}
            {t("home.reportListen")}
          </button>
        </>
      )}
    </div>
  );
}
