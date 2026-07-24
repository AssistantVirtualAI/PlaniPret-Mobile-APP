import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BarChart3, Loader2, Sparkles, Headphones } from "lucide-react";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

type Period = "day" | "week" | "month";

export default function PerformanceReportCard() {
  const { t, lang } = useMplanipretLang();
  const [busy, setBusy] = useState<Period | null>(null);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [report, setReport] = useState<{ period: Period; markdown: string } | null>(null);

  const run = async (period: Period) => {
    setBusy(period);
    try {
      const { data, error } = await supabase.functions.invoke("pp-ava-report", {
        body: { period, lang },
      });
      if (error) throw error;
      const md = String((data as any)?.report ?? "").trim();
      if (!md) throw new Error(lang === "fr" ? "Aucun rapport généré" : "No report generated");
      setReport({ period, markdown: md });
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur AVA");
    } finally {
      setBusy(null);
    }
  };

  const listenWithAva = async () => {
    if (!report) return;
    setTtsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("pp-ava-tts", {
        body: {
          text: report.markdown.replace(/#{1,6}\s/g, "").replace(/\*\*/g, "").replace(/\*/g, "").trim(),
          language: lang,
        },
      });
      if (error) throw error;
      const audioBase64 = (data as any)?.audio;
      if (!audioBase64) throw new Error("No audio returned");
      const binary = atob(audioBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch (e: any) {
      toast.error(e?.message ?? "TTS error");
    } finally {
      setTtsLoading(false);
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
            {p === "day"
              ? t("home.reportDay")
              : p === "week"
              ? t("home.reportWeek")
              : t("home.reportMonth")}
          </button>
        ))}
      </div>

      {report && (
        <>
          <div
            className="mt-3 rounded-xl p-3 max-h-72 overflow-auto text-[12px] leading-relaxed whitespace-pre-wrap"
            style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}
          >
            {report.markdown}
          </div>
          <button
            onClick={listenWithAva}
            disabled={ttsLoading}
            className="mt-2 w-full rounded-xl py-2.5 text-[13px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: "linear-gradient(135deg,#2E9BDC,#7C3AED)", color: "#fff" }}
          >
            {ttsLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Headphones className="w-4 h-4" />
            )}
            {t("home.reportListen")}
          </button>
        </>
      )}
    </div>
  );
}
