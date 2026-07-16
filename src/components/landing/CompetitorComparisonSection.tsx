import { motion } from "framer-motion";
import { Check, X, Minus, ArrowRight, Zap, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/hooks/useTranslation";
import { useNavigate } from "react-router-dom";

interface FeatureRow {
  feature: string;
  ava: true | string;
  chatdash: boolean | string;
  generic: boolean | string;
  custom: boolean | string;
}

const OUR_COLOR = "hsl(var(--primary))";

const CellValue = ({
  value,
  highlight = false,
}: {
  value: boolean | string;
  highlight?: boolean;
}) => {
  if (value === true)
    return (
      <div className={`flex justify-center ${highlight ? "text-primary" : "text-success"}`}>
        <div
          className={`w-6 h-6 rounded-full flex items-center justify-center ${
            highlight ? "bg-primary text-primary-foreground" : "bg-success/10"
          }`}
        >
          <Check className="w-3.5 h-3.5" strokeWidth={3} />
        </div>
      </div>
    );
  if (value === false)
    return (
      <div className="flex justify-center text-muted-foreground/40">
        <X className="w-5 h-5" />
      </div>
    );
  if (value === "partial")
    return (
      <div className="flex justify-center text-muted-foreground">
        <Minus className="w-5 h-5" />
      </div>
    );
  return (
    <div className={`text-center text-xs font-medium ${highlight ? "text-primary" : "text-muted-foreground"}`}>
      {value}
    </div>
  );
};

export const CompetitorComparisonSection = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const rows: FeatureRow[] = [
    {
      feature: t("competitorComparison.rows.multiPortal"),
      ava: true,
      chatdash: false,
      generic: false,
      custom: "partial",
    },
    {
      feature: t("competitorComparison.rows.voiceProviders"),
      ava: t("competitorComparison.avaVoice"),
      chatdash: t("competitorComparison.oneProvider"),
      generic: false,
      custom: "partial",
    },
    {
      feature: t("competitorComparison.rows.clientPortal"),
      ava: true,
      chatdash: false,
      generic: false,
      custom: true,
    },
    {
      feature: t("competitorComparison.rows.twilioBuiltIn"),
      ava: true,
      chatdash: false,
      generic: false,
      custom: false,
    },
    {
      feature: t("competitorComparison.rows.aiAnalytics"),
      ava: true,
      chatdash: "partial",
      generic: false,
      custom: false,
    },
    {
      feature: t("competitorComparison.rows.whiteLabel"),
      ava: true,
      chatdash: false,
      generic: false,
      custom: true,
    },
    {
      feature: t("competitorComparison.rows.knowledgeBase"),
      ava: true,
      chatdash: "partial",
      generic: "partial",
      custom: true,
    },
    {
      feature: t("competitorComparison.rows.setup"),
      ava: t("competitorComparison.avaSetup"),
      chatdash: t("competitorComparison.hours"),
      generic: t("competitorComparison.weeks"),
      custom: t("competitorComparison.months"),
    },
    {
      feature: t("competitorComparison.rows.pricing"),
      ava: t("competitorComparison.avaPricing"),
      chatdash: t("competitorComparison.chatdashPricing"),
      generic: t("competitorComparison.genericPricing"),
      custom: t("competitorComparison.customPricing"),
    },
  ];

  const columns = [
    { key: "ava", label: "AVA Platform", isOurs: true },
    { key: "chatdash", label: "ChatDash", isOurs: false },
    { key: "generic", label: t("competitorComparison.genericLabel"), isOurs: false },
    { key: "custom", label: t("competitorComparison.customLabel"), isOurs: false },
  ];

  return (
    <section className="py-24 px-4 bg-background relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[300px] bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto max-w-6xl relative">
        {/* Header */}
        <motion.div
          className="text-center mb-14"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <Badge
            variant="outline"
            className="mb-4 border-primary/30 text-primary bg-primary/5 px-4 py-1.5 inline-flex items-center gap-2"
          >
            <Trophy className="w-3.5 h-3.5" />
            {t("competitorComparison.badge")}
          </Badge>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-5">
            {t("competitorComparison.title")}
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {t("competitorComparison.subtitle")}
          </p>
        </motion.div>

        {/* Comparison table */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="rounded-2xl border border-border overflow-hidden shadow-xl mb-12"
        >
          {/* Column headers */}
          <div className="grid grid-cols-5 border-b border-border">
            {/* Feature label col */}
            <div className="p-4 bg-muted/30 border-r border-border" />
            {columns.map((col) => (
              <div
                key={col.key}
                className={`p-4 flex flex-col items-center justify-center text-center border-r last:border-r-0 border-border ${
                  col.isOurs
                    ? "bg-primary/8 border-primary/20"
                    : "bg-muted/20"
                }`}
              >
                {col.isOurs && (
                  <div className="flex items-center gap-1 mb-1">
                    <Zap className="w-3 h-3 text-primary" />
                    <span className="text-xs font-semibold text-primary uppercase tracking-wide">
                      {t("competitorComparison.recommended")}
                    </span>
                  </div>
                )}
                <span
                  className={`text-sm font-bold ${
                    col.isOurs ? "text-primary" : "text-foreground"
                  }`}
                >
                  {col.label}
                </span>
              </div>
            ))}
          </div>

          {/* Rows */}
          <div className="divide-y divide-border">
            {rows.map((row, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
                className="grid grid-cols-5 hover:bg-muted/20 transition-colors"
              >
                {/* Feature name */}
                <div className="p-4 border-r border-border flex items-center">
                  <span className="text-sm font-medium text-foreground">{row.feature}</span>
                </div>
                {/* AVA */}
                <div className="p-4 border-r border-border flex items-center justify-center bg-primary/4">
                  <CellValue value={row.ava} highlight />
                </div>
                {/* ChatDash */}
                <div className="p-4 border-r border-border flex items-center justify-center">
                  <CellValue value={row.chatdash} />
                </div>
                {/* Generic */}
                <div className="p-4 border-r border-border flex items-center justify-center">
                  <CellValue value={row.generic} />
                </div>
                {/* Custom */}
                <div className="p-4 flex items-center justify-center">
                  <CellValue value={row.custom} />
                </div>
              </motion.div>
            ))}
          </div>

          {/* Legend row */}
          <div className="p-4 bg-muted/20 border-t border-border flex flex-wrap gap-4 justify-center text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3} />
              </div>
              {t("competitorComparison.legendIncluded")}
            </div>
            <div className="flex items-center gap-1.5">
              <Minus className="w-4 h-4 text-muted-foreground" />
              {t("competitorComparison.legendPartial")}
            </div>
            <div className="flex items-center gap-1.5">
              <X className="w-4 h-4 text-muted-foreground/40" />
              {t("competitorComparison.legendMissing")}
            </div>
          </div>
        </motion.div>

        {/* Why AVA wins — 3 highlight cards */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-14"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          {[
            {
              icon: "🚀",
              titleKey: "competitorComparison.why1.title",
              descKey: "competitorComparison.why1.desc",
            },
            {
              icon: "🏗️",
              titleKey: "competitorComparison.why2.title",
              descKey: "competitorComparison.why2.desc",
            },
            {
              icon: "🔒",
              titleKey: "competitorComparison.why3.title",
              descKey: "competitorComparison.why3.desc",
            },
          ].map((card, i) => (
            <motion.div
              key={i}
              whileHover={{ y: -4 }}
              transition={{ duration: 0.2 }}
              className="rounded-2xl border border-primary/20 bg-primary/5 p-6"
            >
              <div className="text-3xl mb-3">{card.icon}</div>
              <h3 className="font-semibold text-foreground mb-2 text-sm">{t(card.titleKey)}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{t(card.descKey)}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* CTA */}
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <p className="text-2xl md:text-3xl font-bold text-foreground mb-3">
            {t("competitorComparison.ctaHeadline")}
          </p>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            {t("competitorComparison.ctaSubline")}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
              <Button
                size="lg"
                className="h-13 px-8 gap-2 shadow-xl shadow-primary/25"
                onClick={() => navigate("/demo-request")}
              >
                {t("competitorComparison.ctaButton")}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
              <Button
                size="lg"
                variant="outline"
                className="h-13 px-8"
                onClick={() => navigate("/auth")}
              >
                {t("competitorComparison.ctaSecondary")}
              </Button>
            </motion.div>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            {t("competitorComparison.ctaFootnote")}
          </p>
        </motion.div>
      </div>
    </section>
  );
};
