import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  BarChart3, Loader2, Sparkles, Headphones, StopCircle,
} from "lucide-react";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

type Period = "day" | "week" | "month";

interface StatsSnapshot {
  calls: number;
  missed: number;
  sms: number;
  voicemails: number;
  meetings: number;
  hotLeads: number;
  tasks: number;
  outbound: number;
}

interface Props {
  stats?: StatsSnapshot;
  lang?: string;
}

const COLORS = ["#2E9BDC", "#E74C3C", "#27AE60", "#9B59B6", "#F39C12", "#1ABC9C", "#6C5CE7", "#E67E22"];

export default function PerformanceReportCard({ stats, lang: propLang }: Props) {
  const { t, lang: hookLang } = useMplanipretLang();
  const lang = propLang ?? hookLang;

  const [busy, setBusy] = useState<Period | null>(null);
  const [activePeriod, setActivePeriod] = useState<Period | null>(null);
  const [report, setReport] = useState<{ period: Period; markdown: string } | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [showChart, setShowChart] = useState(false);

  const run = async (period: Period) => {
    setBusy(period);
    setActivePeriod(period);
    setReport(null);
    try {
      const { data, error } = await supabase.functions.invoke("pp-ava-report", { body: { period } });
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

  const speak = useCallback(() => {
    if (!report?.markdown) return;
    if (speaking) {
      window.speechSynthesis?.cancel();
      setSpeaking(false);
      return;
    }
    const plain = report.markdown
      .replace(/#{1,6}\s/g, "")
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/`/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .trim();
    const utter = new SpeechSynthesisUtterance(plain);
    utter.lang = lang === "en" ? "en-CA" : "fr-CA";
    utter.rate = 0.95;
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    window.speechSynthesis?.speak(utter);
    setSpeaking(true);
  }, [report, speaking, lang]);

  const chartData = stats
    ? [
        { name: lang === "en" ? "Calls" : "Appels", value: stats.calls, color: COLORS[0] },
        { name: lang === "en" ? "Missed" : "Manqués", value: stats.missed, color: COLORS[1] },
        { name: "SMS", value: stats.sms, color: COLORS[2] },
        { name: lang === "en" ? "Meetings" : "Réunions", value: stats.meetings, color: COLORS[3] },
        { name: lang === "en" ? "Hot leads" : "Leads chauds", value: stats.hotLeads, color: COLORS[4] },
        { name: lang === "en" ? "Tasks" : "Tâches", value: stats.tasks, color: COLORS[5] },
        { name: lang === "en" ? "Voicemails" : "Vocaux", value: stats.voicemails, color: COLORS[6] },
        { name: lang === "en" ? "Outbound" : "Sortants", value: stats.outbound, color: COLORS[7] },
      ].filter((d) => d.value > 0)
    : [];

  const periodLabels: Record<Period, string> = {
    day: t("home.reportDay"),
    week: t("home.reportWeek"),
    month: t("home.reportMonth"),
  };

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg,#2E9BDC,#7C3AED)" }}
        >
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold" style={{ color: "var(--pp-text-primary)", fontFamily: "Urbanist,sans-serif" }}>
            {t("home.reportTitle")}
          </div>
          <div className="text-[11px]" style={{ color: "var(--pp-text-muted)" }}>
            {t("home.reportSub")}
          </div>
        </div>
        {chartData.length > 0 && (
          <button
            onClick={() => setShowChart((v) => !v)}
            className="p-1.5 rounded-lg active:scale-95"
            style={{
              background: showChart ? "var(--pp-brand-accent)" : "var(--pp-bg-elevated)",
              color: showChart ? "#fff" : "var(--pp-text-muted)",
              border: "1px solid var(--pp-bg-border-2)",
            }}
          >
            <BarChart3 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Period buttons */}
      <div className="grid grid-cols-3 gap-2 px-4 pb-3">
        {(["day", "week", "month"] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => run(p)}
            disabled={busy !== null}
            className="rounded-xl py-2 text-[12px] font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60 active:scale-95 transition-transform"
            style={{
              background: activePeriod === p ? "var(--pp-brand-accent)" : "var(--pp-bg-elevated)",
              border: `1px solid ${activePeriod === p ? "var(--pp-brand-accent)" : "var(--pp-bg-border-2)"}`,
              color: activePeriod === p ? "#fff" : "var(--pp-text-primary)",
            }}
          >
            {busy === p ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {periodLabels[p]}
          </button>
        ))}
      </div>

      {/* Stats chart */}
      {showChart && chartData.length > 0 && (
        <div className="px-4 pb-3">
          <div
            className="rounded-xl p-3"
            style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--pp-text-muted)" }}>
              {lang === "en" ? "Activity overview" : "Vue d'ensemble de l'activité"}
            </p>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: "var(--pp-text-muted)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: "var(--pp-text-muted)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--pp-bg-surface)",
                    border: "1px solid var(--pp-bg-border)",
                    borderRadius: 8,
                    fontSize: 11,
                    color: "var(--pp-text-primary)",
                  }}
                  cursor={{ fill: "rgba(255,255,255,0.05)" }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
              {chartData.map((d, i) => (
                <div key={i} className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
                  <span className="text-[10px]" style={{ color: "var(--pp-text-muted)" }}>
                    {d.name}: <strong style={{ color: "var(--pp-text-primary)" }}>{d.value}</strong>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Report markdown */}
      {report && (
        <div className="px-4 pb-2">
          <div
            className="rounded-xl p-3 max-h-80 overflow-y-auto text-[13px] leading-relaxed report-md"
            style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}
          >
            <style>{`
              .report-md h2 { font-size: 14px; font-weight: 700; margin: 8px 0 4px; color: var(--pp-text-primary); font-family: Urbanist,sans-serif; }
              .report-md h3 { font-size: 13px; font-weight: 600; margin: 6px 0 3px; color: var(--pp-text-primary); }
              .report-md p { margin: 4px 0; }
              .report-md strong { color: var(--pp-brand-accent); }
              .report-md ul { padding-left: 16px; margin: 4px 0; }
              .report-md li { margin: 2px 0; }
              .report-md hr { border-color: var(--pp-bg-border); margin: 8px 0; }
              .report-md table { width: 100%; border-collapse: collapse; font-size: 11px; }
              .report-md th { background: var(--pp-bg-surface); padding: 4px 6px; text-align: left; font-weight: 600; border-bottom: 1px solid var(--pp-bg-border); }
              .report-md td { padding: 4px 6px; border-bottom: 1px solid var(--pp-bg-border-2); }
            `}</style>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.markdown}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* TTS button */}
      {report && (
        <div className="px-4 pb-4 pt-1">
          <button
            onClick={speak}
            className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 active:scale-95 transition-transform"
            style={{
              background: speaking
                ? "linear-gradient(135deg,#C0392B,#E74C3C)"
                : "linear-gradient(135deg,#1A4A8A,#2E9BDC)",
              color: "#fff",
              boxShadow: "0 4px 14px rgba(46,155,220,0.30)",
            }}
          >
            {speaking ? (
              <><StopCircle className="w-4 h-4" /> {lang === "en" ? "Stop" : "Arrêter"}</>
            ) : (
              <><Headphones className="w-4 h-4" /> {lang === "en" ? "Listen with AVA" : "Écouter avec AVA"}</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
