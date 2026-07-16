import { motion } from "framer-motion";
import { Smartphone, Monitor, Server, Download, Phone, ShieldCheck, Zap, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import desktopShowcase from "@/assets/desktop-app-showcase.jpg";
import mobileShowcase from "@/assets/mobile-app-showcase.jpg";
import pbxShowcase from "@/assets/fashionpbx-showcase.jpg";

const LEMTEL_LOGO = "/lemtel-logo.png";
const DESKTOP_ICON = "/desktop-app-icon.png";

const apps = [
  {
    id: "desktop",
    title: "Lemtel Desktop App",
    subtitle: "Native softphone for macOS, Windows & Linux",
    image: desktopShowcase,
    logo: DESKTOP_ICON,
    logoAlt: "Lemtel Desktop App logo",
    icon: Monitor,
    accent: "from-primary/40 via-primary/10 to-transparent",
    features: [
      { icon: Phone, label: "SIP/WSS softphone with HD audio" },
      { icon: Zap, label: "lemtel:// click-to-dial protocol" },
      { icon: ShieldCheck, label: "System tray + global shortcuts" },
    ],
    cta: { label: "Download Desktop", href: "/download" },
  },
  {
    id: "mobile",
    title: "Lemtel Mobile App",
    subtitle: "iOS & Android softphone built on Capacitor",
    image: mobileShowcase,
    logo: LEMTEL_LOGO,
    logoAlt: "Lemtel Mobile App logo",
    icon: Smartphone,
    accent: "from-accent/40 via-accent/10 to-transparent",
    features: [
      { icon: Phone, label: "JsSIP over secure WebSockets" },
      { icon: Zap, label: "Persisted SIP credentials & auto-register" },
      { icon: ShieldCheck, label: "CI-signed iOS & Android builds" },
    ],
    cta: { label: "Get Mobile App", href: "/download" },
  },
  {
    id: "pbx",
    title: "Lemtel FashionPBX Integration",
    subtitle: "Cloud PBX, extensions, DIDs & call recording",
    image: pbxShowcase,
    logo: LEMTEL_LOGO,
    logoAlt: "Lemtel FashionPBX logo",
    icon: Server,
    accent: "from-primary/40 via-accent/10 to-transparent",
    features: [
      { icon: Globe, label: "Provision DIDs across 60+ countries" },
      { icon: Phone, label: "Extensions, IVR, queues & voicemail" },
      { icon: ShieldCheck, label: "Real-time sync with AI agents" },
    ],
    cta: { label: "Explore PBX", href: "/integrations#lemtel" },
  },
];

export const AppsShowcaseSection = () => {
  return (
    <section
      id="apps-showcase"
      className="relative py-24 px-4 overflow-hidden bg-gradient-to-b from-background via-background/95 to-background"
    >
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-accent/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16 max-w-3xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-medium mb-4 uppercase tracking-wider">
            <Zap className="w-3.5 h-3.5" />
            New · Powered by Lemtel
          </div>
          <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-br from-foreground via-foreground to-primary bg-clip-text text-transparent">
            One platform, every device
          </h2>
          <p className="text-lg text-muted-foreground">
            Make and receive calls everywhere — desktop, mobile, browser — backed by the
            Lemtel FashionPBX cloud telecom stack.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {apps.map((app, idx) => {
            const Icon = app.icon;
            return (
              <motion.article
                key={app.id}
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.55, delay: idx * 0.1 }}
                className="group relative rounded-2xl overflow-hidden border border-border/60 bg-card/40 backdrop-blur-xl hover:border-primary/50 transition-all hover:shadow-[0_0_60px_-15px_hsl(var(--primary)/0.4)]"
              >
                {/* Image with logo overlay */}
                <div className="relative aspect-[4/3] overflow-hidden">
                  <img
                    src={app.image}
                    alt={`${app.title} preview`}
                    loading="lazy"
                    width={1024}
                    height={768}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className={`absolute inset-0 bg-gradient-to-t ${app.accent} mix-blend-screen`} />
                  <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />

                  {/* Exact logo badge */}
                  <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-2 rounded-xl bg-background/80 backdrop-blur-md border border-border/60 shadow-lg">
                    <img
                      src={app.logo}
                      alt={app.logoAlt}
                      className="w-7 h-7 object-contain"
                      loading="lazy"
                    />
                    <span className="text-xs font-semibold tracking-tight">Lemtel</span>
                  </div>

                  <div className="absolute top-4 right-4 p-2 rounded-lg bg-primary/20 backdrop-blur-md border border-primary/40">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                  <div>
                    <h3 className="text-xl font-bold mb-1">{app.title}</h3>
                    <p className="text-sm text-muted-foreground">{app.subtitle}</p>
                  </div>

                  <ul className="space-y-2.5">
                    {app.features.map((f, i) => {
                      const FIcon = f.icon;
                      return (
                        <li key={i} className="flex items-start gap-2.5 text-sm">
                          <div className="mt-0.5 p-1 rounded-md bg-primary/10 border border-primary/20">
                            <FIcon className="w-3 h-3 text-primary" />
                          </div>
                          <span className="text-foreground/85">{f.label}</span>
                        </li>
                      );
                    })}
                  </ul>

                  <Button
                    asChild
                    variant="outline"
                    className="w-full border-primary/40 hover:bg-primary/10 hover:border-primary group/btn"
                  >
                    <a href={app.cta.href}>
                      <Download className="w-4 h-4 mr-2 transition-transform group-hover/btn:translate-y-0.5" />
                      {app.cta.label}
                    </a>
                  </Button>
                </div>
              </motion.article>
            );
          })}
        </div>

        {/* Integration callout */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-12 relative rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-background to-accent/10 p-6 md:p-8 flex flex-col md:flex-row items-center gap-6"
        >
          <div className="flex items-center gap-4">
            <img
              src={LEMTEL_LOGO}
              alt="Lemtel logo"
              className="w-14 h-14 object-contain drop-shadow-[0_0_12px_hsl(var(--primary)/0.6)]"
            />
            <div className="text-2xl text-muted-foreground">×</div>
            <img
              src="/favicon.png"
              alt="AVA Statistic logo"
              className="w-14 h-14 object-contain drop-shadow-[0_0_12px_hsl(var(--primary)/0.6)]"
            />
          </div>
          <div className="flex-1 text-center md:text-left">
            <h4 className="font-semibold text-lg mb-1">
              Lemtel FashionPBX ⟷ AVA AI Agents
            </h4>
            <p className="text-sm text-muted-foreground">
              Click-to-dial Chrome extension, custom <code className="px-1.5 py-0.5 rounded bg-muted text-primary text-xs">lemtel://</code> protocol handler,
              real-time SIP webhooks, and AI voice agents — all on one stack.
            </p>
          </div>
          <Button asChild className="bg-primary hover:bg-primary/90 whitespace-nowrap">
            <a href="/integrations#lemtel">View Integration</a>
          </Button>
        </motion.div>
      </div>
    </section>
  );
};
