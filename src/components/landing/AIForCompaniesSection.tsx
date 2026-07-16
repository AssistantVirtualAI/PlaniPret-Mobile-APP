import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Home, Shield, ShoppingBag, Briefcase, TrendingDown, TrendingUp, Clock, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/hooks/useTranslation";

const MiniChatMock = ({ delay = 0, lines = 2 }: { delay?: number; lines?: number }) => (
  <div className="space-y-2 py-1">
    {Array.from({ length: lines }).map((_, i) => (
      <motion.div
        key={i}
        initial={{ opacity: 0, x: i % 2 === 0 ? -10 : 10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, delay: delay + i * 0.2 }}
        className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}
      >
        <Skeleton
          className={`h-2.5 rounded-full ${i % 2 === 0 ? "w-3/4" : "w-1/2"}`}
          style={{ animationDelay: `${delay + i * 0.3}s` }}
        />
      </motion.div>
    ))}
  </div>
);

interface IndustryCard {
  icon: React.ElementType;
  titleKey: string;
  descKey: string;
  stat: string;
  statIcon: React.ElementType;
  statColor: string;
  chatLines: number;
}

const CARDS: IndustryCard[] = [
  {
    icon: Home,
    titleKey: "aiCompanies.card1.title",
    descKey: "aiCompanies.card1.desc",
    stat: "-72%",
    statIcon: TrendingDown,
    statColor: "text-green-500",
    chatLines: 3,
  },
  {
    icon: Shield,
    titleKey: "aiCompanies.card2.title",
    descKey: "aiCompanies.card2.desc",
    stat: "3×",
    statIcon: Clock,
    statColor: "text-primary",
    chatLines: 2,
  },
  {
    icon: ShoppingBag,
    titleKey: "aiCompanies.card3.title",
    descKey: "aiCompanies.card3.desc",
    stat: "89%",
    statIcon: CheckCircle,
    statColor: "text-primary",
    chatLines: 4,
  },
  {
    icon: Briefcase,
    titleKey: "aiCompanies.card4.title",
    descKey: "aiCompanies.card4.desc",
    stat: "+40%",
    statIcon: TrendingUp,
    statColor: "text-green-500",
    chatLines: 3,
  },
];

const IndustryCard = ({ card, index }: { card: IndustryCard; index: number }) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const Icon = card.icon;
  const StatIcon = card.statIcon;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay: index * 0.12 }}
      whileHover={{ y: -4 }}
      className="rounded-2xl border border-border bg-card p-6 shadow-sm hover:shadow-lg hover:border-primary/20 transition-all duration-300 flex flex-col gap-4"
    >
      {/* Icon + Title */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground text-sm leading-tight">
            {t(card.titleKey)}
          </h3>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {t(card.descKey)}
          </p>
        </div>
      </div>

      {/* Mini animated chat mock */}
      <div className="rounded-xl bg-muted/40 border border-border/50 p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-muted-foreground font-medium">AI Agent</span>
        </div>
        <MiniChatMock delay={index * 0.2} lines={card.chatLines} />
      </div>

      {/* Impact stat */}
      <div className="flex items-center gap-3 pt-1 border-t border-border/40">
        <StatIcon className={`w-4 h-4 ${card.statColor}`} />
        <motion.span
          className={`text-2xl font-bold ${card.statColor}`}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={isInView ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.5, delay: index * 0.12 + 0.4, type: "spring" }}
        >
          {card.stat}
        </motion.span>
        <span className="text-xs text-muted-foreground">
          {t(`aiCompanies.card${index + 1}.statLabel`)}
        </span>
      </div>
    </motion.div>
  );
};

export const AIForCompaniesSection = () => {
  const { t } = useTranslation();

  return (
    <section className="py-20 px-4 bg-muted/20 relative overflow-hidden">
      {/* Decorative background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 bg-primary/5 rounded-full blur-3xl translate-x-1/3 -translate-y-1/3" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-primary/5 rounded-full blur-3xl -translate-x-1/3 translate-y-1/3" />
      </div>

      <div className="container mx-auto max-w-6xl relative">
        {/* Header */}
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <Badge variant="outline" className="mb-4 border-primary/30 text-primary bg-primary/5 px-4 py-1.5">
            {t("aiCompanies.badge")}
          </Badge>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            {t("aiCompanies.title")}
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {t("aiCompanies.subtitle")}
          </p>
        </motion.div>

        {/* Cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {CARDS.map((card, i) => (
            <IndustryCard key={i} card={card} index={i} />
          ))}
        </div>

        {/* Bottom note */}
        <motion.p
          className="text-center text-sm text-muted-foreground mt-10"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          {t("aiCompanies.footnote")}
        </motion.p>
      </div>
    </section>
  );
};
