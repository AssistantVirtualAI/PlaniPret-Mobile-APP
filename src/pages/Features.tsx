import { motion } from "framer-motion";
import { Navbar } from "@/components/landing/Navbar";
import { FooterSection } from "@/components/landing/FooterSection";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";

type Bi = { fr: string; en: string };

const sections: Array<{ id: string; title: Bi; items: Bi[] }> = [
  {
    id: "agent-creation",
    title: { fr: "Création & sync d'agents", en: "Agent creation & sync" },
    items: [
      { fr: "Wizard guidé pour créer des agents dans le portail Admin", en: "Guided wizard to create agents inside the Admin Portal" },
      { fr: "Templates de prompts + assistant IA (review & apply)", en: "Prompt templates + AI assistant (review & apply)" },
      { fr: "Sélection & pré-écoute des voix", en: "Voice selection & preview" },
      { fr: "Paramètres avancés (comportement, langue, style, sécurité)", en: "Advanced settings (behavior, language, style, safety)" },
      { fr: "Synchronisation vers plateformes vocales (sans changer d'interface)", en: "Sync to voice platforms (without switching interfaces)" },
    ],
  },
  {
    id: "telephony",
    title: { fr: "Suite téléphonie", en: "Telephony suite" },
    items: [
      { fr: "Recherche & achat de numéros", en: "Search & purchase numbers" },
      { fr: "Routage dynamique / webhooks", en: "Dynamic routing / webhooks" },
      { fr: "Enregistrements : activation + lecture sécurisée", en: "Recordings: enablement + secure playback" },
      { fr: "Monitoring temps réel des appels actifs", en: "Real-time monitoring of active calls" },
      { fr: "Analytics d'usage et performance", en: "Usage and performance analytics" },
    ],
  },
  {
    id: "analytics-ai",
    title: { fr: "Analytics & IA (insights)", en: "Analytics & AI (insights)" },
    items: [
      { fr: "Dashboards temps réel (conversations, minutes, satisfaction)", en: "Real-time dashboards (conversations, minutes, satisfaction)" },
      { fr: "Analyse conversation : sentiment, timeline, tags intelligents", en: "Conversation analysis: sentiment, timeline, smart tags" },
      { fr: "Topic analysis : sujets + requêtes mal comprises", en: "Topic analysis: topics + misunderstood queries" },
      { fr: "Rapports IA (périodiques) + recommandations", en: "AI reports (periodic) + recommendations" },
      { fr: "Suggestions d'amélioration de prompt & first message", en: "Suggestions to improve prompt & first message" },
    ],
  },
  {
    id: "conversations",
    title: { fr: "Conversations & monitoring", en: "Conversations & monitoring" },
    items: [
      { fr: "Liste + filtres + détails", en: "List + filters + details" },
      { fr: "Transcripts + analyses", en: "Transcripts + analyses" },
      { fr: "Exports (selon modules)", en: "Exports (depending on modules)" },
      { fr: "Monitoring temps réel", en: "Real-time monitoring" },
    ],
  },
  {
    id: "knowledge",
    title: { fr: "Base de connaissances", en: "Knowledge base" },
    items: [
      { fr: "Documents + catégories", en: "Documents + categories" },
      { fr: "Association par agent", en: "Per-agent association" },
      { fr: "Accès côté client (lecture / édition selon rôle)", en: "Client-side access (read/edit depending on role)" },
    ],
  },
  {
    id: "clients",
    title: { fr: "Clients & portails", en: "Clients & portals" },
    items: [
      { fr: "Gestion multi-clients", en: "Multi-client management" },
      { fr: "Membres clients + accès par agent", en: "Client members + per-agent access" },
      { fr: "White-label : branding, thème, URLs", en: "White-label: branding, theme, URLs" },
      { fr: "Widget configurateur + code embed", en: "Widget configurator + embed code" },
    ],
  },
  {
    id: "automation",
    title: { fr: "Automatisation & intégrations", en: "Automation & integrations" },
    items: [
      { fr: "Workflow builder", en: "Workflow builder" },
      { fr: "Webhooks + router d'événements", en: "Webhooks + event router" },
      { fr: "API Explorer : Webhook manager + MCP manager", en: "API Explorer: Webhook manager + MCP manager" },
    ],
  },
  {
    id: "security",
    title: { fr: "Sécurité & administration", en: "Security & administration" },
    items: [
      { fr: "Rôles & permissions", en: "Roles & permissions" },
      { fr: "Audit logs", en: "Audit logs" },
      { fr: "Gestion des clés API", en: "API key management" },
      { fr: "Billing / trial / abonnement", en: "Billing / trial / subscription" },
    ],
  },
];

export default function FeaturesPage() {
  const navigate = useNavigate();
  const { t, language } = useTranslation();

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      <Navbar />
      <main className="pt-24">
        <section className="py-16 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-background to-background" />
          <div className="container mx-auto px-6 relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="max-w-4xl mx-auto text-center"
            >
              <h1 className="text-4xl md:text-5xl font-bold mb-4">{t('features.page.title')}</h1>
              <p className="text-xl text-muted-foreground mb-8">
                {t('features.page.subtitle')}
              </p>

              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Button
                  className="bg-gradient-to-r from-primary to-secondary hover:opacity-90"
                  onClick={() => navigate("/demo-request")}
                >
                  {t('features.page.bookDemo')}
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
                <Button variant="outline" onClick={() => navigate("/")}>{t('features.page.backToLanding')}</Button>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="py-10">
          <div className="container mx-auto px-6">
            <div className="max-w-4xl mx-auto">
              <Accordion type="multiple" className="w-full">
                {sections.map((s) => (
                  <AccordionItem key={s.id} value={s.id} className="border-border/60">
                    <AccordionTrigger>
                      <div className="text-left">
                        <div className="font-semibold">{s.title[language]}</div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <ul className="space-y-2 py-2">
                        {s.items.map((it, idx) => (
                          <li key={idx} className="text-sm text-muted-foreground">
                            <div className="flex gap-2">
                              <span className="mt-2 w-1.5 h-1.5 rounded-full bg-primary/60" />
                              <div className="text-foreground/90">{it[language]}</div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>
        </section>
      </main>
      <FooterSection />
    </div>
  );
}
