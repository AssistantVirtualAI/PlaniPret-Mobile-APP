import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BarChart3, Loader2, Sparkles } from "lucide-react";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

type Period = "day" | "week" | "month";

export default function PerformanceReportCard() {
  const { t } = useMplanipretLang();
  const [busy, setBusy] = useState<Period | null>(null);
  const [report, setReport] = useState<{ period: Period; markdown: string } | null>(null);

  const run = async (period: Period) => {
    setBusy(period);
    try {
      const { data, error } = await supabase.functions.invoke("pp-ava-report", { body: { period } });
      if (error) throw error;
      const md = String((data as any)?.report ?? "").trim();
      if (!md) throw new Error("Aucun rapport généré");
      setReport({ period, markdown: md });
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur AVA");
    } finally {
      setBusy(null);
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
            {t("home.reportTitle") ?? "Rapport de performance"}
          </div>
          <div className="text-[11px]" style={{ color: "var(--pp-text-muted)" }}>
            {t("home.reportSub") ?? "Généré par AVA (Claude)"}
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
            {p === "day" ? (t("home.reportDay") ?? "Jour") : p === "week" ? (t("home.reportWeek") ?? "Semaine") : (t("home.reportMonth") ?? "Mois")}
          </button>
        ))}
      </div>
      {report && (
        <div className="mt-3 rounded-xl p-3 max-h-72 overflow-auto text-[12px] leading-relaxed whitespace-pre-wrap"
          style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}>
          {report.markdown}
        </div>
      )}
    </div>
  );
}
