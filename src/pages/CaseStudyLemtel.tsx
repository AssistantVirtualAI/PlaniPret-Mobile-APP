import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Navbar } from "@/components/landing/Navbar";
import { FooterSection } from "@/components/landing/FooterSection";
import { LemtelShowcaseSection } from "@/components/landing/LemtelShowcaseSection";
import { AppsShowcaseSection } from "@/components/landing/AppsShowcaseSection";
import { LemtelInteractiveDemo } from "@/components/landing/LemtelInteractiveDemo";
import { SectionDivider } from "@/components/landing/SectionDivider";
import { CaseStudyTestimonials } from "@/components/landing/CaseStudyTestimonials";
import { CaseStudyGallery } from "@/components/landing/CaseStudyGallery";
import { CaseStudyFAQ } from "@/components/landing/CaseStudyFAQ";
import { useLanguage } from "@/context/LanguageContext";
import { useEffect } from "react";
import mobileHero from "@/assets/lemtel-mobile-hero.jpg.asset.json";
import desktopApp from "@/assets/lemtel-desktop-app.jpg.asset.json";
import adminPortal from "@/assets/lemtel-admin-portal.jpg.asset.json";
import chromeExt from "@/assets/lemtel-chrome-extension.jpg.asset.json";
import pbxAnalytics from "@/assets/lemtel-pbx-analytics.jpg.asset.json";

const ACCENT = "#00D4FF";

export default function CaseStudyLemtel() {
  const { language } = useLanguage();

  useEffect(() => {
    document.title = language === "en"
      ? "Lemtel case study — AVA Statistic"
      : "Étude de cas Lemtel — AVA Statistic";
    const desc = language === "en"
      ? "Lemtel unified telephony suite: HD SIP softphone on Web, Desktop, iOS, Android and Chrome, with a full admin PBX portal."
      : "La suite Lemtel : softphone SIP HD sur Web, Desktop, iOS, Android et Chrome, avec portail admin PBX complet.";
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
      <LemtelShowcaseSection />
      <SectionDivider variant="pulse" />
      <div id="apps-showcase">
        <AppsShowcaseSection />
      </div>

      <CaseStudyGallery
        accent={ACCENT}
        titleFr="Toutes les plateformes en un coup d'œil"
        titleEn="Every platform at a glance"
        images={[
          { url: mobileHero.url, alt: "Lemtel mobile", caption: "iOS · Android" },
          { url: desktopApp.url, alt: "Lemtel desktop", caption: "Windows · macOS" },
          { url: chromeExt.url, alt: "Extension Chrome", caption: "Chrome Extension" },
          { url: adminPortal.url, alt: "Portail admin PBX", caption: "PBX Admin" },
          { url: pbxAnalytics.url, alt: "PBX analytics", caption: "Analytics PBX" },
        ]}
      />

      <div id="lemtel-demo">
        <LemtelInteractiveDemo />
      </div>

      <CaseStudyTestimonials
        accent={ACCENT}
        testimonials={[
          {
            author: "David Ouellet",
            role: language === "en" ? "IT Manager" : "Responsable TI",
            company: "Groupe Cactus",
            quoteFr:
              "On a remplacé Ringotel par Lemtel en une semaine. Les appels HD passent partout — Web, desktop, mobile, Chrome — sans compromis.",
            quoteEn:
              "We replaced Ringotel with Lemtel in a week. HD calls work everywhere — Web, desktop, mobile, Chrome — no compromise.",
          },
          {
            author: "Nadia Roy",
            role: language === "en" ? "PBX Administrator" : "Administratrice PBX",
            company: "Télé-Nord",
            quoteFr:
              "Le portail admin PBX est ultra clair : extensions, DID, enregistrements, analytics — tout est à portée de clic.",
            quoteEn:
              "The PBX admin portal is crystal clear: extensions, DIDs, recordings, analytics — everything one click away.",
          },
          {
            author: "Karim Benali",
            role: language === "en" ? "Support lead" : "Chef d'équipe support",
            company: "Solutions Boréales",
            quoteFr:
              "L'extension Chrome + softphone Android nous a fait gagner un vrai temps sur les transferts et les notes d'appels.",
            quoteEn:
              "The Chrome extension + Android softphone saved us real time on transfers and call notes.",
          },
        ]}
        logos={[
          { name: "Lemtel" },
          { name: "FreeSWITCH" },
          { name: "Twilio" },
          { name: "Metered TURN" },
          { name: "Chrome Web Store" },
          { name: "Play Store" },
          { name: "App Store" },
        ]}
      />

      <CaseStudyFAQ
        accent={ACCENT}
        items={[
          {
            qFr: "Sur quelles plateformes Lemtel fonctionne-t-il ?",
            aFr: "Web, Desktop (Windows / macOS), iOS, Android et extension Chrome — avec un compte unique et une continuité totale.",
            qEn: "Which platforms does Lemtel run on?",
            aEn: "Web, Desktop (Windows / macOS), iOS, Android and a Chrome extension — with a single account and full continuity.",
          },
          {
            qFr: "Quel protocole SIP est utilisé ?",
            aFr: "WSS (WebSocket sécurisé) sur navigateur et desktop, PJSIP natif sur iOS, FreeSWITCH Verto sur Android pour la stabilité en arrière-plan.",
            qEn: "Which SIP protocol is used?",
            aEn: "WSS (secure WebSocket) on browser and desktop, native PJSIP on iOS, FreeSWITCH Verto on Android for background stability.",
          },
          {
            qFr: "Les appels sont-ils chiffrés ?",
            aFr: "Oui. Signalisation TLS/WSS et médias SRTP. Serveurs TURN chiffrés pour la traversée NAT.",
            qEn: "Are calls encrypted?",
            aEn: "Yes. TLS/WSS signaling and SRTP media. Encrypted TURN servers for NAT traversal.",
          },
          {
            qFr: "Peut-on brancher notre propre trunk SIP ?",
            aFr: "Oui. Trunks SIP custom, DID Twilio, provisioning en un clic depuis le portail admin PBX.",
            qEn: "Can we bring our own SIP trunk?",
            aEn: "Yes. Custom SIP trunks, Twilio DIDs, one-click provisioning from the PBX admin portal.",
          },
          {
            qFr: "Que se passe-t-il en cas de coupure réseau ?",
            aFr: "Reconnexion automatique avec back-off, réenregistrement SIP, credentials TURN dynamiques renouvelés depuis l'edge function.",
            qEn: "What happens on network drop?",
            aEn: "Auto-reconnect with back-off, SIP re-registration, dynamic TURN credentials refreshed from an edge function.",
          },
        ]}
      />

      <FooterSection />
    </div>
  );
}
