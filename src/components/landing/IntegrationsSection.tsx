import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Phone,
  Bot,
  Plug,
  BarChart3,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export const IntegrationsSection = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const cards = [
    {
      icon: Bot,
      title: t("landing.integrations.cards.voicePlatforms.title"),
      description: t("landing.integrations.cards.voicePlatforms.description"),
      bullets: [
        t("landing.integrations.cards.voicePlatforms.b1"),
        t("landing.integrations.cards.voicePlatforms.b2"),
        t("landing.integrations.cards.voicePlatforms.b3"),
      ],
    },
    {
      icon: Phone,
      title: t("landing.integrations.cards.twilio.title"),
      description: t("landing.integrations.cards.twilio.description"),
      bullets: [
        t("landing.integrations.cards.twilio.b1"),
        t("landing.integrations.cards.twilio.b2"),
        t("landing.integrations.cards.twilio.b3"),
        t("landing.integrations.cards.twilio.b4"),
        t("landing.integrations.cards.twilio.b5"),
      ],
      ctaLabel: t("landing.integrations.cards.twilio.cta"),
      ctaAction: () => navigate("/login"),
    },
    {
      icon: Plug,
      title: t("landing.integrations.cards.automation.title"),
      description: t("landing.integrations.cards.automation.description"),
      bullets: [
        t("landing.integrations.cards.automation.b1"),
        t("landing.integrations.cards.automation.b2"),
        t("landing.integrations.cards.automation.b3"),
      ],
    },
    {
      icon: BarChart3,
      title: t("landing.integrations.cards.analytics.title"),
      description: t("landing.integrations.cards.analytics.description"),
      bullets: [
        t("landing.integrations.cards.analytics.b1"),
        t("landing.integrations.cards.analytics.b2"),
        t("landing.integrations.cards.analytics.b3"),
      ],
    },
  ] as const;

  return (
    <section className="py-28 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/5 to-background" />
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[780px] h-[780px] rounded-full bg-secondary/10 blur-3xl" />

      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-14"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary mb-6">
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium">{t("landing.integrations.badge")}</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-bold mb-4">{t("landing.integrations.title")}</h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            {t("landing.integrations.subtitle")}
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 gap-6"
        >
          {cards.map((card) => (
            <motion.article
              key={card.title}
              variants={itemVariants}
              className="relative rounded-3xl p-7 bg-card/50 backdrop-blur-xl border border-border/60 overflow-hidden"
            >
              <div className="absolute inset-0 opacity-60 bg-gradient-to-br from-primary/10 via-transparent to-secondary/10" />
              <div className="relative">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-xl shadow-primary/20">
                    <card.icon className="w-6 h-6 text-primary-foreground" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold mb-1">{card.title}</h3>
                    <p className="text-muted-foreground">{card.description}</p>
                  </div>
                </div>

                <ul className="mt-5 space-y-2">
                  {card.bullets.map((b) => (
                    <li key={b} className="text-sm text-muted-foreground flex gap-2">
                      <span className="mt-1 w-1.5 h-1.5 rounded-full bg-primary/60" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>

                {"ctaLabel" in card && card.ctaLabel ? (
                  <div className="mt-6">
                    <Button
                      onClick={card.ctaAction}
                      className="bg-gradient-to-r from-primary to-secondary hover:opacity-90"
                    >
                      {card.ctaLabel}
                      <ExternalLink className="ml-2 w-4 h-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
};
