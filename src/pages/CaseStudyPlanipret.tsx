import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Navbar } from "@/components/landing/Navbar";
import { FooterSection } from "@/components/landing/FooterSection";
import { PlanipretShowcaseSection } from "@/components/landing/PlanipretShowcaseSection";
import { CaseStudyTestimonials } from "@/components/landing/CaseStudyTestimonials";
import { CaseStudyGallery } from "@/components/landing/CaseStudyGallery";
import { CaseStudyFAQ } from "@/components/landing/CaseStudyFAQ";
import { useLanguage } from "@/context/LanguageContext";
import { useEffect } from "react";
import mobileHero from "@/assets/planipret-mobile-hero.jpg.asset.json";
import adminDashboard from "@/assets/planipret-admin-dashboard.jpg.asset.json";
import mobileSms from "@/assets/planipret-mobile-sms.jpg.asset.json";
import mobileEmail from "@/assets/planipret-mobile-email.jpg.asset.json";
import mobileAnalytics from "@/assets/planipret-mobile-analytics.jpg.asset.json";
import adminMaestro from "@/assets/planipret-admin-maestro.jpg.asset.json";
import heroStats from "@/assets/planipret-hero-stats.jpg.asset.json";

const ACCENT = "#2E9BDC";

export default function CaseStudyPlanipret() {
  const { language } = useLanguage();

  useEffect(() => {
    document.title = language === "en"
      ? "Planiprêt case study — AVA Statistic"
      : "Étude de cas Planiprêt — AVA Statistic";
    const desc = language === "en"
      ? "How Planiprêt brokers use AVA voice + chat AI, mobile app, admin portal, Maestro CRM and Microsoft 365 integrations."
      : "Comment les courtiers Planiprêt utilisent AVA (voix + chat), application mobile, portail admin, CRM Maestro et Microsoft 365.";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", desc);
  }, [language]);

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      <Navbar />
      <div className="container mx-auto px-6 pt-24 pb-4">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {language === "en" ? "Back to home" : "Retour à l'accueil"}
        </Link>
      </div>
      <PlanipretShowcaseSection />

      <CaseStudyGallery
        accent={ACCENT}
        titleFr="Explorez chaque écran"
        titleEn="Explore every screen"
        images={[
          { url: mobileHero.url, alt: "App mobile Planiprêt", caption: "Home courtier" },
          { url: mobileSms.url, alt: "SMS + AI Improve", caption: "SMS + AI Improve" },
          { url: mobileEmail.url, alt: "Outlook mobile", caption: "Outlook M365" },
          { url: mobileAnalytics.url, alt: "Analytics mobile", caption: "Analytics & Pipeline" },
          { url: adminDashboard.url, alt: "Dashboard admin", caption: "Portail admin" },
          { url: adminMaestro.url, alt: "OAuth Maestro", caption: "OAuth Maestro" },
          { url: heroStats.url, alt: "KPI temps réel", caption: "KPI temps réel" },
        ]}
      />

      <CaseStudyTestimonials
        accent={ACCENT}
        testimonials={[
          {
            author: "Marie Tremblay",
            role: language === "en" ? "Mortgage broker" : "Courtière hypothécaire",
            company: "Planiprêt Montréal",
            quoteFr:
              "AVA me fait gagner 2 heures par jour. Les résumés d'appels sont poussés dans Maestro automatiquement, je n'ai plus rien à retaper.",
            quoteEn:
              "AVA saves me 2 hours a day. Call summaries are pushed to Maestro automatically — no more retyping notes.",
          },
          {
            author: "Julien Bergeron",
            role: language === "en" ? "Agency director" : "Directeur d'agence",
            company: "Planiprêt Québec",
            quoteFr:
              "Le portail admin donne une vue complète sur les courtiers, DID, Maestro et Microsoft. La sécurité RLS est un vrai plus.",
            quoteEn:
              "The admin portal gives a full view of brokers, DIDs, Maestro and Microsoft. The RLS security model is a real plus.",
          },
          {
            author: "Sophie Lavoie",
            role: language === "en" ? "Senior broker" : "Courtière senior",
            company: "Planiprêt Laval",
            quoteFr:
              "AI Text Improve dans les SMS et courriels, c'est magique. Mes clients trouvent mes messages plus clairs et plus pros.",
            quoteEn:
              "AI Text Improve in SMS and email is magical. Clients say my messages are clearer and more professional.",
          },
        ]}
        logos={[
          { name: "Planiprêt" },
          { name: "Maestro CRM" },
          { name: "Microsoft 365" },
          { name: "Teams" },
          { name: "ElevenLabs" },
          { name: "NS-API" },
        ]}
      />

      <CaseStudyFAQ
        accent={ACCENT}
        items={[
          {
            qFr: "Combien de temps pour déployer AVA dans notre agence ?",
            aFr: "Le déploiement type prend 2 à 5 jours ouvrés : provisioning des DID, connexion Microsoft 365, OAuth Maestro par courtier et onboarding mobile.",
            qEn: "How long does it take to deploy AVA in our agency?",
            aEn: "A typical rollout takes 2–5 business days: DID provisioning, Microsoft 365 connection, per-broker Maestro OAuth and mobile onboarding.",
          },
          {
            qFr: "AVA fonctionne-t-elle en français et en anglais ?",
            aFr: "Oui, chaque courtier choisit sa langue. AVA vocale et chat sont 100 % bilingues FR / EN, tout comme le portail admin et l'application mobile.",
            qEn: "Does AVA work in both French and English?",
            aEn: "Yes — each broker picks their language. Voice AVA, chat AVA, admin portal and mobile app are all 100% bilingual FR / EN.",
          },
          {
            qFr: "Nos données CRM restent-elles chez nous ?",
            aFr: "Oui. AVA lit et écrit dans Maestro via OAuth par courtier, sans dupliquer les données. Chiffrement au repos, RLS multi-tenant, audit d'accès.",
            qEn: "Does our CRM data stay with us?",
            aEn: "Yes. AVA reads/writes Maestro via per-broker OAuth without duplicating data. Encryption at rest, multi-tenant RLS, access audit.",
          },
          {
            qFr: "Le softphone mobile fonctionne-t-il en arrière-plan ?",
            aFr: "Oui, foreground service Android + universal links iOS. Les appels entrants sonnent même quand l'app est fermée.",
            qEn: "Does the mobile softphone work in the background?",
            aEn: "Yes — Android foreground service + iOS universal links. Incoming calls ring even when the app is closed.",
          },
          {
            qFr: "Puis-je personnaliser la voix et le comportement d'AVA ?",
            aFr: "Oui. Voix ElevenLabs configurable, prompts et outils par agence, permissions granulaires par rôle depuis l'audit d'outils AVA.",
            qEn: "Can I customize AVA's voice and behavior?",
            aEn: "Yes. Configurable ElevenLabs voice, agency-level prompts and tools, granular per-role permissions from the AVA tools audit.",
          },
        ]}
      />

      <FooterSection />
    </div>
  );
}
