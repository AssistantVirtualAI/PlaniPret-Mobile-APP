import { useState } from "react";
import { Sparkles, RefreshCw, TrendingUp, Building2, PieChart, AlertTriangle, CalendarDays } from "lucide-react";
import type { CommissionInsight } from "@/lib/planipret/commissionStats";
import imgGrowth from "@/assets/commissions/insight-growth.jpg";
import imgLenders from "@/assets/commissions/insight-lenders.jpg";
import imgProducts from "@/assets/commissions/insight-products.jpg";
import imgRisk from "@/assets/commissions/insight-risk.jpg";

const ART: Record<string, { img: string; accent: string; Icon: any }> = {
  growth: { img: imgGrowth, accent: "#2E9BDC", Icon: TrendingUp },
  lenders: { img: imgLenders, accent: "#00D4AA", Icon: Building2 },
  products: { img: imgProducts, accent: "#9B7FE8", Icon: PieChart },
  risk: { img: imgRisk, accent: "#E8A33C", Icon: AlertTriangle },
  seasonality: { img: imgGrowth, accent: "#4AC9E3", Icon: CalendarDays },
};

const SEV: Record<string, string> = { positive: "#00D4AA", neutral: "#2E9BDC", warning: "#E8A33C" };

export default function CommissionInsights({
  lang, summary, insights, loading, error, onGenerate, generated, context,
}: {
  lang: "fr" | "en";
  /** Label of the tab currently displayed — the analysis is contextual. */
  context?: string;
  summary: string;
  insights: CommissionInsight[];
  loading: boolean;
  error?: string | null;
  generated: boolean;
  onGenerate: () => void;
}) {
  const [flipped, setFlipped] = useState<number | null>(null);
  const T = (fr: string, en: string) => (lang === "en" ? en : fr);

  return (
    <div
      className="rounded-2xl relative overflow-hidden"
      style={{
        padding: 16,
        border: "1px solid var(--pp-bg-border-2)",
        background:
          "radial-gradient(1200px 320px at 12% -10%, rgba(46,155,220,.20), transparent 60%), radial-gradient(900px 300px at 88% 110%, rgba(155,127,232,.18), transparent 60%), var(--pp-bg-card, var(--pp-bg-deep))",
        boxShadow: "0 24px 60px -40px rgba(0,0,0,.95), 0 1px 0 rgba(255,255,255,.05) inset",
      }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="rounded-xl flex items-center justify-center shrink-0"
            style={{ width: 34, height: 34, background: "linear-gradient(140deg,#2E9BDC,#9B7FE8)", boxShadow: "0 8px 22px -10px #2E9BDC" }}
          >
            <Sparkles className="w-4 h-4 text-white" />
          </span>
          <div className="min-w-0">
            <h3 style={{ fontSize: 14, fontWeight: 800, color: "var(--pp-text-primary)", letterSpacing: "-.01em" }}>
              {T("Insights IA", "AI insights")}{context ? ` — ${context}` : ""}
            </h3>
            <p style={{ fontSize: 10.5, color: "var(--pp-text-faint)" }}>
              {T("Analyse générée automatiquement par Claude à partir de vos données Maestro", "Generated automatically by Claude from your Maestro data")}
            </p>
          </div>
        </div>
        <button
          onClick={onGenerate}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg text-[12px] flex items-center gap-1.5 text-white disabled:opacity-60"
          style={{ background: "linear-gradient(120deg,#2E9BDC,#9B7FE8)" }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? T("Analyse…", "Analyzing…") : T("Actualiser", "Refresh")}
        </button>
      </div>

      {error && (
        <p className="mt-3" style={{ fontSize: 12, color: "#E84C4C" }}>{error}</p>
      )}

      {!generated && loading && (
        <p className="mt-3" style={{ fontSize: 12, color: "var(--pp-text-muted)", maxWidth: 640 }}>
          {T("Analyse des données en cours…", "Analyzing the data…")}
        </p>
      )}

      {summary && (
        <p className="mt-3" style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--pp-text-primary)", maxWidth: 900 }}>
          {summary}
        </p>
      )}

      {insights.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mt-4">
          {insights.map((it, i) => {
            const art = ART[it.category] ?? ART.growth;
            const isOpen = flipped === i;
            return (
              <button
                key={`${it.title}-${i}`}
                onClick={() => setFlipped(isOpen ? null : i)}
                className="text-left rounded-xl relative overflow-hidden transition-transform duration-300 hover:-translate-y-1"
                style={{
                  border: "1px solid var(--pp-bg-border-2)",
                  background: "var(--pp-bg-deep)",
                  boxShadow: isOpen
                    ? `0 22px 44px -26px ${art.accent}, 0 0 0 1px ${art.accent}55 inset`
                    : "0 16px 34px -28px rgba(0,0,0,.9)",
                  transformStyle: "preserve-3d",
                }}
              >
                <div className="relative" style={{ height: 82, overflow: "hidden" }}>
                  <img
                    src={art.img}
                    alt=""
                    loading="lazy"
                    width={1024}
                    height={512}
                    className="w-full h-full object-cover"
                    style={{ transform: isOpen ? "scale(1.08)" : "scale(1)", transition: "transform .4s ease", opacity: .9 }}
                  />
                  <span style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, transparent 10%, var(--pp-bg-deep) 96%)` }} />
                  <span
                    className="absolute left-3 top-3 rounded-lg flex items-center justify-center"
                    style={{ width: 26, height: 26, background: `${art.accent}26`, border: `1px solid ${art.accent}66`, color: art.accent, backdropFilter: "blur(6px)" }}
                  >
                    <art.Icon className="w-3.5 h-3.5" />
                  </span>
                  {it.metric && (
                    <span
                      className="absolute right-3 top-3 rounded-full px-2 py-0.5 tabular-nums"
                      style={{ fontSize: 10.5, fontWeight: 800, color: SEV[it.severity] ?? art.accent, background: "rgba(0,0,0,.45)", border: `1px solid ${(SEV[it.severity] ?? art.accent)}55`, backdropFilter: "blur(6px)" }}
                    >
                      {it.metric}
                    </span>
                  )}
                </div>
                <div style={{ padding: "8px 12px 12px" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--pp-text-primary)" }}>{it.title}</div>
                  <p className="mt-1" style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--pp-text-muted)" }}>{it.finding}</p>
                  {it.action && (
                    <p
                      className="mt-2 rounded-lg"
                      style={{
                        fontSize: 11, lineHeight: 1.45, padding: "7px 9px",
                        color: "var(--pp-text-primary)",
                        background: `${art.accent}14`, borderLeft: `2px solid ${art.accent}`,
                        maxHeight: isOpen ? 200 : 0, overflow: "hidden",
                        opacity: isOpen ? 1 : 0, transition: "all .3s ease",
                        marginTop: isOpen ? 8 : 0, paddingTop: isOpen ? 7 : 0, paddingBottom: isOpen ? 7 : 0,
                      }}
                    >
                      {it.action}
                    </p>
                  )}
                  <span className="block mt-2" style={{ fontSize: 10, color: "var(--pp-text-faint)" }}>
                    {isOpen ? T("Masquer la recommandation", "Hide recommendation") : T("Voir la recommandation", "See recommendation")}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
