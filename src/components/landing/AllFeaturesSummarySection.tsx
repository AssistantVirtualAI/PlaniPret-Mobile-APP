import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Bot,
  Users,
  BarChart3,
  Phone,
  ArrowRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/context/LanguageContext";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45 } },
};

type Copy = {
  title: { fr: string; en: string };
  subtitle: { fr: string; en: string };
  groups: Array<{
    icon: React.ComponentType<{ className?: string }>;
    title: { fr: string; en: string };
    bullets: Array<{ fr: string; en: string }>;
  }>;
};

const copy: Copy = {
  title: {
    fr: "Tout est inclus — clairement, côté Admin et côté Client",
    en: "Everything is included — clearly, for Admin and for Client",
  },
  subtitle: {
    fr: "Résumé complet sur une page, puis liste exhaustive sur /features.",
    en: "Complete summary here, then the full exhaustive list on /features.",
  },
  groups: [
    {
      icon: Bot,
      title: { fr: "Portail Admin (agence)", en: "Admin Portal (agency)" },
      bullets: [
        {
          fr: "Création d’agents directement dans le portail (wizard guidé)",
          en: "Create agents directly inside the portal (guided wizard)",
        },
        {
          fr: "Templates + assistant IA pour améliorer prompts & first message",
          en: "Templates + AI assistant to improve prompts & first message",
        },
        {
          fr: "Base de connaissances : documents, catégories, mapping par agent",
          en: "Knowledge base: documents, categories, per-agent mapping",
        },
        {
          fr: "Conversations : filtres, détails, analyse, export",
          en: "Conversations: filters, details, analysis, export",
        },
        {
          fr: "Gestion multi-clients + membres + rôles et permissions",
          en: "Multi-client management + members + roles & permissions",
        },
        {
          fr: "API Keys + API Explorer (webhooks, MCP, connecteurs)",
          en: "API Keys + API Explorer (webhooks, MCP, connectors)",
        },
      ],
    },
    {
      icon: Users,
      title: { fr: "Portail Client (white-label)", en: "Client Portal (white-label)" },
      bullets: [
        {
          fr: "Dashboard simplifié : KPIs et tendances par agent assigné",
          en: "Simplified dashboard: KPIs and trends per assigned agent",
        },
        {
          fr: "Conversations en temps réel, transcript, tags et insights",
          en: "Real-time conversations, transcript, tags and insights",
        },
        {
          fr: "Accès base de connaissances (lecture ou édition selon rôle)",
          en: "Knowledge base access (read or edit depending on role)",
        },
        {
          fr: "Gestion des membres client + accès par agent",
          en: "Client member management + per-agent access",
        },
        {
          fr: "Personnalisation : branding, thème, widget, URL",
          en: "Customization: branding, theme, widget, URL",
        },
      ],
    },
    {
      icon: BarChart3,
      title: { fr: "Analytics & suggestions IA", en: "AI analytics & suggestions" },
      bullets: [
        {
          fr: "Dashboards avancés (minutes, satisfaction, résolution, tendances)",
          en: "Advanced dashboards (minutes, satisfaction, resolution, trends)",
        },
        {
          fr: "Analyse des conversations : sentiment, timeline, smart tags",
          en: "Conversation analysis: sentiment, timeline, smart tags",
        },
        {
          fr: "Topic analysis : sujets principaux + requêtes mal comprises",
          en: "Topic analysis: main topics + misunderstood queries",
        },
        {
          fr: "Rapports IA hebdo / par période + recommandations actionnables",
          en: "AI reports (weekly/period) + actionable recommendations",
        },
        {
          fr: "Assistant d’amélioration de prompt (review & apply)",
          en: "Prompt improvement assistant (review & apply)",
        },
        {
          fr: "Exports (PDF / CSV selon modules) pour équipes & clients",
          en: "Exports (PDF / CSV depending on modules) for teams & clients",
        },
      ],
    },
    {
      icon: Phone,
      title: { fr: "Téléphonie, automatisation & sécurité", en: "Telephony, automation & security" },
      bullets: [
        {
          fr: "Suite téléphonie : numéros, routage, enregistrements, monitoring",
          en: "Telephony suite: numbers, routing, recordings, live monitoring",
        },
        {
          fr: "Webhooks & endpoints (par agent / par org) + logs",
          en: "Webhooks & endpoints (per agent / org) + logs",
        },
        {
          fr: "Workflows & automation builder",
          en: "Workflows & automation builder",
        },
        {
          fr: "Gestion des clés API + contrôle d’accès",
          en: "API key management + access control",
        },
        {
          fr: "Audit & sécurité : logs, rôles, permissions",
          en: "Audit & security: logs, roles, permissions",
        },
      ],
    },
  ],
};

export function AllFeaturesSummarySection() {
  const navigate = useNavigate();
  const { language } = useLanguage();

  const pick = <T extends { fr: string; en: string }>(v: T) =>
    language === "fr" ? v.fr : v.en;

  return (
    <section className="py-28 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/5 to-background" />

      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-4">{pick(copy.title)}</h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">{pick(copy.subtitle)}</p>

          <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              className="bg-gradient-to-r from-primary to-secondary hover:opacity-90"
              onClick={() => navigate("/features")}
            >
              {language === "fr" ? "Liste complète" : "Full feature list"}
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
            <Button variant="outline" onClick={() => navigate("/demo-request")}>
              {language === "fr" ? "Demander une démo" : "Book a demo"}
            </Button>
          </div>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 gap-6"
        >
          {copy.groups.map((g) => (
            <motion.article
              key={g.title.en}
              variants={itemVariants}
              className="relative rounded-3xl p-7 bg-card/50 backdrop-blur-xl border border-border/60 overflow-hidden"
            >
              <div className="absolute inset-0 opacity-60 bg-gradient-to-br from-primary/10 via-transparent to-secondary/10" />
              <div className="relative">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-xl shadow-primary/20">
                    <g.icon className="w-6 h-6 text-primary-foreground" />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-lg">{pick(g.title)}</div>
                  </div>
                </div>

                <ul className="mt-5 space-y-2">
                  {g.bullets.map((b) => (
                    <li key={b.en} className="text-sm text-muted-foreground">
                      <div className="flex gap-2">
                        <span className="mt-2 w-1.5 h-1.5 rounded-full bg-primary/60" />
                        <div>{pick(b)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
