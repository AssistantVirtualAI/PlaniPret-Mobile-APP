import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sparkles, Bot, Phone, BarChart3, TrendingUp, CheckCircle,
  Activity, Play, Pause, Mic, Globe, Users, ArrowRight,
  Zap, Shield, Volume2, PhoneCall, PhoneIncoming, Clock,
  Star, ThumbsUp, MessageSquare,
} from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useNavigate } from "react-router-dom";

/* ────────────────────────────────────────────────────────
   Shared helpers
───────────────────────────────────────────────────────── */
const Waveform = ({ color = "primary", bars = 20, playing = true }: { color?: string; bars?: number; playing?: boolean }) => (
  <div className="flex items-center gap-0.5 h-8">
    {Array.from({ length: bars }).map((_, i) => (
      <motion.div
        key={i}
        className="flex-1 rounded-full"
        style={{ background: `hsl(var(--${color}) / 0.6)`, height: "100%", transformOrigin: "center" }}
        animate={playing
          ? { scaleY: [0.2, 0.5 + Math.sin(i * 0.8) * 0.5, 0.2] }
          : { scaleY: 0.2 }}
        transition={{ duration: 0.8 + (i % 4) * 0.15, repeat: playing ? Infinity : 0, delay: i * 0.04, ease: "easeInOut" }}
      />
    ))}
  </div>
);

const MiniBar = ({ val, max = 100, color = "primary" }: { val: number; max?: number; color?: string }) => (
  <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
    <motion.div
      className="h-full rounded-full"
      style={{ background: `hsl(var(--${color}))` }}
      initial={{ width: 0 }}
      animate={{ width: `${(val / max) * 100}%` }}
      transition={{ duration: 0.7, ease: "easeOut" }}
    />
  </div>
);

/* ────────────────────────────────────────────────────────
   Slide 1 — Agent Management
───────────────────────────────────────────────────────── */
const AgentSlide = () => {
  const [selected, setSelected] = useState(0);
  const agents = [
    { name: "AVA Support", platform: "ElevenLabs", status: "live",  calls: "1,247", score: 94 },
    { name: "LeadQual Bot", platform: "Vapi",        status: "live",  calls: "832",   score: 87 },
    { name: "Booking Pro",  platform: "Retell AI",   status: "idle",  calls: "418",   score: 91 },
  ];
  const ag = agents[selected];

  return (
    <div className="grid lg:grid-cols-5 gap-4 min-h-[340px]">
      {/* Agent list */}
      <div className="lg:col-span-2 space-y-2">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">My Agents</div>
        {agents.map((a, i) => (
          <motion.button
            key={a.name}
            onClick={() => setSelected(i)}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.07 }}
            className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all ${
              selected === i
                ? "border-primary/40 bg-primary/5 shadow-sm"
                : "border-border/40 bg-muted/10 hover:border-border"
            }`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-primary-foreground flex-shrink-0 ${
              i === 0 ? "bg-primary" : i === 1 ? "bg-secondary" : "bg-accent"
            }`}>
              <Bot className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{a.name}</div>
              <div className="text-[10px] text-muted-foreground">{a.platform}</div>
            </div>
            <div className={`text-[10px] font-bold ${a.status === "live" ? "text-emerald-500" : "text-amber-500"}`}>
              ● {a.status}
            </div>
          </motion.button>
        ))}

        {/* Platform badges */}
        <div className="flex gap-1.5 flex-wrap pt-2">
          {["ElevenLabs", "Vapi", "Retell"].map((p) => (
            <Badge key={p} variant="outline" className="text-[10px] py-0.5">{p}</Badge>
          ))}
        </div>
      </div>

      {/* Agent detail panel */}
      <AnimatePresence mode="wait">
        <motion.div
          key={selected}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.22 }}
          className="lg:col-span-3 space-y-3"
        >
          {/* Header */}
          <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Bot className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-sm">{ag.name}</div>
              <div className="text-[10px] text-muted-foreground">{ag.platform} · Agent</div>
            </div>
            <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">
              ● {ag.status}
            </Badge>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Total Calls", value: ag.calls, icon: PhoneCall },
              { label: "Satisfaction", value: `${ag.score}%`, icon: Star },
              { label: "Uptime", value: "99.9%", icon: Activity },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="rounded-xl border border-border/40 bg-muted/10 p-3 text-center">
                  <Icon className="w-4 h-4 text-primary mx-auto mb-1" />
                  <div className="text-base font-bold">{s.value}</div>
                  <div className="text-[10px] text-muted-foreground">{s.label}</div>
                </div>
              );
            })}
          </div>

          {/* Voice preview */}
          <div className="rounded-xl border border-border/40 bg-muted/10 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Volume2 className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-medium">Voice Preview</span>
              </div>
              <span className="text-[10px] text-muted-foreground">Rachel · EN</span>
            </div>
            <Waveform bars={22} />
          </div>

          {/* Sync status */}
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-xs font-medium">Config synced to {ag.platform}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">2m ago</span>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

/* ────────────────────────────────────────────────────────
   Slide 2 — Telephony
───────────────────────────────────────────────────────── */
const TelephonySlide = () => {
  const calls = [
    { num: "+1 (555) 234-5678", dir: "inbound",  agent: "AVA Support",  dur: "4:23", status: "completed" },
    { num: "+33 1 42 68 53 00", dir: "outbound", agent: "LeadQual Bot",  dur: "2:11", status: "live"      },
    { num: "+44 20 7946 0958",  dir: "inbound",  agent: "Booking Pro",   dur: "6:05", status: "completed" },
    { num: "+49 30 1234 5678",  dir: "outbound", agent: "AVA Support",   dur: "1:47", status: "missed"    },
  ];

  const numbers = [
    { number: "+1 (555) 234-5678", agent: "AVA Support",   provider: "Twilio", country: "🇺🇸" },
    { number: "+33 1 42 68 53 00",  agent: "LeadQual Bot",  provider: "Twilio", country: "🇫🇷" },
    { number: "+44 20 7946 0958",   agent: "Booking Pro",   provider: "Twilio", country: "🇬🇧" },
  ];

  return (
    <div className="grid lg:grid-cols-5 gap-4 min-h-[340px]">
      {/* Phone numbers panel */}
      <div className="lg:col-span-2 space-y-2">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">Phone Numbers</div>
        {numbers.map((n, i) => (
          <motion.div
            key={n.number}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08 }}
            className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-muted/10 px-3 py-2.5"
          >
            <span className="text-lg flex-shrink-0">{n.country}</span>
            <div className="flex-1 min-w-0">
              <div className="font-mono text-xs font-semibold truncate">{n.number}</div>
              <div className="text-[10px] text-muted-foreground">{n.agent}</div>
            </div>
            <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
          </motion.div>
        ))}

        {/* Live activity */}
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 mt-2">
          <div className="flex items-center gap-2 mb-2">
            <PhoneIncoming className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs font-medium">1 active call</span>
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse ml-auto" />
          </div>
          <Waveform bars={16} color="secondary" />
        </div>
      </div>

      {/* Call log */}
      <div className="lg:col-span-3 space-y-2">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">Call History</div>
        {calls.map((c, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
              c.status === "live" ? "border-amber-400/30 bg-amber-400/5" : "border-border/40 bg-muted/10"
            }`}
          >
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
              c.dir === "inbound" ? "bg-primary/10" : "bg-secondary/10"
            }`}>
              {c.dir === "inbound"
                ? <PhoneIncoming className="w-3.5 h-3.5 text-primary" />
                : <PhoneCall className="w-3.5 h-3.5 text-secondary" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-mono text-xs truncate">{c.num}</div>
              <div className="text-[10px] text-muted-foreground">{c.agent}</div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-xs font-medium">{c.dur}</div>
              <div className={`text-[10px] font-medium ${
                c.status === "live" ? "text-amber-500"
                : c.status === "completed" ? "text-emerald-500"
                : "text-rose-500"
              }`}>
                {c.status}
              </div>
            </div>
          </motion.div>
        ))}

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mt-1">
          {[
            { label: "This Week", value: "248 calls", color: "text-primary" },
            { label: "Answered", value: "94.2%",      color: "text-emerald-500" },
            { label: "Avg Duration", value: "3m 42s", color: "text-foreground" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border/40 bg-muted/10 p-2.5 text-center">
              <div className={`text-sm font-bold ${s.color}`}>{s.value}</div>
              <div className="text-[10px] text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────────────────
   Slide 3 — Analytics & Performance
───────────────────────────────────────────────────────── */
const AnalyticsSlide = () => {
  const barData = [42, 58, 71, 55, 83, 67, 90, 74, 88, 95, 82, 78, 91, 86, 99];

  return (
    <div className="grid lg:grid-cols-5 gap-4 min-h-[340px]">
      {/* KPI column */}
      <div className="lg:col-span-2 space-y-2.5">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">Performance KPIs</div>

        {[
          { label: "Satisfaction Score", value: "94.2%", trend: "+3.1%", val: 94, color: "emerald" },
          { label: "Resolution Rate",    value: "87%",   trend: "+5.2%", val: 87, color: "primary"  },
          { label: "Response Time",      value: "< 1s",  trend: "−12%",  val: 95, color: "secondary"},
        ].map((k, i) => (
          <motion.div
            key={k.label}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.09 }}
            className="rounded-xl border border-border/40 bg-muted/10 p-3"
          >
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-xs text-muted-foreground">{k.label}</span>
              <span className="text-[10px] font-semibold text-emerald-500">{k.trend}</span>
            </div>
            <div className="text-lg font-extrabold mb-1.5">{k.value}</div>
            <MiniBar val={k.val} color={k.color} />
          </motion.div>
        ))}

        {/* Sentiment breakdown */}
        <div className="rounded-xl border border-border/40 bg-muted/10 p-3">
          <div className="text-xs font-medium mb-2">Sentiment Analysis</div>
          <div className="space-y-1.5">
            {[
              { label: "Positive", val: 68, color: "emerald" },
              { label: "Neutral",  val: 24, color: "secondary" },
              { label: "Negative", val: 8,  color: "rose"    },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-12">{s.label}</span>
                <div className="flex-1">
                  <MiniBar val={s.val} color={s.color} />
                </div>
                <span className="text-[10px] font-semibold w-8 text-right">{s.val}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Chart + conversation activity */}
      <div className="lg:col-span-3 space-y-3">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">Conversations Over Time</div>

        {/* Bar chart */}
        <div className="rounded-xl border border-border/40 bg-muted/10 p-4">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-medium">Last 15 days</span>
            <div className="flex items-center gap-1 text-emerald-500 text-xs font-semibold">
              <TrendingUp className="w-3 h-3" /> +18% vs prev
            </div>
          </div>
          <div className="flex items-end gap-1 h-24">
            {barData.map((h, i) => (
              <motion.div
                key={i}
                className="flex-1 rounded-t-sm"
                style={{ height: `${h}%`, transformOrigin: "bottom", background: `hsl(var(--primary) / ${0.2 + (h / 100) * 0.6})` }}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ delay: i * 0.04, duration: 0.5, ease: "easeOut" }}
              />
            ))}
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[10px] text-muted-foreground">Feb 3</span>
            <span className="text-[10px] text-muted-foreground">Feb 18</span>
          </div>
        </div>

        {/* Recent conversations */}
        <div className="space-y-2">
          {[
            { name: "Marie D.",  tag: "Resolved",   score: 98, time: "2m" },
            { name: "Thomas K.", tag: "Escalated",   score: 62, time: "8m" },
            { name: "Sofia R.",  tag: "Satisfied",   score: 91, time: "14m" },
          ].map((c, i) => (
            <motion.div
              key={c.name}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.07 }}
              className="flex items-center gap-3 rounded-xl border border-border/40 bg-muted/10 px-3 py-2"
            >
              <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                {c.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium">{c.name}</span>
              </div>
              <Badge
                variant="outline"
                className={`text-[10px] py-0 h-5 ${
                  c.score >= 85 ? "border-emerald-500/30 text-emerald-500"
                  : c.score >= 65 ? "border-amber-500/30 text-amber-500"
                  : "border-rose-500/30 text-rose-500"
                }`}
              >
                {c.tag}
              </Badge>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Star className="w-3 h-3 text-amber-400" />
                <span className="text-xs font-bold">{c.score}</span>
              </div>
              <span className="text-[10px] text-muted-foreground flex-shrink-0">{c.time} ago</span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────────────────
   Tab configuration
───────────────────────────────────────────────────────── */
const tabs = [
  {
    key: "agents",
    icon: Bot,
    gradient: "from-primary to-primary/70",
    Component: AgentSlide,
  },
  {
    key: "telephony",
    icon: Phone,
    gradient: "from-amber-500 to-amber-400",
    Component: TelephonySlide,
  },
  {
    key: "analytics",
    icon: BarChart3,
    gradient: "from-emerald-500 to-emerald-400",
    Component: AnalyticsSlide,
  },
] as const;

type TabKey = (typeof tabs)[number]["key"];

/* ────────────────────────────────────────────────────────
   Main section
───────────────────────────────────────────────────────── */
export const ProductShowcaseSection = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [active, setActive] = useState<TabKey>("agents");
  const [paused, setPaused] = useState(false);

  const keys = tabs.map((t) => t.key);

  const advance = useCallback(() => {
    setActive((cur) => {
      const idx = keys.indexOf(cur);
      return keys[(idx + 1) % keys.length] as TabKey;
    });
  }, []);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(advance, 4000);
    return () => clearInterval(id);
  }, [paused, advance]);

  const activeTab = tabs.find((t) => t.key === active)!;
  const ActiveComponent = activeTab.Component;
  const activeIdx = keys.indexOf(active);

  return (
    <section className="py-28 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-accent/5 to-background" />
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/8 rounded-full blur-3xl" />

      <div className="container mx-auto px-6 relative z-10">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <Badge variant="secondary" className="gap-2 mb-5">
            <Sparkles className="w-3.5 h-3.5" />
            {t("landing.showcase.badge")}
          </Badge>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold mb-4">
            A unified Admin Portal experience
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Create agents, manage telephony, and track performance — all from one portal.
          </p>
        </motion.div>

        {/* Main card */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          className="relative max-w-6xl mx-auto"
        >
          {/* Glow */}
          <div className="absolute -inset-4 bg-gradient-to-r from-primary/15 via-secondary/10 to-accent/15 rounded-3xl blur-2xl" />

          <div className="relative rounded-3xl border border-border/60 bg-card/70 backdrop-blur-xl overflow-hidden shadow-2xl">

            {/* ── Browser chrome ── */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 bg-muted/20">
              <div className="flex gap-1.5 flex-shrink-0">
                <div className="w-3 h-3 rounded-full bg-rose-500/70" />
                <div className="w-3 h-3 rounded-full bg-amber-400/70" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/70" />
              </div>

              {/* Tab strip */}
              <div className="flex gap-1 flex-1">
                {tabs.map((tab) => {
                  const isA = active === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => { setActive(tab.key); setPaused(true); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-medium transition-all duration-200 flex-shrink-0 ${
                        isA
                          ? "bg-background text-foreground border-x border-t border-border/60 -mb-px pb-[7px]"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                      }`}
                    >
                      <tab.icon className={`w-3 h-3 ${isA ? "text-primary" : ""}`} />
                      {t(`landing.showcase.${tab.key === "agents" ? "agent" : tab.key === "telephony" ? "twilio" : "analytics"}.title`)}
                    </button>
                  );
                })}
              </div>

              {/* URL + live indicator */}
              <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted/50 border border-border/40">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-xs text-muted-foreground font-mono hidden sm:block">app.avastatistic.com</span>
              </div>
            </div>

            {/* ── App shell: sidebar + content ── */}
            <div className="flex">
              {/* Mini sidebar */}
              <div className="w-14 border-r border-border/40 bg-muted/10 py-4 flex flex-col items-center gap-2 flex-shrink-0">
                {tabs.map((tab) => {
                  const isA = active === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => { setActive(tab.key); setPaused(true); }}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                        isA ? `bg-gradient-to-br ${tab.gradient} shadow-md` : "hover:bg-muted/50 text-muted-foreground"
                      }`}
                    >
                      <tab.icon className={`w-4 h-4 ${isA ? "text-white" : ""}`} />
                    </button>
                  );
                })}
                {/* Extra nav items (decorative) */}
                {[Users, Globe, Shield].map((Icon, i) => (
                  <div key={i} className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground/30">
                    <Icon className="w-4 h-4" />
                  </div>
                ))}
              </div>

              {/* Page content */}
              <div className="flex-1 min-w-0">
                {/* Page header */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`phdr-${active}`}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-3 px-5 py-3 border-b border-border/30"
                    style={{ background: `linear-gradient(to right, hsl(var(--primary) / 0.04), transparent)` }}
                  >
                    <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${activeTab.gradient} flex items-center justify-center flex-shrink-0`}>
                      <activeTab.icon className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span className="text-sm font-semibold">
                      {t(`landing.showcase.${active === "agents" ? "agent" : active === "telephony" ? "twilio" : "analytics"}.title`)}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-xs text-muted-foreground">Live</span>
                      {/* Play/pause */}
                      <button
                        onClick={() => setPaused(p => !p)}
                        className="ml-2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                      >
                        {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </motion.div>
                </AnimatePresence>

                {/* Module content */}
                <div className="p-5">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={active}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.25 }}
                    >
                      <ActiveComponent />
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {/* ── Progress bar ── */}
            <div className="h-0.5 bg-muted/30 relative overflow-hidden">
              <motion.div
                key={active}
                className={`absolute inset-y-0 left-0 bg-gradient-to-r ${activeTab.gradient}`}
                initial={{ width: "0%" }}
                animate={{ width: paused ? `${((activeIdx + 1) / tabs.length) * 100}%` : "100%" }}
                transition={{ duration: paused ? 0.2 : 4, ease: "linear" }}
              />
            </div>
          </div>

          {/* Dot indicators */}
          <div className="flex justify-center gap-1.5 mt-4">
            {tabs.map((tab, i) => (
              <button
                key={tab.key}
                onClick={() => { setActive(tab.key); setPaused(true); }}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  active === tab.key ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                }`}
              />
            ))}
          </div>
        </motion.div>

        {/* Bottom feature pills */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="flex flex-wrap justify-center gap-3 mt-12 mb-10"
        >
          {[
            { icon: Zap,          text: "No-code agent creation"   },
            { icon: Globe,        text: "Multi-platform telephony"  },
            { icon: BarChart3,    text: "Real-time analytics"       },
            { icon: Shield,       text: "Enterprise security"       },
            { icon: MessageSquare,text: "AI conversation insights"  },
          ].map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.text}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 border border-border/50 rounded-full px-4 py-2"
              >
                <Icon className="w-3.5 h-3.5 text-primary" />
                {f.text}
              </motion.div>
            );
          })}
        </motion.div>

        {/* CTA */}
        <div className="text-center">
          <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
            <Button
              size="lg"
              className="h-14 px-8 text-lg font-semibold bg-gradient-to-r from-primary to-secondary hover:opacity-90 shadow-xl shadow-primary/25"
              onClick={() => navigate("/demo-request")}
            >
              See the full portal
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </motion.div>
        </div>

      </div>
    </section>
  );
};
