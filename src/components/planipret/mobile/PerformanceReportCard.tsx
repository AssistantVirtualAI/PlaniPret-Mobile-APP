import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BarChart3, Loader2, Sparkles, Headphones } from "lucide-react";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

type Period = "day" | "week" | "month";

interface CacheEntry {
  markdown: string;
  fetchedAt: number; // timestamp ms
}

// In-memory cache — survives re-renders, cleared on page reload
const reportCache: Partial<Record<Period, CacheEntry>> = {};
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export default function PerformanceReportCard() {
  const { t, lang } = useMplanipretLang();
  const [busy, setBusy] = useState<Period | null>(null);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [report, setReport] = useState<{ period: Period; markdown: string } | null>(null);

  const run = useCallback(async (period: Period) => {
    // Use cache if fresh (< 24h)
    const cached = reportCache[period];
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      setReport({ period, markdown: cached.markdown });
      return;
    }

    setBusy(period);
    try {
      const { data, error } = await supabase.functions.invoke("pp-ava-report", {
        body: { period, lang },
      });
      if (error) throw error;
      const md = String((data as any)?.report ?? "").trim();
      if (!md) throw new Error(lang === "fr" ? "Aucun rapport généré" : "No report generated");

      // Store in cache
      reportCache[period] = { markdown: md, fetchedAt: Date.now() };
      setReport({ period, markdown: md });
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur AVA");
    } finally {
      setBusy(null);
    }
  }, [lang]);

  const listenWithAva = async () => {
    if (!report) return;
    setTtsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("pp-ava-tts", {
        body: {
          text: report.markdown.slice(0, 3500), // stay under 4000 char limit
          language: lang,
        },
      });
      if (error) throw error;
      const audioBase64 = (data as any)?.audioContent ?? (data as any)?.audio;
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

  const periodLabels: Record<Period, string> = {
    day: t("home.reportDay"),
    week: t("home.reportWeek"),
    month: t("home.reportMonth"),
  };

  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border)" }}>
      {/* Header */}
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

      {/* Period buttons */}
      <div className="grid grid-cols-3 gap-2">
        {(["day", "week", "month"] as Period[]).map((p) => {
          const isCached = !!(reportCache[p] && Date.now() - reportCache[p]!.fetchedAt < CACHE_TTL_MS);
          const isActive = report?.period === p;
          return (
            <button
              key={p}
              onClick={() => run(p)}
              disabled={busy !== null}
              className="rounded-xl py-2 text-[12px] font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60"
              style={{
                background: isActive ? "var(--pp-brand-accent)" : "var(--pp-bg-elevated)",
                border: `1px solid ${isActive ? "var(--pp-brand-accent)" : "var(--pp-bg-border-2)"}`,
                color: isActive ? "#fff" : "var(--pp-text-primary)",
              }}
            >
              {busy === p ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : isCached && !isActive ? (
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--pp-brand-accent)", display: "inline-block" }} />
              ) : null}
              {periodLabels[p]}
            </button>
          );
        })}
      </div>

      {/* Report content */}
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
