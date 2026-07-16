import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sparkles, Bot, Wand2, Mic, Sliders, Rocket, ArrowRight,
  Check, ChevronRight, Zap, Globe, RefreshCw, Play, Pause,
  CheckCircle, Volume2, Settings2, Activity, Phone,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";

/* ──────────────────────────────────────────────────────── */
/*  Step data                                               */
/* ──────────────────────────────────────────────────────── */
const steps = [
  { icon: Bot,     key: "s1", color: "from-blue-500 to-blue-600",     nodeColor: "hsl(217 91% 60%)", accent: "blue"    },
  { icon: Wand2,   key: "s2", color: "from-violet-500 to-violet-600", nodeColor: "hsl(262 83% 65%)", accent: "violet"  },
  { icon: Mic,     key: "s3", color: "from-pink-500 to-pink-600",     nodeColor: "hsl(330 81% 60%)", accent: "pink"    },
  { icon: Sliders, key: "s4", color: "from-amber-500 to-amber-600",   nodeColor: "hsl(43 96% 56%)",  accent: "amber"   },
  { icon: Rocket,  key: "s5", color: "from-emerald-500 to-emerald-600", nodeColor: "hsl(160 84% 39%)", accent: "emerald" },
] as const;

/* ──────────────────────────────────────────────────────── */
/*  Per-step dashboard preview panels                       */
/* ──────────────────────────────────────────────────────── */

const PlatformStep = () => (
  <div className="space-y-2.5">
    <div className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Choose Platform</div>
    {[
      { name: "ElevenLabs", icon: "🎙", badge: "Recommended", badgeColor: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
      { name: "Vapi",       icon: "📞", badge: "Voice AI",    badgeColor: "text-violet-400 bg-violet-400/10 border-violet-400/20" },
      { name: "Retell AI",  icon: "🤖", badge: "Realtime",    badgeColor: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
    ].map((p, i) => (
      <motion.div
        key={p.name}
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: i * 0.08 }}
        className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${i === 0 ? "border-blue-400/40 bg-blue-400/5 shadow-sm" : "border-border/40 bg-muted/10"}`}
      >
        <span className="text-xl">{p.icon}</span>
        <span className="text-sm font-medium flex-1">{p.name}</span>
        <span className={`text-[10px] font-semibold border rounded-full px-2 py-0.5 ${p.badgeColor}`}>{p.badge}</span>
        {i === 0 && <CheckCircle className="w-4 h-4 text-blue-400 flex-shrink-0" />}
      </motion.div>
    ))}
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3 }}
      className="mt-3 rounded-xl bg-blue-500/8 border border-blue-400/20 p-3"
    >
      <div className="text-xs text-muted-foreground mb-1">Agent name</div>
      <div className="text-sm font-semibold">AVA Customer Support</div>
    </motion.div>
  </div>
);

const PromptStep = () => (
  <div className="space-y-2.5">
    <div className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">System Prompt</div>
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/50 bg-muted/10 p-3"
    >
      <div className="font-mono text-xs text-muted-foreground leading-5 space-y-1">
        <motion.div initial={{ width: 0 }} animate={{ width: "100%" }} transition={{ duration: 0.6, delay: 0.1 }} className="overflow-hidden whitespace-nowrap">
          <span className="text-violet-400">You are AVA,</span> a professional AI
        </motion.div>
        <motion.div initial={{ width: 0 }} animate={{ width: "100%" }} transition={{ duration: 0.5, delay: 0.4 }} className="overflow-hidden whitespace-nowrap">
          assistant specialized in customer
        </motion.div>
        <motion.div initial={{ width: 0 }} animate={{ width: "100%" }} transition={{ duration: 0.4, delay: 0.7 }} className="overflow-hidden whitespace-nowrap">
          support. Always be <span className="text-violet-400">helpful</span> and concise.
        </motion.div>
      </div>
    </motion.div>
    <div className="grid grid-cols-2 gap-2">
      {[["📋 FAQ Template", "violet"], ["💼 Sales Script", ""], ["🎯 Lead Qualifier", ""], ["🔧 Tech Support", ""]].map(([name, hl], i) => (
        <motion.div
          key={name}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 + i * 0.06 }}
          className={`text-xs rounded-lg border px-2.5 py-2 cursor-pointer transition-colors ${hl ? "border-violet-400/40 text-violet-400 bg-violet-400/5" : "border-border/40 text-muted-foreground hover:border-border"}`}
        >
          {name}
        </motion.div>
      ))}
    </div>
  </div>
);

const VoiceStep = () => {
  const [playing, setPlaying] = useState(false);
  const bars = [40, 65, 30, 80, 55, 70, 45, 90, 35, 60];
  return (
    <div className="space-y-2.5">
      <div className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Voice Selection</div>
      {[
        { name: "Rachel", lang: "EN · Female", tag: "Natural" },
        { name: "Antoni", lang: "EN · Male",   tag: "Professional" },
      ].map((v, i) => (
        <motion.div
          key={v.name}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.09 }}
          className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${i === 0 ? "border-pink-400/40 bg-pink-400/5" : "border-border/40 bg-muted/10"}`}
        >
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${i === 0 ? "bg-pink-400/20 text-pink-400" : "bg-muted/50 text-muted-foreground"}`}>
            {v.name[0]}
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium">{v.name}</div>
            <div className="text-[10px] text-muted-foreground">{v.lang}</div>
          </div>
          <span className="text-[10px] border border-border/40 rounded-full px-2 py-0.5 text-muted-foreground">{v.tag}</span>
          {i === 0 && <Volume2 className="w-3.5 h-3.5 text-pink-400" />}
        </motion.div>
      ))}
      {/* Waveform */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="rounded-xl border border-pink-400/20 bg-pink-400/5 p-3"
      >
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => setPlaying(p => !p)}
            className="w-6 h-6 rounded-full bg-pink-400/20 flex items-center justify-center"
          >
            {playing ? <Pause className="w-3 h-3 text-pink-400" /> : <Play className="w-3 h-3 text-pink-400" />}
          </button>
          <span className="text-xs text-muted-foreground">Preview voice sample</span>
        </div>
        <div className="flex items-center gap-0.5 h-8">
          {bars.map((h, i) => (
            <motion.div
              key={i}
              className="flex-1 rounded-full bg-pink-400/50"
              animate={{ scaleY: playing ? [1, h / 50, 1] : 0.2 }}
              transition={{ duration: 0.4, repeat: playing ? Infinity : 0, delay: i * 0.04, repeatType: "reverse" }}
              style={{ height: "100%", transformOrigin: "bottom" }}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
};

const ConfigStep = () => (
  <div className="space-y-2.5">
    <div className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Configuration</div>
    {[
      { label: "Language", value: "French + English", icon: Globe },
      { label: "Safety Filter", value: "High", icon: Settings2 },
      { label: "Response Style", value: "Professional", icon: Wand2 },
    ].map((c, i) => {
      const Icon = c.icon;
      return (
        <motion.div
          key={c.label}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.09 }}
          className="flex items-center gap-3 rounded-xl border border-border/40 bg-muted/10 px-3 py-2.5"
        >
          <div className="w-7 h-7 rounded-lg bg-amber-400/10 flex items-center justify-center">
            <Icon className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="flex-1">
            <div className="text-[10px] text-muted-foreground">{c.label}</div>
            <div className="text-sm font-medium">{c.value}</div>
          </div>
          <CheckCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
        </motion.div>
      );
    })}
    <div className="grid grid-cols-3 gap-1.5 mt-1">
      {["Concise", "Empathetic", "Bilingual"].map((tag, i) => (
        <motion.div
          key={tag}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 + i * 0.07 }}
          className="text-[10px] text-amber-500 border border-amber-400/25 bg-amber-400/8 rounded-full px-2 py-1 text-center font-medium"
        >
          {tag}
        </motion.div>
      ))}
    </div>
  </div>
);

const DeployStep = () => {
  const logs = [
    "✓ Connecting to ElevenLabs...",
    "✓ Agent configuration synced",
    "✓ Voice model deployed",
    "✓ Phone number assigned",
    "🚀 Agent is LIVE!",
  ];
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Deployment</div>
      <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-3 font-mono space-y-1.5">
        {logs.map((log, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.25 }}
            className={`text-xs ${i === logs.length - 1 ? "text-emerald-400 font-bold" : "text-muted-foreground"}`}
          >
            {log}
          </motion.div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2">
        {[
          { label: "Calls", value: "Ready", icon: Phone },
          { label: "Status", value: "Live", icon: Activity },
          { label: "Uptime", value: "99.9%", icon: CheckCircle },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.2 + i * 0.1 }}
              className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-2.5 text-center"
            >
              <Icon className="w-3.5 h-3.5 text-emerald-400 mx-auto mb-1" />
              <div className="text-[10px] text-muted-foreground">{s.label}</div>
              <div className="text-xs font-bold text-emerald-400">{s.value}</div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

const previews = [PlatformStep, PromptStep, VoiceStep, ConfigStep, DeployStep];

/* ──────────────────────────────────────────────────────── */
/*  Animated arc flow diagram                               */
/* ──────────────────────────────────────────────────────── */
const NODES = steps.map((_, i) => {
  const cx = 220, cy = 155, rx = 150, ry = 100;
  const t = (i / (steps.length - 1)) * Math.PI;
  return { x: cx - rx * Math.cos(t), y: cy - ry * Math.sin(t) + ry * 0.15 };
});

const FlowDiagram = ({
  activeStep,
  onNodeClick,
}: { activeStep: number; onNodeClick: (i: number) => void }) => {
  return (
    <svg viewBox="0 0 440 270" className="w-full h-full overflow-visible">
      <defs>
        <radialGradient id="bgGrad2" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.04" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </radialGradient>
        {steps.map((s, i) => (
          <filter key={i} id={`glow-${i}`}>
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        ))}
      </defs>

      <rect width="440" height="270" fill="url(#bgGrad2)" rx="12" />

      {/* Center hub pulse */}
      <motion.circle cx="220" cy="135" r="38"
        fill="hsl(var(--primary))" fillOpacity="0.06"
        stroke="hsl(var(--primary))" strokeWidth="1" strokeOpacity="0.2"
        animate={{ scale: [1, 1.16, 1] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
      <circle cx="220" cy="135" r="26" fill="hsl(var(--primary))" fillOpacity="0.1" />
      <text x="220" y="131" textAnchor="middle" fill="hsl(var(--primary))" fontSize="9" fontWeight="700">AVA</text>
      <text x="220" y="144" textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="7">Platform</text>

      {/* Arcs between consecutive nodes */}
      {steps.slice(0, -1).map((s, i) => {
        const p1 = NODES[i], p2 = NODES[i + 1];
        const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2 - 18;
        const done = i < activeStep;
        return (
          <motion.path
            key={`arc-${i}`}
            d={`M ${p1.x} ${p1.y} Q ${mx} ${my} ${p2.x} ${p2.y}`}
            fill="none"
            stroke={done ? s.nodeColor : "hsl(var(--border))"}
            strokeWidth={done ? 2.5 : 1}
            strokeDasharray={done ? "none" : "4 5"}
            opacity={done ? 0.8 : 0.3}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: i * 0.1 + 0.2, duration: 0.6 }}
          />
        );
      })}

      {/* Lines from each node to center */}
      {NODES.map((n, i) => {
        const connected = i <= activeStep;
        return (
          <motion.line
            key={`hub-${i}`}
            x1={n.x} y1={n.y} x2={220} y2={135}
            stroke={connected ? steps[i].nodeColor : "hsl(var(--border))"}
            strokeWidth={connected ? 1.5 : 0.8}
            strokeDasharray="3 6"
            opacity={connected ? 0.45 : 0.15}
            initial={{ opacity: 0 }}
            animate={{ opacity: connected ? 0.45 : 0.15 }}
            transition={{ duration: 0.4, delay: i * 0.1 }}
          />
        );
      })}

      {/* Moving dot along active arc */}
      {activeStep > 0 && (
        <motion.circle
          r="4"
          fill={steps[activeStep].nodeColor}
          opacity={0.9}
          filter={`url(#glow-${activeStep})`}
        >
          <animateMotion
            dur="1.6s"
            repeatCount="indefinite"
            path={(() => {
              const i = activeStep - 1;
              const p1 = NODES[i], p2 = NODES[i + 1];
              const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2 - 18;
              return `M ${p1.x} ${p1.y} Q ${mx} ${my} ${p2.x} ${p2.y}`;
            })()}
          />
        </motion.circle>
      )}

      {/* Step nodes */}
      {steps.map((s, i) => {
        const { x, y } = NODES[i];
        const isActive = i === activeStep;
        const isDone = i < activeStep;
        const Icon = s.icon;
        return (
          <motion.g key={s.key} onClick={() => onNodeClick(i)} style={{ cursor: "pointer" }}>
            {/* Pulse ring */}
            {isActive && (
              <motion.circle cx={x} cy={y} r={22} fill="none"
                stroke={s.nodeColor} strokeWidth="1.5"
                animate={{ scale: [1, 1.36, 1], opacity: [0.6, 0, 0.6] }}
                transition={{ duration: 1.8, repeat: Infinity }}
              />
            )}
            {/* Shadow ring */}
            {(isDone || isActive) && (
              <circle cx={x} cy={y} r={22} fill={s.nodeColor} opacity={0.15} />
            )}
            {/* Main circle */}
            <motion.circle
              cx={x} cy={y}
              r={isActive ? 19 : 16}
              fill={isActive || isDone ? s.nodeColor : "hsl(var(--muted))"}
              opacity={isActive || isDone ? 1 : 0.45}
              animate={{ scale: isActive ? 1.12 : 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            />
            {/* Icon/check */}
            {isDone ? (
              <text x={x} y={y + 4.5} textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">✓</text>
            ) : (
              <text x={x} y={y + 4.5} textAnchor="middle"
                fill={isActive ? "white" : "hsl(var(--muted-foreground))"}
                fontSize="10" fontWeight="bold"
              >
                {i + 1}
              </text>
            )}
            {/* Label */}
            <text
              x={x} y={y + (y < 80 ? -28 : 34)}
              textAnchor="middle"
              fill={isActive ? s.nodeColor : "hsl(var(--muted-foreground))"}
              fontSize="8.5"
              fontWeight={isActive ? "700" : "400"}
            >
              {["ElevenLabs · Vapi", "GPT-4 · Templates", "120+ Voices", "Safety · Style", "Live in seconds"][i]}
            </text>
          </motion.g>
        );
      })}
    </svg>
  );
};

/* ──────────────────────────────────────────────────────── */
/*  Main section                                            */
/* ──────────────────────────────────────────────────────── */
export const AgentCreationSection = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [activeStep, setActiveStep] = useState(0);
  const [paused, setPaused] = useState(false);

  /* Auto-advance every 3 s */
  const advance = useCallback(() => {
    setActiveStep(s => (s + 1) % steps.length);
  }, []);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(advance, 3000);
    return () => clearInterval(id);
  }, [paused, advance]);

  const Preview = previews[activeStep];
  const activeData = steps[activeStep];

  const benefits = [
    { icon: Zap, textKey: "landing.agentCreation.benefit1" },
    { icon: Globe, textKey: "landing.agentCreation.benefit2" },
    { icon: RefreshCw, textKey: "landing.agentCreation.benefit3" },
  ];

  return (
    <section className="py-28 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-secondary/5 to-background" />
      <div className="absolute top-10 right-[-120px] w-[420px] h-[420px] bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-10 left-[-160px] w-[520px] h-[520px] bg-secondary/10 rounded-full blur-3xl" />

      <div className="container mx-auto px-6 relative z-10">
        <div className="grid lg:grid-cols-2 gap-16 items-start">

          {/* ── LEFT: text + interactive steps ── */}
          <motion.div
            initial={{ opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <Badge variant="secondary" className="gap-2 mb-5">
              <Sparkles className="w-3.5 h-3.5" />
              {t("landing.agentCreation.badge")}
            </Badge>

            <h2 className="text-4xl md:text-5xl font-extrabold leading-tight mb-4">
              {t("landing.agentCreation.title")}
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              {t("landing.agentCreation.subtitle")}
            </p>

            {/* Clickable steps list */}
            <div className="space-y-2 mb-8">
              {steps.map((s, idx) => {
                const Icon = s.icon;
                const isActive = activeStep === idx;
                const isDone = idx < activeStep;
                return (
                  <motion.button
                    key={s.key}
                    onClick={() => { setActiveStep(idx); setPaused(true); }}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all duration-200 ${
                      isActive
                        ? "border-primary/40 bg-primary/5 shadow-sm"
                        : isDone
                        ? "border-border bg-muted/20"
                        : "border-transparent hover:bg-muted/30"
                    }`}
                    whileHover={{ x: 4 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${s.color} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                      {isDone ? <Check className="w-4 h-4 text-white" /> : <Icon className="w-4 h-4 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${isActive ? "text-primary" : "text-foreground"}`}>
                          {t(`landing.agentCreation.${s.key}.title`)}
                        </span>
                        <span className="text-xs text-muted-foreground opacity-60">
                          {t("landing.agentCreation.step").replace("{{n}}", String(idx + 1))}
                        </span>
                      </div>
                      <AnimatePresence>
                        {isActive && (
                          <motion.p
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="text-xs text-muted-foreground mt-0.5 overflow-hidden"
                          >
                            {t(`landing.agentCreation.${s.key}.description`)}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>
                    {/* Progress indicator */}
                    {!isDone && isActive && (
                      <motion.div
                        className="w-5 h-5 rounded-full border-2 border-primary/40 relative flex-shrink-0"
                        style={{ borderTopColor: "hsl(var(--primary))" }}
                        animate={paused ? {} : { rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      />
                    )}
                    {isDone && <Check className="w-4 h-4 text-primary/60 flex-shrink-0" />}
                    {!isDone && !isActive && (
                      <ChevronRight className="w-4 h-4 text-muted-foreground/30 flex-shrink-0" />
                    )}
                  </motion.button>
                );
              })}
            </div>

            {/* Benefit pills */}
            <div className="flex flex-wrap gap-2 mb-8">
              {benefits.map((b, i) => {
                const BIcon = b.icon;
                return (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 border border-border rounded-full px-3 py-1.5">
                    <BIcon className="w-3 h-3 text-primary" />
                    {t(b.textKey)}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button size="lg" onClick={() => navigate("/demo-request")} className="h-12 gap-2">
                {t("landing.agentCreation.ctaDemo")}
                <ArrowRight className="w-4 h-4" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate("/login")} className="h-12">
                {t("landing.agentCreation.ctaStart")}
              </Button>
            </div>
          </motion.div>

          {/* ── RIGHT: animated card with diagram + dashboard panel ── */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="relative"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
          >
            <div className="absolute -inset-4 bg-gradient-to-br from-primary/10 via-transparent to-secondary/10 rounded-3xl blur-2xl" />

            <div className="relative rounded-3xl border border-border/60 bg-card/70 backdrop-blur-xl shadow-2xl overflow-hidden">

              {/* ── Active step header ── */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={`hdr-${activeStep}`}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.25 }}
                  className={`flex items-center gap-3 px-5 py-3.5 bg-gradient-to-r ${activeData.color}`}
                >
                  <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                    <activeData.icon className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div>
                    <p className="text-white text-xs font-bold leading-none">
                      {t("landing.agentCreation.step").replace("{{n}}", String(activeStep + 1))} — {t(`landing.agentCreation.${activeData.key}.title`)}
                    </p>
                    <p className="text-white/70 text-[10px] mt-0.5">
                      {["ElevenLabs · Vapi · Retell", "GPT-4 · Templates", "120+ voices · Preview", "Safety · Language · Style", "Push → Live in seconds"][activeStep]}
                    </p>
                  </div>
                  <div className="ml-auto flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-white/70 animate-pulse" />
                    <span className="text-white/70 text-xs">Live</span>
                  </div>
                </motion.div>
              </AnimatePresence>

              <div className="p-5 space-y-5">

                {/* ── Top: SVG flow diagram ── */}
                <div style={{ aspectRatio: "440/270" }}>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`diag-${activeStep}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="w-full h-full"
                    >
                      <FlowDiagram activeStep={activeStep} onNodeClick={(i) => { setActiveStep(i); setPaused(true); }} />
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Divider */}
                <div className="border-t border-border/40" />

                {/* ── Bottom: rich dashboard preview panel ── */}
                <div className="min-h-[200px]">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`preview-${activeStep}`}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.28, ease: "easeOut" }}
                    >
                      <Preview />
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* ── Progress bar ── */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{t("landing.agentCreation.progress")}</span>
                      <button
                        onClick={() => setPaused(p => !p)}
                        className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                      >
                        {paused
                          ? <Play className="w-3 h-3" />
                          : <Pause className="w-3 h-3" />
                        }
                      </button>
                    </div>
                    <span className="text-xs font-semibold text-primary">
                      {Math.round(((activeStep + 1) / steps.length) * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full rounded-full bg-gradient-to-r ${activeData.color}`}
                      animate={{ width: `${((activeStep + 1) / steps.length) * 100}%` }}
                      transition={{ duration: 0.4 }}
                    />
                  </div>
                </div>

                {/* ── Step nav ── */}
                <div className="flex justify-between items-center">
                  <Button size="sm" variant="ghost" disabled={activeStep === 0}
                    onClick={() => { setActiveStep(s => s - 1); setPaused(true); }}
                    className="text-xs h-8"
                  >
                    ← {t("landing.agentCreation.prev")}
                  </Button>
                  <div className="flex gap-1.5 items-center">
                    {steps.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => { setActiveStep(i); setPaused(true); }}
                        className={`h-1.5 rounded-full transition-all duration-300 ${
                          i === activeStep ? "w-5 bg-primary"
                          : i < activeStep ? "w-2 bg-primary/50"
                          : "w-2 bg-muted"
                        }`}
                      />
                    ))}
                  </div>
                  <Button size="sm" variant="ghost" disabled={activeStep === steps.length - 1}
                    onClick={() => { setActiveStep(s => s + 1); setPaused(true); }}
                    className="text-xs h-8"
                  >
                    {t("landing.agentCreation.next")} →
                  </Button>
                </div>

                {/* Platform badges */}
                <div className="flex gap-2 justify-center pt-1">
                  {["ElevenLabs", "Vapi", "Retell"].map((p, i) => (
                    <motion.div
                      key={p}
                      animate={{ y: [0, -4, 0] }}
                      transition={{ duration: 2, repeat: Infinity, delay: i * 0.5 }}
                    >
                      <Badge variant="outline" className="bg-background/60 backdrop-blur-sm text-xs">
                        {p}
                      </Badge>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
