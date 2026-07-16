import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Building2, Bot, BarChart3 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";

export const CTASection = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <section className="py-32 relative overflow-hidden">
      {/* Vivid gradient background */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/25 via-secondary/20 to-accent/25" />
      <div className="absolute inset-0 bg-gradient-to-t from-background/50 to-transparent" />

      {/* Floating glassmorphism portal elements */}
      <motion.div
        animate={{ y: [0, -20, 0], rotate: [0, 3, 0] }}
        transition={{ duration: 6, repeat: Infinity }}
        className="absolute top-16 left-[10%] w-32 h-20 rounded-xl bg-card/20 backdrop-blur-sm border border-border/20 hidden lg:flex items-center justify-center"
      >
        <Bot className="w-6 h-6 text-primary/40" />
      </motion.div>
      <motion.div
        animate={{ y: [0, 15, 0], rotate: [0, -2, 0] }}
        transition={{ duration: 7, repeat: Infinity }}
        className="absolute top-24 right-[12%] w-28 h-16 rounded-xl bg-card/20 backdrop-blur-sm border border-border/20 hidden lg:flex items-center justify-center"
      >
        <BarChart3 className="w-5 h-5 text-secondary/40" />
      </motion.div>
      <motion.div
        animate={{ y: [0, -10, 0], rotate: [0, 2, 0] }}
        transition={{ duration: 5, repeat: Infinity }}
        className="absolute bottom-20 left-[15%] w-24 h-14 rounded-xl bg-card/20 backdrop-blur-sm border border-border/20 hidden lg:flex items-center justify-center"
      >
        <Building2 className="w-5 h-5 text-accent/40" />
      </motion.div>

      {/* Animated orbs */}
      <motion.div
        animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.4, 0.2] }}
        transition={{ duration: 4, repeat: Infinity }}
        className="absolute top-1/4 left-1/4 w-72 h-72 bg-primary/25 rounded-full blur-3xl"
      />
      <motion.div
        animate={{ scale: [1.3, 1, 1.3], opacity: [0.2, 0.4, 0.2] }}
        transition={{ duration: 5, repeat: Infinity }}
        className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-secondary/25 rounded-full blur-3xl"
      />

      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-4xl mx-auto"
        >
          {/* Icon */}
          <motion.div
            initial={{ scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 200 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-primary to-secondary mb-8 shadow-2xl shadow-primary/30"
          >
            <Sparkles className="w-10 h-10 text-primary-foreground" />
          </motion.div>

          <h2 className="text-5xl md:text-6xl lg:text-7xl font-extrabold mb-6 leading-tight">
            {t("cta.title")}
          </h2>

          <p className="text-xl md:text-2xl text-muted-foreground mb-6 max-w-2xl mx-auto">
            {t("cta.subtitle")}
          </p>

          {/* Social proof */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-card/30 backdrop-blur-sm border border-border/30 mb-10"
          >
            <div className="flex -space-x-2">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-8 h-8 rounded-full border-2 border-background"
                  style={{
                    background: `linear-gradient(135deg, hsl(${200 + i * 30}, 70%, 55%), hsl(${220 + i * 30}, 70%, 45%))`,
                  }}
                />
              ))}
            </div>
            <span className="text-sm font-medium">{t("cta.socialProof")}</span>
          </motion.div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                size="lg"
                className="h-16 px-10 text-lg font-semibold bg-gradient-to-r from-primary to-secondary hover:opacity-90 shadow-2xl shadow-primary/30"
                onClick={() => navigate("/demo-request")}
              >
                {t("cta.cta2")}
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </motion.div>

            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                size="lg"
                variant="outline"
                className="h-16 px-10 text-lg font-semibold border-2"
                onClick={() => navigate("/login")}
              >
                {t("cta.cta1")}
              </Button>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
