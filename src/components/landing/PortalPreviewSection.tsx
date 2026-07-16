import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bot, MessageSquare, BarChart3, Phone, BookOpen, Users,
  Settings, ArrowRight, Sparkles, TrendingUp, CheckCircle,
  Clock, Globe, Zap, Star, Layers, CreditCard, Play,
  Pause, ExternalLink, ChevronRight, ThumbsUp, Rocket,
  ShieldCheck, PhoneCall, Activity, Volume2, Building2,
  Puzzle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";

const SITE_URL = "app.avastatistic.com";

/* ─── Scroll helper ──────────────────────────────────── */
const scrollTo = (id: string) => {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
};

/* ─── All modules (one per landing section) ─────────── */
const modules = [
  {
    key: "how-it-works",
    label: "How It Works",
    sectionId: "how-it-works",
    icon: Layers,
    color: "from-primary to-primary/70",
    tagline: "5 steps · No code",
  },
  {
    key: "agents",
    label: "Agents",
    sectionId: "agent-creation",
    icon: Bot,
    color: "from-blue-500 to-blue-400",
    tagline: "ElevenLabs · Vapi · Retell",
  },
  {
    key: "features",
    label: "Features",
    sectionId: "features",
    icon: Zap,
    color: "from-violet-500 to-violet-400",
    tagline: "40+ features",
  },
  {
    key: "live-demo",
    label: "Live Demo",
    sectionId: "live-demo",
    icon: Play,
    color: "from-pink-500 to-pink-400",
    tagline: "Try it now",
  },
  {
    key: "portals",
    label: "Portals",
    sectionId: "portals",
    icon: Building2,
    color: "from-amber-500 to-amber-400",
    tagline: "Admin · Client · Agent",
  },
  {
    key: "integrations",
    label: "Integrations",
    sectionId: "integrations",
    icon: Puzzle,
    color: "from-sky-500 to-sky-400",
    tagline: "Twilio · GPT-4 · more",
  },
  {
    key: "analytics",
    label: "Analytics",
    sectionId: "analytics",
    icon: BarChart3,
    color: "from-emerald-500 to-emerald-400",
    tagline: "Real-time insights",
  },
  {
    key: "testimonials",
    label: "Testimonials",
    sectionId: "testimonials",
    icon: ThumbsUp,
    color: "from-rose-500 to-rose-400",
    tagline: "See what clients say",
  },
  {
    key: "pricing",
    label: "Pricing",
    sectionId: "pricing",
    icon: CreditCard,
    color: "from-slate-500 to-slate-400",
    tagline: "Flexible plans",
  },
] as const;

type ModuleKey = (typeof modules)[number]["key"];

/* ─── Shared mini-bar chart ──────────────────────────── */
const MiniBar = ({ bars = 14 }: { bars?: number }) => {
  const heights = Array.from({ length: bars }, (_, i) =>
    Math.max(15, 30 + Math.sin(i * 0.9) * 22 + (i % 3) * 9)
  );
  return (
    <div className="flex items-end gap-1 h-16">
      {heights.map((h, i) => (
        <motion.div
          key={i}
          className="flex-1 rounded-t-sm"
          style={{ background: `hsl(var(--primary) / ${0.12 + (h / 85) * 0.55})` }}
          initial={{ height: 0 }}
          animate={{ height: `${h}%` }}
          transition={{ delay: i * 0.03, duration: 0.45, ease: "easeOut" }}
        />
      ))}
    </div>
  );
};

/* ─── Per-module preview content ────────────────────── */

const HowItWorksPreview = () => (
  <div className="space-y-2.5">
    {[
      { step: 1, label: "Choose your platform", done: true,  color: "bg-blue-500"    },
      { step: 2, label: "Write your prompt",     done: true,  color: "bg-violet-500"  },
      { step: 3, label: "Pick a voice",          done: true,  color: "bg-pink-500"    },
      { step: 4, label: "Configure settings",    done: false, color: "bg-amber-500"   },
      { step: 5, label: "Push → Live",           done: false, color: "bg-emerald-500" },
    ].map((s, i) => (
      <motion.div
        key={s.step}
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: i * 0.07 }}
        className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${s.done ? "border-border/40 bg-muted/10" : "border-primary/20 bg-primary/5"}`}
      >
        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${s.color}`}>
          {s.done ? "✓" : s.step}
        </div>
        <span className={`text-sm flex-1 ${s.done ? "text-muted-foreground line-through" : "font-medium"}`}>{s.label}</span>
        {!s.done && s.step === 4 && (
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse flex-shrink-0" />
        )}
      </motion.div>
    ))}
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.4 }}
      className="rounded-xl bg-emerald-500/8 border border-emerald-500/20 px-3 py-2 flex items-center gap-2"
    >
      <Rocket className="w-3.5 h-3.5 text-emerald-500" />
      <span className="text-xs text-muted-foreground">Average deploy time: <strong className="text-foreground">under 5 minutes</strong></span>
    </motion.div>
  </div>
);

const AgentsPreview = () => (
  <div className="space-y-2.5">
    {[
      { name: "AVA Support",   platform: "ElevenLabs", status: "live", calls: "1,247", score: 94 },
      { name: "LeadQual Bot",  platform: "Vapi",        status: "live", calls: "832",   score: 87 },
      { name: "Booking Agent", platform: "Retell AI",   status: "idle", calls: "418",   score: 91 },
    ].map((a, i) => (
      <motion.div
        key={a.name}
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: i * 0.08 }}
        className="flex items-center gap-3 rounded-xl border border-border/40 bg-muted/10 px-3 py-2.5"
      >
        <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
          <Bot className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{a.name}</div>
          <div className="text-[10px] text-muted-foreground">{a.platform}</div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-xs font-semibold">{a.calls} calls</div>
          <div className={`text-[10px] font-medium ${a.status === "live" ? "text-emerald-500" : "text-amber-500"}`}>● {a.status}</div>
        </div>
      </motion.div>
    ))}
    <div className="pt-1"><MiniBar /></div>
  </div>
);

const FeaturesPreview = () => (
  <div className="space-y-2">
    <div className="grid grid-cols-2 gap-2">
      {[
        { icon: Bot,          label: "AI Agent Builder",       color: "text-blue-500"    },
        { icon: Volume2,      label: "120+ Voices",            color: "text-pink-500"    },
        { icon: Phone,        label: "Telephony Suite",        color: "text-amber-500"   },
        { icon: BarChart3,    label: "Real-time Analytics",    color: "text-emerald-500" },
        { icon: ShieldCheck,  label: "GDPR Compliant",         color: "text-violet-500"  },
        { icon: Globe,        label: "Multi-language",         color: "text-sky-500"     },
      ].map((f, i) => {
        const Icon = f.icon;
        return (
          <motion.div
            key={f.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.06 }}
            className="flex items-center gap-2 rounded-xl border border-border/40 bg-muted/10 px-2.5 py-2"
          >
            <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${f.color}`} />
            <span className="text-xs font-medium truncate">{f.label}</span>
          </motion.div>
        );
      })}
    </div>
    <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 flex items-center gap-2">
      <Zap className="w-3.5 h-3.5 text-primary" />
      <span className="text-xs text-muted-foreground">40+ features · Updated weekly</span>
      <CheckCircle className="w-3.5 h-3.5 text-emerald-500 ml-auto" />
    </div>
  </div>
);

const LiveDemoPreview = () => {
  const msgs = [
    { role: "agent", text: "Bonjour ! Comment puis-je vous aider aujourd'hui ?" },
    { role: "user",  text: "Je cherche un agent pour mon site e-commerce." },
    { role: "agent", text: "Parfait ! Avec AVA, vous pouvez créer un agent en 5 minutes." },
  ];
  return (
    <div className="space-y-2">
      {msgs.map((m, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.18 }}
          className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div className={`rounded-2xl px-3 py-2 max-w-[85%] text-xs ${
            m.role === "agent"
              ? "bg-primary/10 border border-primary/20 text-foreground"
              : "bg-primary text-primary-foreground"
          }`}>
            {m.text}
          </div>
        </motion.div>
      ))}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-3 py-2"
      >
        <Activity className="w-3.5 h-3.5 text-emerald-500" />
        <span className="text-xs text-muted-foreground">AVA is responding in real-time</span>
        <div className="ml-auto flex gap-0.5">
          {[0,1,2].map(i => (
            <motion.div key={i} className="w-1 h-1 rounded-full bg-emerald-500"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
};

const PortalsPreview = () => (
  <div className="space-y-2">
    {[
      { name: "Admin Portal",  desc: "Full control · All agents",          color: "bg-primary",   features: ["Agents", "Billing", "Analytics"] },
      { name: "Client Portal", desc: "White-label · Your branding",        color: "bg-secondary", features: ["My Agents", "Reports"]           },
      { name: "Agent Portal",  desc: "Simplified · Conversation-focused",  color: "bg-accent",    features: ["Conversations", "KB"]            },
    ].map((p, i) => (
      <motion.div
        key={p.name}
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: i * 0.09 }}
        className="rounded-xl border border-border/40 bg-muted/10 p-3"
      >
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-primary-foreground text-xs font-bold flex-shrink-0 ${p.color}`}>
            {p.name[0]}
          </div>
          <div>
            <div className="text-sm font-semibold">{p.name}</div>
            <div className="text-[10px] text-muted-foreground">{p.desc}</div>
          </div>
        </div>
        <div className="flex gap-1 flex-wrap">
          {p.features.map(f => (
            <span key={f} className="text-[10px] border border-border/40 rounded-full px-2 py-0.5 text-muted-foreground">{f}</span>
          ))}
        </div>
      </motion.div>
    ))}
  </div>
);

const IntegrationsPreview = () => (
  <div className="space-y-2">
    <div className="grid grid-cols-3 gap-2">
      {[
        { name: "ElevenLabs", icon: "🎙", status: "connected" },
        { name: "Vapi",       icon: "📞", status: "connected" },
        { name: "Retell AI",  icon: "🤖", status: "connected" },
        { name: "Twilio",     icon: "📱", status: "connected" },
        { name: "OpenAI",     icon: "🧠", status: "connected" },
        { name: "Google Cal", icon: "📅", status: "available" },
      ].map((int, i) => (
        <motion.div
          key={int.name}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.06 }}
          className="rounded-xl border border-border/40 bg-muted/10 p-2.5 flex flex-col items-center gap-1"
        >
          <span className="text-xl">{int.icon}</span>
          <span className="text-[10px] font-medium text-center truncate w-full text-center">{int.name}</span>
          <div className={`w-1.5 h-1.5 rounded-full ${int.status === "connected" ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
        </motion.div>
      ))}
    </div>
    <div className="rounded-xl border border-sky-400/20 bg-sky-400/5 px-3 py-2 flex items-center gap-2">
      <Puzzle className="w-3.5 h-3.5 text-sky-400" />
      <span className="text-xs text-muted-foreground">5 active integrations · REST API available</span>
    </div>
  </div>
);

const AnalyticsPreview = () => (
  <div className="space-y-2.5">
    <div className="grid grid-cols-3 gap-2">
      {[
        { label: "Satisfaction", value: "94.2%", color: "text-emerald-500" },
        { label: "Resolution",   value: "87%",   color: "text-primary"     },
        { label: "Conversations",value: "2.8K",  color: "text-foreground"  },
      ].map((s, i) => (
        <motion.div
          key={s.label}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08 }}
          className="rounded-xl border border-border/40 bg-muted/10 p-2.5 text-center"
        >
          <div className={`text-base font-extrabold ${s.color}`}>{s.value}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{s.label}</div>
        </motion.div>
      ))}
    </div>
    <div className="rounded-xl border border-border/40 bg-muted/10 p-3">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-medium text-muted-foreground">Last 14 days</span>
        <div className="flex items-center gap-1 text-emerald-500 text-xs font-semibold">
          <TrendingUp className="w-3 h-3" /> +18%
        </div>
      </div>
      <MiniBar />
    </div>
  </div>
);

const TestimonialsPreview = () => (
  <div className="space-y-2.5">
    {[
      { name: "Sophie M.",   role: "CEO · TechStart",       text: "AVA reduced our support costs by 70% in the first month.", stars: 5 },
      { name: "Marc D.",     role: "CTO · InnoGroup",       text: "Setup took 10 minutes. Incredible ROI.", stars: 5 },
      { name: "Laura K.",    role: "Ops · VoiceAgency Pro", text: "The white-label portal impressed our clients.", stars: 5 },
    ].map((rev, i) => (
      <motion.div
        key={rev.name}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: i * 0.09 }}
        className="rounded-xl border border-border/40 bg-muted/10 p-3"
      >
        <div className="flex gap-0.5 mb-1.5">
          {Array.from({ length: rev.stars }).map((_, j) => (
            <Star key={j} className="w-3 h-3 text-amber-400 fill-amber-400" />
          ))}
        </div>
        <p className="text-xs text-muted-foreground italic mb-2">"{rev.text}"</p>
        <div className="text-xs font-semibold">{rev.name} <span className="font-normal text-muted-foreground">· {rev.role}</span></div>
      </motion.div>
    ))}
  </div>
);

const PricingPreview = () => (
  <div className="space-y-2">
    {[
      { plan: "Starter",  price: "€49/mo",  highlight: false, features: ["3 agents", "1 portal", "Basic analytics"]       },
      { plan: "Business", price: "€149/mo", highlight: true,  features: ["Unlimited agents", "White-label", "Priority support"] },
      { plan: "Enterprise",price: "Custom", highlight: false, features: ["SLA", "Dedicated support", "Custom integrations"] },
    ].map((p, i) => (
      <motion.div
        key={p.plan}
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: i * 0.08 }}
        className={`rounded-xl border px-3 py-2.5 ${p.highlight ? "border-primary/40 bg-primary/5" : "border-border/40 bg-muted/10"}`}
      >
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">{p.plan}</span>
            {p.highlight && <Badge className="text-[10px] py-0 h-4 bg-primary/15 text-primary border-primary/20">Popular</Badge>}
          </div>
          <span className={`text-sm font-bold ${p.highlight ? "text-primary" : ""}`}>{p.price}</span>
        </div>
        <div className="flex gap-1 flex-wrap">
          {p.features.map(f => (
            <span key={f} className="text-[10px] text-muted-foreground">· {f}</span>
          ))}
        </div>
      </motion.div>
    ))}
  </div>
);

const previewMap: Record<ModuleKey, () => JSX.Element> = {
  "how-it-works":  HowItWorksPreview,
  "agents":        AgentsPreview,
  "features":      FeaturesPreview,
  "live-demo":     LiveDemoPreview,
  "portals":       PortalsPreview,
  "integrations":  IntegrationsPreview,
  "analytics":     AnalyticsPreview,
  "testimonials":  TestimonialsPreview,
  "pricing":       PricingPreview,
};

/* ─── Main Section ───────────────────────────────────── */
export const PortalPreviewSection = () => {
  const [active, setActive] = useState<ModuleKey>("how-it-works");
  const [paused, setPaused] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();

  const moduleKeys = modules.map((m) => m.key) as ModuleKey[];

  const advance = useCallback(() => {
    setActive((cur) => {
      const idx = moduleKeys.indexOf(cur);
      return moduleKeys[(idx + 1) % moduleKeys.length];
    });
  }, []);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(advance, 3500);
    return () => clearInterval(id);
  }, [paused, advance]);

  const Preview = previewMap[active];
  const activeMod = modules.find((m) => m.key === active)!;
  const activeIdx = moduleKeys.indexOf(active);

  const handleGoToSection = () => {
    scrollTo(activeMod.sectionId);
    setPaused(true);
  };

  return (
    <section className="py-28 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/5 to-background" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[700px] bg-primary/8 rounded-full blur-3xl" />

      <div className="container mx-auto px-6 relative z-10">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <Badge variant="secondary" className="gap-2 mb-5">
            <Sparkles className="w-3.5 h-3.5" />
            {t("portalPreview.badge")}
          </Badge>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold mb-4">
            {t("portalPreview.title")}
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            {t("portalPreview.subtitle")}
          </p>
        </motion.div>

        {/* Browser mockup */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          className="relative max-w-5xl mx-auto mb-12"
        >
          <div className="absolute -inset-4 bg-gradient-to-r from-primary/15 via-secondary/10 to-accent/15 rounded-3xl blur-2xl" />

          <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl overflow-hidden shadow-2xl">

            {/* ── Browser chrome ── */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 bg-muted/30">
              <div className="flex gap-1.5 flex-shrink-0">
                <div className="w-3 h-3 rounded-full bg-rose-500/70" />
                <div className="w-3 h-3 rounded-full bg-amber-400/70" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/70" />
              </div>

              {/* Scrollable tab strip */}
              <div className="flex gap-0.5 overflow-x-auto flex-1 px-1 scrollbar-hide">
                {modules.map((mod) => {
                  const isA = active === mod.key;
                  return (
                    <button
                      key={mod.key}
                      onClick={() => { setActive(mod.key); setPaused(true); }}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-t-lg text-[11px] font-medium whitespace-nowrap transition-all duration-200 flex-shrink-0 ${
                        isA
                          ? "bg-background text-foreground border-x border-t border-border/60 -mb-px pb-[5px]"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                      }`}
                    >
                      <mod.icon className={`w-3 h-3 ${isA ? "text-primary" : ""}`} />
                      {mod.label}
                    </button>
                  );
                })}
              </div>

              {/* URL bar */}
              <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted/50 border border-border/40">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-[11px] text-muted-foreground font-mono hidden sm:block">{SITE_URL}</span>
              </div>
            </div>

            {/* ── App shell ── */}
            <div className="flex min-h-[400px]">

              {/* Sidebar icon rail */}
              <div className="w-14 border-r border-border/40 bg-muted/10 py-4 flex flex-col items-center gap-2 flex-shrink-0">
                {modules.map((mod) => {
                  const isA = active === mod.key;
                  return (
                    <button
                      key={mod.key}
                      onClick={() => { setActive(mod.key); setPaused(true); }}
                      title={mod.label}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-150 ${
                        isA
                          ? `bg-gradient-to-br ${mod.color} shadow-md`
                          : "hover:bg-muted/50 text-muted-foreground"
                      }`}
                    >
                      <mod.icon className={`w-4 h-4 ${isA ? "text-white" : ""}`} />
                    </button>
                  );
                })}
              </div>

              {/* Page content */}
              <div className="flex-1 flex flex-col overflow-hidden">

                {/* Page header */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`phdr-${active}`}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-3 px-5 py-3 border-b border-border/30"
                    style={{ background: "linear-gradient(to right, hsl(var(--primary) / 0.04), transparent)" }}
                  >
                    <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${activeMod.color} flex items-center justify-center flex-shrink-0`}>
                      <activeMod.icon className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold">{activeMod.label}</div>
                      <div className="text-[10px] text-muted-foreground">{activeMod.tagline}</div>
                    </div>

                    {/* ✨ Navigation CTA */}
                    <motion.button
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={handleGoToSection}
                      className={`flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-full bg-gradient-to-r ${activeMod.color} text-white shadow-sm flex-shrink-0`}
                    >
                      Explore
                      <ExternalLink className="w-3 h-3" />
                    </motion.button>

                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[10px] text-muted-foreground">Live</span>
                      <button
                        onClick={() => setPaused(p => !p)}
                        className="ml-1 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                      >
                        {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </motion.div>
                </AnimatePresence>

                {/* Module preview */}
                <div className="flex-1 p-5 overflow-hidden">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={active}
                      initial={{ opacity: 0, x: 16 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -16 }}
                      transition={{ duration: 0.22 }}
                    >
                      <Preview />
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Section info footer */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`footer-${active}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center justify-between px-5 py-2.5 border-t border-border/30 bg-muted/10"
                  >
                    <div className="flex items-center gap-2">
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
                      <span className="text-[11px] text-muted-foreground">
                        Click <strong className="text-foreground">"Explore"</strong> to jump to this section
                      </span>
                    </div>
                    <button
                      onClick={handleGoToSection}
                      className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1"
                    >
                      Go to {activeMod.label} <ArrowRight className="w-3 h-3" />
                    </button>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-0.5 bg-muted/30 relative overflow-hidden">
              <motion.div
                key={active}
                className={`absolute inset-y-0 left-0 bg-gradient-to-r ${activeMod.color}`}
                initial={{ width: "0%" }}
                animate={{ width: paused ? `${((activeIdx + 1) / moduleKeys.length) * 100}%` : "100%" }}
                transition={{ duration: paused ? 0.2 : 3.5, ease: "linear" }}
              />
            </div>
          </div>

          {/* Dot indicators */}
          <div className="flex justify-center gap-1.5 mt-4">
            {modules.map((mod) => (
              <button
                key={mod.key}
                onClick={() => { setActive(mod.key); setPaused(true); }}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  active === mod.key ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                }`}
              />
            ))}
          </div>
        </motion.div>

        {/* Quick-nav pills below mockup */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="flex flex-wrap justify-center gap-2 mb-12"
        >
          {modules.map((mod) => {
            const Icon = mod.icon;
            return (
              <button
                key={mod.key}
                onClick={() => scrollTo(mod.sectionId)}
                className="flex items-center gap-2 text-xs font-medium text-muted-foreground bg-muted/40 border border-border/50 hover:border-primary/30 hover:text-foreground rounded-full px-3 py-1.5 transition-colors"
              >
                <Icon className="w-3.5 h-3.5 text-primary" />
                {mod.label}
              </button>
            );
          })}
        </motion.div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <h3 className="text-2xl md:text-3xl font-bold mb-6">
            {t("portalPreview.statement")}
          </h3>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              size="lg"
              className="h-14 px-8 text-lg font-semibold bg-gradient-to-r from-primary to-secondary hover:opacity-90 shadow-xl shadow-primary/25"
              onClick={() => navigate("/demo-request")}
            >
              {t("portalPreview.cta")}
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};
