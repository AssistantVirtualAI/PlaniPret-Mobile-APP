import { motion } from "framer-motion";
import {
  Bot,
  Phone,
  Mail,
  RefreshCw,
  Users,
  BarChart3,
  ShieldCheck,
  Globe2,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import planipretLogo from "@/assets/planipret-logo.png.asset.json";
import mobileHero from "@/assets/planipret-mobile-hero.jpg.asset.json";
import adminDashboard from "@/assets/planipret-admin-dashboard.jpg.asset.json";
import avaVoice from "@/assets/planipret-ava-voice.jpg.asset.json";
import mobileSms from "@/assets/planipret-mobile-sms.jpg.asset.json";
import mobileEmail from "@/assets/planipret-mobile-email.jpg.asset.json";
import mobileAnalytics from "@/assets/planipret-mobile-analytics.jpg.asset.json";
import adminMaestro from "@/assets/planipret-admin-maestro.jpg.asset.json";
import heroStats from "@/assets/planipret-hero-stats.jpg.asset.json";

const copy = {
  fr: {
    badge: "Étude de cas · Planiprêt",
    title: "Une plateforme sur mesure pour les courtiers Planiprêt",
    subtitle:
      "AVA — assistante IA vocale et textuelle — connectée au téléphonie, à Microsoft 365, Teams et au CRM Maestro. Portail admin bilingue et application mobile iOS / Android.",
    mobileTag: "Application mobile courtier",
    mobileTitle: "Tout le quotidien du courtier dans sa poche",
    mobileDesc:
      "Softphone SIP intégré, emails Outlook, calendrier, Teams, contacts CRM et coaching IA — le tout accessible en un swipe.",
    features: [
      {
        icon: Bot,
        title: "AVA Voice + Chat",
        desc: "48 outils exécutables : appels, SMS, emails, agenda, notes CRM. Vocal ElevenLabs + chat intelligent.",
      },
      {
        icon: Phone,
        title: "Softphone SIP natif",
        desc: "Appels HD avec NS-API, provisioning DID automatique, background service Android/iOS.",
      },
      {
        icon: Mail,
        title: "Microsoft 365 complet",
        desc: "Outlook, calendrier, Teams chats et contacts synchronisés avec SSO Azure AD.",
      },
      {
        icon: RefreshCw,
        title: "CRM Maestro",
        desc: "OAuth par courtier, push automatique des résumés d'appels, notes et communications.",
      },
      {
        icon: Users,
        title: "Pipeline & Contacts",
        desc: "Gestion des leads, deals, tâches et rendez-vous — swipe pour archiver ou supprimer.",
      },
      {
        icon: BarChart3,
        title: "Analytics & Coaching",
        desc: "Statistiques quotidiennes, analyse d'appels, leads chauds et briefing IA du jour.",
      },
      {
        icon: ShieldCheck,
        title: "Sécurité entreprise",
        desc: "RLS multi-tenant, chiffrement au repos, audit d'accès, conformité GDPR & HIPAA.",
      },
      {
        icon: Sparkles,
        title: "AI Text Improve",
        desc: "Amélioration IA en un tap pour SMS et emails — ton pro, ton amical, correction et traduction.",
      },
      {
        icon: Globe2,
        title: "Push protocole natif",
        desc: "Notifications VoIP en background, foreground service Android, universal links iOS.",
      },
    ],
    screensTag: "Aperçu app mobile",
    screensTitle: "Chaque écran pensé pour le terrain",
    screens: [
      { img: mobileSms, alt: "SMS avec améliorateur IA", caption: "SMS + AI Improve" },
      { img: mobileEmail, alt: "Boîte Outlook mobile", caption: "Outlook M365" },
      { img: mobileAnalytics, alt: "Dashboard analytics", caption: "Analytics & Pipeline" },
    ],
    adminScreensTag: "Portail admin",
    adminScreensTitle: "Contrôle total, sécurité entreprise",
    adminScreens: [
      { img: adminDashboard, alt: "Dashboard admin", caption: "Vue d'ensemble agence" },
      { img: adminMaestro, alt: "Statut OAuth Maestro", caption: "OAuth Maestro par courtier" },
      { img: heroStats, alt: "Stats hero", caption: "KPI temps réel" },
    ],
    adminTag: "Portail Admin",
    adminTitle: "Un centre de contrôle pour toute l'agence",
    adminBullets: [
      "Gestion des courtiers, extensions et rôles",
      "Provisioning DID et devices SIP en un clic",
      "Audit sécurité + Audit outils AVA en direct",
      "Statut OAuth Maestro & Microsoft par courtier",
      "Interface 100 % bilingue FR / EN",
    ],
    stats: [
      { value: "48", label: "outils AVA" },
      { value: "3", label: "plateformes iOS · Android · Web" },
      { value: "100%", label: "bilingue FR / EN" },
      { value: "SSO", label: "Microsoft + Maestro" },
    ],
    cta: "Voir les tarifs",
  },
  en: {
    badge: "Case study · Planiprêt",
    title: "A tailored platform for Planiprêt mortgage brokers",
    subtitle:
      "AVA — voice + chat AI assistant — connected to telephony, Microsoft 365, Teams and Maestro CRM. Bilingual admin portal and iOS / Android mobile app.",
    mobileTag: "Broker mobile app",
    mobileTitle: "The broker's whole day in their pocket",
    mobileDesc:
      "Built-in SIP softphone, Outlook mail, calendar, Teams, CRM contacts and AI coaching — one swipe away.",
    features: [
      {
        icon: Bot,
        title: "AVA Voice + Chat",
        desc: "48 executable tools: calls, SMS, emails, agenda, CRM notes. ElevenLabs voice + smart chat.",
      },
      {
        icon: Phone,
        title: "Native SIP softphone",
        desc: "HD calls via NS-API, automatic DID provisioning, Android/iOS background service.",
      },
      {
        icon: Mail,
        title: "Full Microsoft 365",
        desc: "Outlook, calendar, Teams chats and contacts synced with Azure AD SSO.",
      },
      {
        icon: RefreshCw,
        title: "Maestro CRM",
        desc: "Per-broker OAuth, automatic push of call summaries, notes and communications.",
      },
      {
        icon: Users,
        title: "Pipeline & Contacts",
        desc: "Manage leads, deals, tasks and appointments — swipe to archive or delete.",
      },
      {
        icon: BarChart3,
        title: "Analytics & Coaching",
        desc: "Daily stats, call analysis, hot leads and AI daily briefing.",
      },
      {
        icon: ShieldCheck,
        title: "Enterprise security",
        desc: "Multi-tenant RLS, encryption at rest, access audit, GDPR & HIPAA compliant.",
      },
      {
        icon: Sparkles,
        title: "AI Text Improve",
        desc: "One-tap AI rewrite for SMS and emails — pro tone, friendly tone, fix & translate.",
      },
      {
        icon: Globe2,
        title: "Native push protocol",
        desc: "Background VoIP notifications, Android foreground service, iOS universal links.",
      },
    ],
    screensTag: "Mobile app preview",
    screensTitle: "Every screen built for the field",
    screens: [
      { img: mobileSms, alt: "SMS with AI improver", caption: "SMS + AI Improve" },
      { img: mobileEmail, alt: "Outlook mobile inbox", caption: "Outlook M365" },
      { img: mobileAnalytics, alt: "Analytics dashboard", caption: "Analytics & Pipeline" },
    ],
    adminScreensTag: "Admin portal",
    adminScreensTitle: "Total control, enterprise security",
    adminScreens: [
      { img: adminDashboard, alt: "Admin dashboard", caption: "Agency overview" },
      { img: adminMaestro, alt: "Maestro OAuth status", caption: "Per-broker Maestro OAuth" },
      { img: heroStats, alt: "Hero stats", caption: "Real-time KPIs" },
    ],
    adminTag: "Admin Portal",
    adminTitle: "A control center for the whole agency",
    adminBullets: [
      "Manage brokers, extensions and roles",
      "One-click DID and SIP device provisioning",
      "Security audit + live AVA tools audit",
      "Per-broker Maestro & Microsoft OAuth status",
      "100% bilingual FR / EN interface",
    ],
    stats: [
      { value: "48", label: "AVA tools" },
      { value: "3", label: "platforms iOS · Android · Web" },
      { value: "100%", label: "bilingual FR / EN" },
      { value: "SSO", label: "Microsoft + Maestro" },
    ],
    cta: "See pricing",
  },
} as const;

export const PlanipretShowcaseSection = () => {
  const { language } = useLanguage();
  const t = copy[language === "en" ? "en" : "fr"];

  return (
    <section className="relative py-32 overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, hsl(var(--background)) 0%, #060D1A 40%, #0A1628 60%, hsl(var(--background)) 100%)",
        }}
      />
      <div
        className="absolute top-1/3 -left-40 w-[600px] h-[600px] rounded-full blur-3xl opacity-30"
        style={{ background: "radial-gradient(circle, #2E9BDC 0%, transparent 70%)" }}
      />
      <div
        className="absolute bottom-1/4 -right-40 w-[600px] h-[600px] rounded-full blur-3xl opacity-20"
        style={{ background: "radial-gradient(circle, #1A4A8A 0%, transparent 70%)" }}
      />

      <div className="container mx-auto px-6 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full mb-6"
            style={{ background: "rgba(46,155,220,0.1)", border: "1px solid rgba(46,155,220,0.3)" }}>
            <img
              src={planipretLogo.url}
              alt="Planiprêt"
              className="h-5 w-auto"
              loading="lazy"
            />
            <span className="text-sm font-semibold" style={{ color: "#2E9BDC" }}>
              {t.badge}
            </span>
          </div>
          <h2 className="text-4xl md:text-6xl font-bold text-white mb-6 max-w-4xl mx-auto leading-tight">
            {t.title}
          </h2>
          <p className="text-lg md:text-xl text-white/70 max-w-3xl mx-auto">
            {t.subtitle}
          </p>
        </motion.div>

        {/* Mobile hero split */}
        <div className="grid lg:grid-cols-2 gap-12 items-center mb-24">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4"
              style={{ background: "rgba(155,127,232,0.15)", border: "1px solid rgba(155,127,232,0.3)" }}>
              <Smartphone className="w-3.5 h-3.5" style={{ color: "#9B7FE8" }} />
              <span className="text-xs font-semibold" style={{ color: "#9B7FE8" }}>{t.mobileTag}</span>
            </div>
            <h3 className="text-3xl md:text-4xl font-bold text-white mb-4">{t.mobileTitle}</h3>
            <p className="text-white/70 text-lg mb-8">{t.mobileDesc}</p>
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                border: "1px solid rgba(46,155,220,0.2)",
                boxShadow: "0 20px 60px -20px rgba(46,155,220,0.3)",
              }}
            >
              <img
                src={avaVoice.url}
                alt="AVA voice"
                className="w-full h-40 object-cover"
                loading="lazy"
                width={1280}
                height={800}
              />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="relative"
          >
            <div
              className="absolute inset-0 blur-3xl opacity-40"
              style={{ background: "radial-gradient(circle, #2E9BDC 0%, transparent 60%)" }}
            />
            <img
              src={mobileHero.url}
              alt="Planiprêt mobile app"
              className="relative w-full h-auto rounded-3xl"
              loading="lazy"
              width={1280}
              height={1280}
            />
          </motion.div>
        </div>

        {/* Features grid */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, staggerChildren: 0.08 }}
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-24"
        >
          {t.features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              whileHover={{ y: -4 }}
              className="p-6 rounded-2xl backdrop-blur-xl"
              style={{
                background: "rgba(13,31,53,0.5)",
                border: "1px solid rgba(46,155,220,0.15)",
              }}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                style={{
                  background: "linear-gradient(135deg, #1A4A8A, #2E9BDC)",
                  boxShadow: "0 8px 24px -8px rgba(46,155,220,0.5)",
                }}
              >
                <f.icon className="w-6 h-6 text-white" />
              </div>
              <h4 className="text-lg font-semibold text-white mb-2">{f.title}</h4>
              <p className="text-sm text-white/60 leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Mobile screens gallery */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-24"
        >
          <div className="text-center mb-10">
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4"
              style={{ background: "rgba(155,127,232,0.15)", border: "1px solid rgba(155,127,232,0.3)" }}
            >
              <Smartphone className="w-3.5 h-3.5" style={{ color: "#9B7FE8" }} />
              <span className="text-xs font-semibold" style={{ color: "#9B7FE8" }}>{t.screensTag}</span>
            </div>
            <h3 className="text-3xl md:text-4xl font-bold text-white">{t.screensTitle}</h3>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {t.screens.map((s, i) => (
              <motion.div
                key={s.caption}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
                whileHover={{ y: -6 }}
                className="relative rounded-3xl overflow-hidden"
                style={{
                  border: "1px solid rgba(46,155,220,0.2)",
                  boxShadow: "0 30px 80px -30px rgba(46,155,220,0.4)",
                }}
              >
                <img
                  src={s.img.url}
                  alt={s.alt}
                  className="w-full h-auto object-cover"
                  loading="lazy"
                  width={1088}
                  height={1360}
                />
                <div
                  className="absolute bottom-0 inset-x-0 p-4 text-sm font-medium text-white"
                  style={{ background: "linear-gradient(0deg, rgba(6,13,26,0.9), transparent)" }}
                >
                  {s.caption}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Admin screens gallery */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-24"
        >
          <div className="text-center mb-10">
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4"
              style={{ background: "rgba(46,155,220,0.15)", border: "1px solid rgba(46,155,220,0.3)" }}
            >
              <ShieldCheck className="w-3.5 h-3.5" style={{ color: "#2E9BDC" }} />
              <span className="text-xs font-semibold" style={{ color: "#2E9BDC" }}>{t.adminScreensTag}</span>
            </div>
            <h3 className="text-3xl md:text-4xl font-bold text-white">{t.adminScreensTitle}</h3>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {t.adminScreens.map((s, i) => (
              <motion.div
                key={s.caption}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
                whileHover={{ y: -6 }}
                className="relative rounded-2xl overflow-hidden"
                style={{
                  border: "1px solid rgba(46,155,220,0.2)",
                  boxShadow: "0 20px 60px -20px rgba(0,0,0,0.6)",
                }}
              >
                <img
                  src={s.img.url}
                  alt={s.alt}
                  className="w-full h-48 object-cover"
                  loading="lazy"
                  width={1600}
                  height={1000}
                />
                <div className="p-4 backdrop-blur-xl" style={{ background: "rgba(13,31,53,0.6)" }}>
                  <div className="text-sm font-semibold text-white">{s.caption}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>


        {/* Admin banner */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="grid lg:grid-cols-5 gap-8 items-center mb-20 p-8 md:p-12 rounded-3xl backdrop-blur-xl"
          style={{
            background: "linear-gradient(135deg, rgba(26,74,138,0.2), rgba(13,31,53,0.4))",
            border: "1px solid rgba(46,155,220,0.2)",
          }}
        >
          <div className="lg:col-span-2 order-2 lg:order-1">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4"
              style={{ background: "rgba(46,155,220,0.15)", border: "1px solid rgba(46,155,220,0.3)" }}>
              <ShieldCheck className="w-3.5 h-3.5" style={{ color: "#2E9BDC" }} />
              <span className="text-xs font-semibold" style={{ color: "#2E9BDC" }}>{t.adminTag}</span>
            </div>
            <h3 className="text-3xl md:text-4xl font-bold text-white mb-6">{t.adminTitle}</h3>
            <ul className="space-y-3">
              {t.adminBullets.map((b) => (
                <li key={b} className="flex items-start gap-3 text-white/80">
                  <Sparkles className="w-4 h-4 mt-1 flex-shrink-0" style={{ color: "#2E9BDC" }} />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="lg:col-span-3 order-1 lg:order-2">
            <img
              src={adminDashboard.url}
              alt="Planiprêt admin dashboard"
              className="w-full h-auto rounded-2xl"
              loading="lazy"
              width={1600}
              height={1000}
              style={{
                border: "1px solid rgba(46,155,220,0.2)",
                boxShadow: "0 30px 80px -20px rgba(0,0,0,0.6)",
              }}
            />
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12"
        >
          {t.stats.map((s) => (
            <div
              key={s.label}
              className="p-6 rounded-2xl text-center backdrop-blur-xl"
              style={{
                background: "rgba(13,31,53,0.5)",
                border: "1px solid rgba(46,155,220,0.15)",
              }}
            >
              <div
                className="text-3xl md:text-4xl font-bold mb-2"
                style={{
                  background: "linear-gradient(135deg, #2E9BDC, #9B7FE8)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {s.value}
              </div>
              <div className="text-xs md:text-sm text-white/60">{s.label}</div>
            </div>
          ))}
        </motion.div>

        {/* CTA */}
        <div className="text-center">
          <a
            href="#pricing"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full font-semibold text-white transition-transform hover:scale-105"
            style={{
              background: "linear-gradient(135deg, #1A4A8A, #2E9BDC)",
              boxShadow: "0 12px 32px -8px rgba(46,155,220,0.5)",
            }}
          >
            <Globe2 className="w-5 h-5" />
            {t.cta}
          </a>
        </div>
      </div>
    </section>
  );
};
