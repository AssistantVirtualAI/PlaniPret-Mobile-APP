import { motion } from "framer-motion";
import { Bot, Users, BarChart3, BookOpen, Globe2, Zap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";

const featureIcons = [Bot, Users, BarChart3, BookOpen, Globe2, Zap];
const featureColors = [
  { bg: "from-primary/15 to-secondary/10", icon: "from-primary to-secondary" },
  { bg: "from-secondary/15 to-accent/10", icon: "from-secondary to-accent" },
  { bg: "from-accent/15 to-primary/10", icon: "from-accent to-primary" },
  { bg: "from-primary/10 to-accent/10", icon: "from-primary to-accent" },
  { bg: "from-secondary/10 to-primary/10", icon: "from-secondary to-primary" },
  { bg: "from-accent/10 to-secondary/10", icon: "from-accent to-secondary" },
];

/* Mini-animation per card */
const FeatureAnimation = ({ index }: { index: number }) => {
  switch (index) {
    case 0: // Bot — pulsing waveform
      return (
        <div className="flex items-end gap-0.5 h-5 mt-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <motion.div
              key={i}
              className="w-1 rounded-full bg-primary/50"
              animate={{ height: [3, 12 + Math.sin(i) * 6, 3] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.08 }}
            />
          ))}
        </div>
      );
    case 1: // Users — count up
      return (
        <motion.div
          className="text-2xl font-bold text-secondary/60 mt-2"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          <motion.span
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            +247
          </motion.span>
        </motion.div>
      );
    case 2: // BarChart3 — mini bars
      return (
        <div className="flex items-end gap-1 h-6 mt-3">
          {[40, 65, 45, 80, 55, 70].map((h, i) => (
            <motion.div
              key={i}
              className="w-2 bg-gradient-to-t from-accent/50 to-accent/20 rounded-t-sm"
              initial={{ height: 0 }}
              whileInView={{ height: `${h}%` }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
            />
          ))}
        </div>
      );
    case 3: // BookOpen — animated page
      return (
        <motion.div
          className="mt-3 w-8 h-6 border border-primary/30 rounded-sm bg-primary/5"
          animate={{ rotateY: [0, 15, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          style={{ transformOrigin: "left center" }}
        />
      );
    case 4: // Globe — rotate
      return (
        <motion.div
          className="mt-2"
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        >
          <Globe2 className="w-6 h-6 text-secondary/40" />
        </motion.div>
      );
    case 5: // Zap — pulse
      return (
        <motion.div
          className="mt-2"
          animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          <Zap className="w-5 h-5 text-accent/60" />
        </motion.div>
      );
    default:
      return null;
  }
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export const FeaturesSection = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const featureKeys = ["feature1", "feature2", "feature3", "feature4", "feature5", "feature6"] as const;

  return (
    <section className="py-32 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-secondary/5 to-background" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-3xl opacity-50" />

      <div className="container mx-auto px-6 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-20"
        >
          <motion.div
            initial={{ scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary mb-6"
          >
            <Zap className="w-4 h-4" />
            <span className="text-sm font-medium">{t("features.badge")}</span>
          </motion.div>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold mb-6">{t("features.title")}</h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">{t("features.subtitle")}</p>
        </motion.div>

        {/* Features grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16"
        >
          {featureKeys.map((key, index) => {
            const Icon = featureIcons[index];
            const colors = featureColors[index];

            return (
              <motion.div
                key={key}
                variants={itemVariants}
                whileHover={{ y: -8, scale: 1.02 }}
                transition={{ type: "spring", stiffness: 300 }}
                className={`relative p-8 rounded-3xl bg-gradient-to-br ${colors.bg} backdrop-blur-xl border border-border/50 group cursor-pointer min-h-[220px]`}
              >
                <div className={`absolute inset-0 rounded-3xl bg-gradient-to-br ${colors.icon} opacity-0 group-hover:opacity-10 transition-opacity duration-150`} />
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${colors.icon} flex items-center justify-center mb-4 shadow-lg`}>
                  <Icon className="w-8 h-8 text-primary-foreground" />
                </div>
                <h3 className="text-xl font-bold mb-2">{t(`features.${key}.title`)}</h3>
                <p className="text-muted-foreground text-sm">{t(`features.${key}.description`)}</p>
                <FeatureAnimation index={index} />
              </motion.div>
            );
          })}
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex flex-wrap justify-center gap-8 md:gap-16 mb-16"
        >
          {["stat1", "stat2", "stat3"].map((stat, index) => (
            <motion.div
              key={stat}
              initial={{ scale: 0 }}
              whileInView={{ scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="text-center"
            >
              <div className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-2">
                {t(`features.${stat}.value`)}
              </div>
              <div className="text-muted-foreground">{t(`features.${stat}.label`)}</div>
            </motion.div>
          ))}
        </motion.div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Button
            size="lg"
            variant="outline"
            className="h-12 px-6"
            onClick={() => navigate("/features")}
          >
            {t("features.seeAll")}
            <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
        </motion.div>
      </div>
    </section>
  );
};
