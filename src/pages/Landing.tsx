import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/landing/Navbar";
import { HeroSection } from "@/components/landing/HeroSection";
import { TrustedBySection } from "@/components/landing/TrustedBySection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { PortalComparisonSection } from "@/components/landing/PortalComparisonSection";
import { TestimonialsSection } from "@/components/landing/TestimonialsSection";
import { FAQSection } from "@/components/landing/FAQSection";
import { PricingSection } from "@/components/landing/PricingSection";
import { CTASection } from "@/components/landing/CTASection";
import { FooterSection } from "@/components/landing/FooterSection";
import { AgentCreationSection } from "@/components/landing/AgentCreationSection";
import { IntegrationsSection } from "@/components/landing/IntegrationsSection";
import { ProductShowcaseSection } from "@/components/landing/ProductShowcaseSection";
import { PortalPreviewSection } from "@/components/landing/PortalPreviewSection";
import { InlineCTA } from "@/components/landing/InlineCTA";
import { ChatWidget } from "@/components/landing/ChatWidget";
import { SectionDivider } from "@/components/landing/SectionDivider";
import { LiveDemoSection } from "@/components/landing/LiveDemoSection";
import { AIForCompaniesSection } from "@/components/landing/AIForCompaniesSection";
import { CompetitorComparisonSection } from "@/components/landing/CompetitorComparisonSection";
import { WhatsNewSection } from "@/components/landing/WhatsNewSection";
import { AppsShowcaseSection } from "@/components/landing/AppsShowcaseSection";
import { LemtelInteractiveDemo } from "@/components/landing/LemtelInteractiveDemo";
import { LandingDownloadSection } from "@/components/landing/LandingDownloadSection";
import { useTranslation } from "@/hooks/useTranslation";

const Landing = () => {
  const { t } = useTranslation();
  const location = useLocation();

  useEffect(() => {
    if (location.hash) {
      const id = location.hash.substring(1);
      const timer = setTimeout(() => {
        const el = document.getElementById(id);
        el?.scrollIntoView({ behavior: 'smooth' });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [location.hash]);

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      <Navbar />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <HeroSection />
        <div id="nouveautes">
          <WhatsNewSection />
        </div>
        <TrustedBySection />
        <SectionDivider variant="wave" />
        <div id="portal-preview">
          <PortalPreviewSection />
        </div>
        <SectionDivider variant="network" />
        <div id="how-it-works">
          <HowItWorksSection />
        </div>
        <InlineCTA
          title={t("inlineCTA.afterHowItWorks")}
          buttonLabel={t("inlineCTA.button")}
        />
        <div id="agent-creation">
          <AgentCreationSection />
        </div>
        <div id="features">
          <FeaturesSection />
        </div>
        <div id="apps-showcase">
          <AppsShowcaseSection />
        </div>
        <LandingDownloadSection />
        <div id="lemtel-demo">
          <LemtelInteractiveDemo />
        </div>
        <SectionDivider variant="pulse" />
        <div id="live-demo">
          <LiveDemoSection />
        </div>
        <InlineCTA
          title={t("inlineCTA.afterFeatures")}
          buttonLabel={t("inlineCTA.button")}
        />
        <div id="portals">
          <PortalComparisonSection />
        </div>
        <div id="vs-competition">
          <CompetitorComparisonSection />
        </div>
        <div id="integrations">
          <IntegrationsSection />
        </div>
        <InlineCTA
          title={t("inlineCTA.afterIntegrations")}
          buttonLabel={t("inlineCTA.button")}
        />
        <div id="analytics">
          <ProductShowcaseSection />
        </div>
        <div id="ai-for-companies">
          <AIForCompaniesSection />
        </div>
        <div id="testimonials">
          <TestimonialsSection />
        </div>
        <div id="faq">
          <FAQSection />
        </div>
        <div id="pricing">
          <PricingSection />
        </div>
        <CTASection />
        <FooterSection />
      </motion.div>
      <ChatWidget />
    </div>
  );
};

export default Landing;
