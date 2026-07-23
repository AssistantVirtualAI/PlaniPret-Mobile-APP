import { motion } from "framer-motion";
import {
  Phone,
  Monitor,
  Smartphone,
  Chrome,
  Voicemail,
  MessageSquare,
  BarChart3,
  ShieldCheck,
  Globe2,
  Server,
  Users,
  Radio,
  Sparkles,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import mobileHero from "@/assets/lemtel-mobile-hero.jpg.asset.json";
import desktopApp from "@/assets/lemtel-desktop-app.jpg.asset.json";
import adminPortal from "@/assets/lemtel-admin-portal.jpg.asset.json";
import chromeExt from "@/assets/lemtel-chrome-extension.jpg.asset.json";
import pbxAnalytics from "@/assets/lemtel-pbx-analytics.jpg.asset.json";

const copy = {
  fr: {
    badge: "Étude de cas · Lemtel",
    title: "Une suite téléphonique unifiée pour toute l'entreprise",
    subtitle:
      "Softphone SIP HD sur Web, Desktop, iOS, Android et Chrome. Un seul PBX, une seule identité, tous les canaux — voix, SMS, messagerie et enregistrements — orchestrés par un portail admin centralisé.",
    platformsTitle: "5 plateformes, un seul écosystème",
    platforms: [
      {
        icon: Globe2,
        title: "Portail Web",
        desc: "Console admin PBX, gestion des utilisateurs, extensions, DID et devices SIP.",
      },
      {
        icon: Monitor,
        title: "App Desktop",
        desc: "Electron pour Windows, macOS et Linux. Tray, raccourcis clavier, notifications natives, auto-update.",
      },
      {
        icon: Smartphone,
        title: "iOS Native",
        desc: "Capacitor + PjSIP natif, intégration CallKit, notifications push VoIP, audio HD en background.",
      },
      {
        icon: Radio,
        title: "Android Native",
        desc: "Foreground Service dédié, WakeLock / WifiLock, transport WSS + Verto FreeSWITCH.",
      },
      {
        icon: Chrome,
        title: "Extension Chrome",
        desc: "Click-to-call depuis n'importe quel site, popup dialer, synchronisation avec l'app desktop.",
      },
    ],
    featuresTag: "Fonctionnalités",
    featuresTitle: "Tout ce qu'il faut pour opérer une téléphonie moderne",
    features: [
      {
        icon: Phone,
        title: "Softphone SIP HD",
        desc: "JsSIP (web), PjSIP (iOS), Verto (Android). Opus, G.722, DTMF RFC2833, TURN dynamique Metered.",
      },
      {
        icon: Server,
        title: "PBX multi-tenant",
        desc: "Provisioning DID automatique, routing dynamique TwiML, trunks SIP personnalisés.",
      },
      {
        icon: MessageSquare,
        title: "SMS & MMS",
        desc: "Messagerie bidirectionnelle par extension, threads unifiés, historique complet et exportable.",
      },
      {
        icon: Voicemail,
        title: "Voicemail intelligent",
        desc: "Boîte vocale par utilisateur, transcription automatique et notifications push.",
      },
      {
        icon: BarChart3,
        title: "Analytics d'appels",
        desc: "Volumétrie, durée moyenne, heures pleines, tableaux de bord par équipe et par extension.",
      },
      {
        icon: ShieldCheck,
        title: "Enregistrements sécurisés",
        desc: "Stockage isolé par organisation, RLS strict, accès admin uniquement, rétention 90 jours.",
      },
      {
        icon: Users,
        title: "Contacts & annuaire",
        desc: "Répertoire d'entreprise partagé, présence temps réel, transferts et conférences.",
      },
      {
        icon: Sparkles,
        title: "Whitelabel",
        desc: "Branding par organisation : logo, couleurs, domaine — sur toutes les plateformes.",
      },
    ],
    adminTag: "Portail Admin",
    adminTitle: "Un cockpit PBX complet, prêt pour les équipes IT",
    adminBullets: [
      "Gestion des utilisateurs, extensions et rôles",
      "Provisioning en masse des DID et devices SIP",
      "Trunks SIP personnalisés & routage TwiML dynamique",
      "Audit sécurité automatisé et RLS par organisation",
      "Logs webhooks entrants et sortants consolidés",
    ],
    stats: [
      { value: "5", label: "plateformes Web · Desktop · iOS · Android · Chrome" },
      { value: "3", label: "stacks SIP JsSIP · PjSIP · Verto" },
      { value: "HD", label: "voix Opus & G.722" },
      { value: "24/7", label: "background service" },
    ],
    ctaPricing: "Voir les tarifs",
    ctaDownload: "Télécharger l'app",
  },
  en: {
    badge: "Case study · Lemtel",
    title: "A unified telephony suite for the whole company",
    subtitle:
      "HD SIP softphone on Web, Desktop, iOS, Android and Chrome. One PBX, one identity, every channel — voice, SMS, messaging and recordings — orchestrated from a central admin portal.",
    platformsTitle: "5 platforms, one ecosystem",
    platforms: [
      {
        icon: Globe2,
        title: "Web Portal",
        desc: "PBX admin console, user, extension, DID and SIP device management.",
      },
      {
        icon: Monitor,
        title: "Desktop App",
        desc: "Electron for Windows, macOS and Linux. Tray, keyboard shortcuts, native notifications, auto-update.",
      },
      {
        icon: Smartphone,
        title: "iOS Native",
        desc: "Capacitor + native PjSIP, CallKit integration, VoIP push notifications, background HD audio.",
      },
      {
        icon: Radio,
        title: "Android Native",
        desc: "Dedicated Foreground Service, WakeLock / WifiLock, WSS + Verto FreeSWITCH transport.",
      },
      {
        icon: Chrome,
        title: "Chrome Extension",
        desc: "Click-to-call from any website, popup dialer, sync with the desktop app.",
      },
    ],
    featuresTag: "Features",
    featuresTitle: "Everything you need to run modern telephony",
    features: [
      {
        icon: Phone,
        title: "HD SIP softphone",
        desc: "JsSIP (web), PjSIP (iOS), Verto (Android). Opus, G.722, DTMF RFC2833, dynamic Metered TURN.",
      },
      {
        icon: Server,
        title: "Multi-tenant PBX",
        desc: "Automatic DID provisioning, dynamic TwiML routing, custom SIP trunks.",
      },
      {
        icon: MessageSquare,
        title: "SMS & MMS",
        desc: "Two-way messaging per extension, unified threads, full exportable history.",
      },
      {
        icon: Voicemail,
        title: "Smart voicemail",
        desc: "Per-user voicemail, automatic transcription and push notifications.",
      },
      {
        icon: BarChart3,
        title: "Call analytics",
        desc: "Volume, average duration, peak hours, dashboards per team and per extension.",
      },
      {
        icon: ShieldCheck,
        title: "Secure recordings",
        desc: "Per-org isolated storage, strict RLS, admin-only access, 90-day retention.",
      },
      {
        icon: Users,
        title: "Contacts & directory",
        desc: "Shared company directory, real-time presence, transfers and conference calls.",
      },
      {
        icon: Sparkles,
        title: "Whitelabel",
        desc: "Per-org branding: logo, colors, domain — across every platform.",
      },
    ],
    adminTag: "Admin Portal",
    adminTitle: "A complete PBX cockpit, ready for IT teams",
    adminBullets: [
      "User, extension and role management",
      "Bulk provisioning of DIDs and SIP devices",
      "Custom SIP trunks & dynamic TwiML routing",
      "Automated security audit and per-org RLS",
      "Consolidated inbound and outbound webhook logs",
    ],
    stats: [
      { value: "5", label: "platforms Web · Desktop · iOS · Android · Chrome" },
      { value: "3", label: "SIP stacks JsSIP · PjSIP · Verto" },
      { value: "HD", label: "voice Opus & G.722" },
      { value: "24/7", label: "background service" },
    ],
    ctaPricing: "See pricing",
    ctaDownload: "Download the app",
  },
} as const;

const ACCENT = "#9B7FE8"; // violet
const ACCENT2 = "#00D4AA"; // cyan/teal
const SURFACE = "rgba(15,10,30,0.55)";
const BORDER = "rgba(155,127,232,0.18)";

export const LemtelShowcaseSection = () => {
  const { language } = useLanguage();
  const t = copy[language === "en" ? "en" : "fr"];

  return (
    <section className="relative py-32 overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, hsl(var(--background)) 0%, #0B0620 40%, #0A1D28 60%, hsl(var(--background)) 100%)",
        }}
      />
      <div
        className="absolute top-1/4 -right-40 w-[700px] h-[700px] rounded-full blur-3xl opacity-25"
        style={{ background: `radial-gradient(circle, ${ACCENT} 0%, transparent 70%)` }}
      />
      <div
        className="absolute bottom-1/4 -left-40 w-[600px] h-[600px] rounded-full blur-3xl opacity-20"
        style={{ background: `radial-gradient(circle, ${ACCENT2} 0%, transparent 70%)` }}
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
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6"
            style={{
              background: "rgba(155,127,232,0.12)",
              border: "1px solid rgba(155,127,232,0.35)",
            }}
          >
            <Phone className="w-4 h-4" style={{ color: ACCENT }} />
            <span className="text-sm font-semibold" style={{ color: ACCENT }}>
              {t.badge}
            </span>
          </div>
          <h2 className="text-4xl md:text-6xl font-bold text-white mb-6 max-w-4xl mx-auto leading-tight">
            {t.title}
          </h2>
          <p className="text-lg md:text-xl text-white/70 max-w-3xl mx-auto">{t.subtitle}</p>
        </motion.div>

        {/* Hero split — mobile app */}
        <div className="grid lg:grid-cols-2 gap-12 items-center mb-24">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="relative order-2 lg:order-1"
          >
            <div
              className="absolute inset-0 blur-3xl opacity-40"
              style={{ background: `radial-gradient(circle, ${ACCENT} 0%, transparent 60%)` }}
            />
            <img
              src={mobileHero.url}
              alt="Lemtel mobile softphone"
              className="relative w-full h-auto rounded-3xl"
              loading="lazy"
              width={1280}
              height={1280}
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="order-1 lg:order-2"
          >
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4"
              style={{
                background: "rgba(0,212,170,0.15)",
                border: "1px solid rgba(0,212,170,0.3)",
              }}
            >
              <Radio className="w-3.5 h-3.5" style={{ color: ACCENT2 }} />
              <span className="text-xs font-semibold" style={{ color: ACCENT2 }}>
                {t.platformsTitle}
              </span>
            </div>
            <h3 className="text-3xl md:text-4xl font-bold text-white mb-6">
              {t.platformsTitle}
            </h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {t.platforms.map((p, i) => (
                <motion.div
                  key={p.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                  className="p-4 rounded-xl backdrop-blur-xl"
                  style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center mb-2"
                    style={{
                      background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`,
                    }}
                  >
                    <p.icon className="w-4.5 h-4.5 text-white" strokeWidth={2.2} />
                  </div>
                  <div className="text-sm font-semibold text-white mb-1">{p.title}</div>
                  <div className="text-xs text-white/60 leading-relaxed">{p.desc}</div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Desktop app showcase */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="mb-24 rounded-3xl overflow-hidden backdrop-blur-xl"
          style={{
            background: "linear-gradient(135deg, rgba(155,127,232,0.15), rgba(0,212,170,0.08))",
            border: `1px solid ${BORDER}`,
          }}
        >
          <div className="grid lg:grid-cols-5 gap-8 items-center p-8 md:p-12">
            <div className="lg:col-span-2">
              <div
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4"
                style={{
                  background: "rgba(155,127,232,0.15)",
                  border: "1px solid rgba(155,127,232,0.3)",
                }}
              >
                <Monitor className="w-3.5 h-3.5" style={{ color: ACCENT }} />
                <span className="text-xs font-semibold" style={{ color: ACCENT }}>Desktop</span>
              </div>
              <h3 className="text-3xl md:text-4xl font-bold text-white mb-4">
                {language === "en" ? "Built for daily use" : "Pensé pour l'usage quotidien"}
              </h3>
              <p className="text-white/70 mb-4">
                {language === "en"
                  ? "Tray icon, global keyboard shortcuts, HID headset support, native notifications, auto-update. Runs on Windows, macOS and Linux from a single Electron codebase."
                  : "Icône dans la barre, raccourcis clavier globaux, support casque HID, notifications natives, auto-update. Fonctionne sur Windows, macOS et Linux depuis une seule base Electron."}
              </p>
              <div className="flex flex-wrap gap-2">
                {["Windows", "macOS", "Linux"].map((os) => (
                  <span
                    key={os}
                    className="px-3 py-1 rounded-full text-xs font-medium text-white/80"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                  >
                    {os}
                  </span>
                ))}
              </div>
            </div>
            <div className="lg:col-span-3">
              <img
                src={desktopApp.url}
                alt="Lemtel desktop app"
                className="w-full h-auto rounded-2xl"
                loading="lazy"
                width={1600}
                height={1000}
                style={{
                  border: `1px solid ${BORDER}`,
                  boxShadow: "0 30px 80px -20px rgba(0,0,0,0.6)",
                }}
              />
            </div>
          </div>
        </motion.div>

        {/* Features grid */}
        <div className="text-center mb-12">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4"
            style={{
              background: "rgba(0,212,170,0.12)",
              border: "1px solid rgba(0,212,170,0.3)",
            }}
          >
            <Sparkles className="w-3.5 h-3.5" style={{ color: ACCENT2 }} />
            <span className="text-xs font-semibold" style={{ color: ACCENT2 }}>{t.featuresTag}</span>
          </div>
          <h3 className="text-3xl md:text-4xl font-bold text-white">{t.featuresTitle}</h3>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-24">
          {t.features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: (i % 4) * 0.08 }}
              whileHover={{ y: -4 }}
              className="p-5 rounded-2xl backdrop-blur-xl"
              style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center mb-3"
                style={{
                  background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`,
                  boxShadow: "0 8px 24px -8px rgba(155,127,232,0.5)",
                }}
              >
                <f.icon className="w-5 h-5 text-white" />
              </div>
              <h4 className="text-base font-semibold text-white mb-1.5">{f.title}</h4>
              <p className="text-xs text-white/60 leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Screens gallery */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="grid md:grid-cols-2 gap-6 mb-20"
        >
          {[
            { img: chromeExt, alt: "Lemtel Chrome extension click-to-dial", caption: "Chrome extension · click-to-dial", h: 500 },
            { img: pbxAnalytics, alt: "Lemtel PBX analytics", caption: "PBX analytics · live queues & SIP map", h: 500 },
            { img: desktopApp, alt: "Lemtel desktop app", caption: "Desktop · Windows · macOS · Linux", h: 400 },
            { img: mobileHero, alt: "Lemtel mobile app", caption: "Native iOS & Android softphone", h: 400 },
          ].map((s, i) => (
            <motion.div
              key={s.caption}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.08 }}
              whileHover={{ y: -6 }}
              className="relative rounded-2xl overflow-hidden"
              style={{ border: `1px solid ${BORDER}`, boxShadow: "0 30px 80px -30px rgba(155,127,232,0.4)" }}
            >
              <img
                src={s.img.url}
                alt={s.alt}
                className="w-full h-64 object-cover"
                loading="lazy"
                width={1600}
                height={1000}
              />
              <div className="p-4 backdrop-blur-xl" style={{ background: "rgba(15,10,30,0.7)" }}>
                <div className="text-sm font-semibold text-white">{s.caption}</div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Admin banner */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="grid lg:grid-cols-5 gap-8 items-center mb-20 p-8 md:p-12 rounded-3xl backdrop-blur-xl"
          style={{
            background: "linear-gradient(135deg, rgba(0,212,170,0.12), rgba(15,10,30,0.5))",
            border: `1px solid ${BORDER}`,
          }}
        >
          <div className="lg:col-span-3 order-2 lg:order-1">
            <img
              src={adminPortal.url}
              alt="Lemtel admin portal"
              className="w-full h-auto rounded-2xl"
              loading="lazy"
              width={1600}
              height={1000}
              style={{
                border: `1px solid ${BORDER}`,
                boxShadow: "0 30px 80px -20px rgba(0,0,0,0.6)",
              }}
            />
          </div>
          <div className="lg:col-span-2 order-1 lg:order-2">
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4"
              style={{
                background: "rgba(0,212,170,0.15)",
                border: "1px solid rgba(0,212,170,0.3)",
              }}
            >
              <ShieldCheck className="w-3.5 h-3.5" style={{ color: ACCENT2 }} />
              <span className="text-xs font-semibold" style={{ color: ACCENT2 }}>{t.adminTag}</span>
            </div>
            <h3 className="text-3xl md:text-4xl font-bold text-white mb-6">{t.adminTitle}</h3>
            <ul className="space-y-3">
              {t.adminBullets.map((b) => (
                <li key={b} className="flex items-start gap-3 text-white/80">
                  <Sparkles className="w-4 h-4 mt-1 flex-shrink-0" style={{ color: ACCENT }} />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
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
              style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
            >
              <div
                className="text-3xl md:text-4xl font-bold mb-2"
                style={{
                  background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`,
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

        {/* CTAs */}
        <div className="flex flex-wrap items-center justify-center gap-4">
          <a
            href="#pricing"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full font-semibold text-white transition-transform hover:scale-105"
            style={{
              background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`,
              boxShadow: "0 12px 32px -8px rgba(155,127,232,0.5)",
            }}
          >
            <Globe2 className="w-5 h-5" />
            {t.ctaPricing}
          </a>
          <a
            href="#download"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full font-semibold text-white transition-colors"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            <Monitor className="w-5 h-5" />
            {t.ctaDownload}
          </a>
        </div>
      </div>
    </section>
  );
};
