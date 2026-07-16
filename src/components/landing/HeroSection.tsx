import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, Play, Bot, BarChart3, MessageSquare, Phone, Users, BookOpen, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";

const portalModules = [
  { icon: Bot, label: "Agents" },
  { icon: MessageSquare, label: "Conversations" },
  { icon: BarChart3, label: "Analytics" },
  { icon: Phone, label: "Telephony" },
  { icon: BookOpen, label: "Knowledge" },
  { icon: Users, label: "Clients" },
  { icon: Settings, label: "Settings" },
];

export const HeroSection = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <section className="relative min-h-screen flex items-center justify-center pt-24 pb-16 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-background to-secondary/8" />

      {/* Large glowing orbs */}
      <motion.div
        animate={{ scale: [1, 1.3, 1], opacity: [0.15, 0.3, 0.15] }}
        transition={{ duration: 8, repeat: Infinity }}
        className="absolute top-1/4 -left-48 w-[500px] h-[500px] bg-primary/20 rounded-full blur-3xl"
      />
      <motion.div
        animate={{ scale: [1.3, 1, 1.3], opacity: [0.15, 0.3, 0.15] }}
        transition={{ duration: 10, repeat: Infinity }}
        className="absolute bottom-1/4 -right-48 w-[500px] h-[500px] bg-secondary/20 rounded-full blur-3xl"
      />

      <div className="container mx-auto px-6 relative z-10">
        <div className="max-w-6xl mx-auto text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-semibold mb-8">
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              >
                ✨
              </motion.span>
              {t("hero.badge")}
            </span>
          </motion.div>

          {/* Title — big and bold */}
          <motion.h1
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="text-6xl md:text-7xl lg:text-8xl font-extrabold leading-[0.95] mb-6 tracking-tight"
          >
            <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
              {t("hero.title1")}
            </span>
            <br />
            <span className="text-foreground">{t("hero.title2")}</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto mb-6"
          >
            {t("hero.subtitle")}
          </motion.p>

          {/* Anti-tagline */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.35 }}
            className="flex items-center justify-center gap-3 mb-10"
          >
            <div className="relative">
              <div className="flex gap-1.5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="w-4 h-3 rounded-sm bg-muted-foreground/30 border border-muted-foreground/20" />
                ))}
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-full h-0.5 bg-destructive/70 rotate-[-15deg]" />
              </div>
            </div>
            <span className="text-sm font-medium text-muted-foreground">
              {t("hero.noMoreTabs")}
            </span>
          </motion.div>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20"
          >
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                size="lg"
                className="h-16 px-10 text-lg font-semibold bg-gradient-to-r from-primary to-secondary hover:opacity-90 shadow-2xl shadow-primary/30"
                onClick={() => navigate("/demo-request")}
              >
                {t("hero.cta1")}
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
                <Play className="mr-2 w-5 h-5" />
                {t("hero.cta2")}
              </Button>
            </motion.div>
          </motion.div>

          {/* Faux Portal UI Strip */}
          <motion.div
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="relative max-w-5xl mx-auto"
          >
            {/* Glow behind */}
            <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 via-secondary/10 to-accent/20 rounded-3xl blur-2xl" />

            <div className="relative rounded-2xl border border-border/60 bg-card/80 backdrop-blur-xl overflow-hidden shadow-2xl">
              {/* Top bar */}
              <div className="flex items-center gap-2 px-5 py-3 border-b border-border/50 bg-muted/30">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-destructive/60" />
                  <div className="w-3 h-3 rounded-full bg-warning/60" />
                  <div className="w-3 h-3 rounded-full bg-success/60" />
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="px-6 py-1 rounded-full bg-muted/50 text-xs text-muted-foreground font-mono">
                    app.avastatistic.com
                  </div>
                </div>
              </div>

              {/* Portal content */}
              <div className="flex">
                {/* Sidebar */}
                <div className="w-16 md:w-20 border-r border-border/40 bg-muted/20 py-4 flex flex-col items-center gap-3">
                  {portalModules.map((mod, index) => (
                    <motion.div
                      key={mod.label}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.7 + index * 0.08 }}
                      className={`w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center transition-all duration-150 cursor-default ${
                        index === 0
                          ? "bg-gradient-to-br from-primary to-secondary shadow-lg shadow-primary/25"
                          : "bg-muted/40 hover:bg-muted/70"
                      }`}
                    >
                      <mod.icon
                        className={`w-4 h-4 md:w-5 md:h-5 ${
                          index === 0 ? "text-primary-foreground" : "text-muted-foreground"
                        }`}
                      />
                    </motion.div>
                  ))}
                </div>

                {/* Main content area */}
                <div className="flex-1 p-4 md:p-6 min-h-[200px] md:min-h-[280px]">
                  <div className="grid grid-cols-3 gap-3 md:gap-4 mb-4">
                    {[
                      { label: t("hero.mockStat1"), value: "2,847", color: "from-primary/20 to-primary/5" },
                      { label: t("hero.mockStat2"), value: "94.2%", color: "from-secondary/20 to-secondary/5" },
                      { label: t("hero.mockStat3"), value: "12", color: "from-accent/20 to-accent/5" },
                    ].map((stat, i) => (
                      <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 1.0 + i * 0.1 }}
                        className={`rounded-xl bg-gradient-to-br ${stat.color} border border-border/40 p-3 md:p-4`}
                      >
                        <div className="text-xs text-muted-foreground mb-1">{stat.label}</div>
                        <div className="text-lg md:text-2xl font-bold">{stat.value}</div>
                      </motion.div>
                    ))}
                  </div>

                  {/* Faux chart area */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.3 }}
                    className="rounded-xl bg-gradient-to-br from-muted/30 to-muted/10 border border-border/40 p-4 h-24 md:h-32 flex items-end gap-1"
                  >
                    {Array.from({ length: 20 }).map((_, i) => (
                      <motion.div
                        key={i}
                        className="flex-1 bg-gradient-to-t from-primary/40 to-primary/10 rounded-t-sm"
                        initial={{ height: 0 }}
                        animate={{ height: `${30 + Math.sin(i * 0.8) * 25 + Math.random() * 20}%` }}
                        transition={{ delay: 1.4 + i * 0.03, duration: 0.5 }}
                      />
                    ))}
                  </motion.div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
      >
        <span className="text-sm text-muted-foreground">{t("hero.scrollDown")}</span>
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="w-6 h-10 rounded-full border-2 border-muted-foreground/50 flex justify-center pt-2"
        >
          <motion.div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
        </motion.div>
      </motion.div>
    </section>
  );
};
