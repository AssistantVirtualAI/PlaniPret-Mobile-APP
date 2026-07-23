import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, Phone, Home } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import planipretMobile from "@/assets/planipret-mobile-hero.jpg.asset.json";
import lemtelMobile from "@/assets/lemtel-mobile-hero.jpg.asset.json";

const copy = {
  fr: {
    tag: "Réalisations",
    title: "Des plateformes déjà en production",
    subtitle:
      "Découvrez deux écosystèmes complets bâtis avec AVA Statistic — voix IA, portail admin, apps mobiles et desktop.",
    cases: [
      {
        to: "/case/planipret",
        badge: "Planiprêt",
        title: "Assistant IA pour courtiers hypothécaires",
        desc: "AVA vocale + chat, app mobile iOS/Android, portail admin bilingue, CRM Maestro & Microsoft 365.",
        chips: ["Voice AI", "Mobile", "CRM Maestro", "MS 365"],
        cta: "Voir l'étude de cas",
        icon: Home,
        gradient: "linear-gradient(135deg, #1A4A8A, #2E9BDC)",
        glow: "rgba(46,155,220,0.4)",
        image: planipretMobile.url,
      },
      {
        to: "/case/lemtel",
        badge: "Lemtel",
        title: "Suite téléphonique unifiée multi-plateforme",
        desc: "Softphone SIP HD sur Web, Desktop, iOS, Android, extension Chrome et portail admin PBX complet.",
        chips: ["Web", "Desktop", "iOS", "Android", "Chrome"],
        cta: "Voir l'étude de cas",
        icon: Phone,
        gradient: "linear-gradient(135deg, #9B7FE8, #00D4AA)",
        glow: "rgba(155,127,232,0.4)",
        image: lemtelMobile.url,
      },
    ],
  },
  en: {
    tag: "Case studies",
    title: "Platforms already in production",
    subtitle:
      "Discover two complete ecosystems built with AVA Statistic — voice AI, admin portal, mobile and desktop apps.",
    cases: [
      {
        to: "/case/planipret",
        badge: "Planiprêt",
        title: "AI assistant for mortgage brokers",
        desc: "AVA voice + chat, iOS/Android mobile app, bilingual admin portal, Maestro CRM & Microsoft 365.",
        chips: ["Voice AI", "Mobile", "Maestro CRM", "MS 365"],
        cta: "See the case study",
        icon: Home,
        gradient: "linear-gradient(135deg, #1A4A8A, #2E9BDC)",
        glow: "rgba(46,155,220,0.4)",
        image: planipretMobile.url,
      },
      {
        to: "/case/lemtel",
        badge: "Lemtel",
        title: "Unified multi-platform telephony suite",
        desc: "HD SIP softphone on Web, Desktop, iOS, Android, Chrome extension and full PBX admin portal.",
        chips: ["Web", "Desktop", "iOS", "Android", "Chrome"],
        cta: "See the case study",
        icon: Phone,
        gradient: "linear-gradient(135deg, #9B7FE8, #00D4AA)",
        glow: "rgba(155,127,232,0.4)",
        image: lemtelMobile.url,
      },
    ],
  },
} as const;

export const CaseStudiesPreviewSection = () => {
  const { language } = useLanguage();
  const t = copy[language === "en" ? "en" : "fr"];

  return (
    <section className="relative py-24 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/5 to-background" />

      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-14"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary mb-6">
            <span className="text-sm font-semibold">{t.tag}</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">{t.title}</h2>
          <p className="text-lg text-white/70 max-w-2xl mx-auto">{t.subtitle}</p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
          {t.cases.map((c, i) => (
            <motion.div
              key={c.to}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              whileHover={{ y: -6 }}
            >
              <Link
                to={c.to}
                className="group relative block h-full rounded-3xl overflow-hidden backdrop-blur-xl"
                style={{
                  background: "rgba(13,20,40,0.55)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {/* Glow */}
                <div
                  className="absolute -inset-1 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-2xl -z-10"
                  style={{ background: c.glow }}
                />

                {/* Image top */}
                <div className="relative h-56 overflow-hidden">
                  <div
                    className="absolute inset-0 opacity-90"
                    style={{ background: c.gradient }}
                  />
                  <img
                    src={c.image}
                    alt={c.badge}
                    loading="lazy"
                    width={1280}
                    height={1280}
                    className="absolute inset-0 w-full h-full object-cover mix-blend-luminosity opacity-60 group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[rgba(13,20,40,0.9)] via-transparent to-transparent" />
                  <div
                    className="absolute top-4 left-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold text-white"
                    style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}
                  >
                    <c.icon className="w-3.5 h-3.5" />
                    {c.badge}
                  </div>
                </div>

                {/* Content */}
                <div className="p-6">
                  <h3 className="text-xl md:text-2xl font-bold text-white mb-2 group-hover:text-white transition-colors">
                    {c.title}
                  </h3>
                  <p className="text-sm text-white/60 mb-4">{c.desc}</p>

                  <div className="flex flex-wrap gap-1.5 mb-5">
                    {c.chips.map((chip) => (
                      <span
                        key={chip}
                        className="px-2.5 py-1 rounded-full text-[11px] font-medium text-white/80"
                        style={{
                          background: "rgba(255,255,255,0.06)",
                          border: "1px solid rgba(255,255,255,0.1)",
                        }}
                      >
                        {chip}
                      </span>
                    ))}
                  </div>

                  <div
                    className="inline-flex items-center gap-2 text-sm font-semibold text-white transition-transform group-hover:translate-x-1"
                    style={{
                      background: c.gradient,
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}
                  >
                    {c.cta}
                    <ArrowRight
                      className="w-4 h-4"
                      style={{ color: "#fff", strokeWidth: 2.5 }}
                    />
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
