import { motion } from 'framer-motion';
import { useTranslation } from '@/hooks/useTranslation';

/* ── Inline SVG brand logos ─────────────────────────────────────── */

const ElevenLabsLogo = () => (
  <svg viewBox="0 0 32 32" fill="currentColor" className="w-full h-full">
    <rect x="6"  y="4" width="7" height="24" rx="2" />
    <rect x="19" y="4" width="7" height="24" rx="2" />
  </svg>
);

const VapiLogo = () => (
  <svg viewBox="0 0 32 32" fill="none" className="w-full h-full">
    <path d="M16 4L30 28H2L16 4Z" fill="currentColor" />
    <path d="M16 11L25 27H7L16 11Z" fill="white" fillOpacity="0.2" />
  </svg>
);

const RetellLogo = () => (
  <svg viewBox="0 0 32 32" fill="none" className="w-full h-full">
    <circle cx="16" cy="16" r="11" stroke="currentColor" strokeWidth="2.5" />
    <path d="M10 16C10 12.7 12.7 10 16 10V22C12.7 22 10 19.3 10 16Z" fill="currentColor" />
    <circle cx="16" cy="16" r="3" fill="currentColor" />
  </svg>
);

const OpenAILogo = () => (
  <svg viewBox="0 0 32 32" fill="currentColor" className="w-full h-full">
    <path d="M27.3 13c.6-1.8.4-3.8-.6-5.4C25.2 5.2 22.8 4 20.4 4.5 19.2 3 17.4 2 15.5 2c-2.8 0-5.3 1.8-6.1 4.5C7.6 7 6 8.3 5.3 10c-1 2.4-.4 5.2 1.3 7C6 18.8 6.2 20.8 7.2 22.4c1.5 2.4 4.3 3.6 7 3.1 1.1 1.5 2.9 2.5 4.8 2.5 2.8 0 5.3-1.8 6.1-4.5 1.9-.5 3.5-1.8 4.2-3.5 1-2.4.4-5.2-1-7zM20.4 25.5c-1 0-2-.4-2.8-1l.1-.1 4.8-2.8c.3-.2.4-.4.4-.7V14l2 1.1v6.8c0 1.8-1.4 3.3-3.2 3.3l-.3.3zM7 21.5c-.5-1-.7-2-.5-3.1l.1.1 4.8 2.8c.3.2.6.2.8 0l5.9-3.4v2.3l-4.9 2.8c-1.6.9-3.6.4-4.9-1.5l-.3.3-.1-.3zM5.9 11.1c.5-1 1.3-1.7 2.3-2.1v5.7c0 .3.1.5.4.7l5.9 3.4-2 1.2-5-2.9c-1.6-1-2.2-3-1.6-4.8v-1zm19.9 4.6l-4.8-2.8c-.3-.2-.6-.2-.8 0l-5.9 3.4V14l4.9-2.8c1.6-.9 3.6-.4 4.9 1.5.6.9.8 2 .6 3.1l.1-.1zm-1.9 4.1l-2-1.1-5.9-3.4.1-.1-.1.1v-3.4l2-1.1v6.8l-2-1.1v-4.6l2 1.1v4.6l3.9-2.3 2 1.1-.1-.1.1.1V20l-2 1.1.1-.1-.1.1zm-8.5-2.3l-2-1.1v-6.8l3.9 2.3V14l-2-1.1V19.5z" />
  </svg>
);

const TwilioLogo = () => (
  <svg viewBox="0 0 32 32" fill="currentColor" className="w-full h-full">
    <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="2.2" />
    <circle cx="11" cy="11" r="2.4" />
    <circle cx="21" cy="11" r="2.4" />
    <circle cx="11" cy="21" r="2.4" />
    <circle cx="21" cy="21" r="2.4" />
  </svg>
);

const GoogleLogo = () => (
  <svg viewBox="0 0 32 32" className="w-full h-full">
    <path fill="#4285F4" d="M29 16.4c0-1-.1-2-.3-2.9H16v5.2h7.3c-.4 1.8-1.4 3.3-2.9 4.3v3.5h4.6C27.6 24 29 20.5 29 16.4z" />
    <path fill="#34A853" d="M16 30c3.6 0 6.6-1.2 8.9-3.2l-4.6-3.5c-1.2.8-2.8 1.3-4.5 1.3-3.5 0-6.4-2.3-7.5-5.5H3.7v3.7C6 27.4 10.7 30 16 30z" />
    <path fill="#FBBC05" d="M8.5 19.1c-.3-.8-.4-1.7-.4-2.6 0-.9.2-1.8.4-2.6V10.2H3.7C2.6 12.2 2 14.5 2 16.5c0 2 .6 3.8 1.7 5.3l4.8-2.7z" />
    <path fill="#EA4335" d="M16 8c2 0 3.7.7 5.1 2l3.8-3.8C22.6 4 19.6 2.5 16 2.5 10.7 2.5 6 5.1 3.7 9.3l4.8 2.7C9.6 9.3 12.5 8 16 8z" />
  </svg>
);

/* ── Brand config ────────────────────────────────────────────────── */

const logos = [
  {
    name: 'ElevenLabs',
    Logo: ElevenLabsLogo,
    bg: '#000000',
    color: '#ffffff',
    glow: 'rgba(255,255,255,0.15)',
  },
  {
    name: 'Vapi',
    Logo: VapiLogo,
    bg: '#1a0a3e',
    color: '#a78bfa',
    glow: 'rgba(167,139,250,0.25)',
  },
  {
    name: 'Retell AI',
    Logo: RetellLogo,
    bg: '#0a1628',
    color: '#60a5fa',
    glow: 'rgba(96,165,250,0.25)',
  },
  {
    name: 'OpenAI',
    Logo: OpenAILogo,
    bg: '#10a37f',
    color: '#ffffff',
    glow: 'rgba(16,163,127,0.3)',
  },
  {
    name: 'Twilio',
    Logo: TwilioLogo,
    bg: '#f22f46',
    color: '#ffffff',
    glow: 'rgba(242,47,70,0.3)',
  },
  {
    name: 'Google',
    Logo: GoogleLogo,
    bg: '#ffffff',
    color: '#4285F4',
    glow: 'rgba(66,133,244,0.2)',
  },
];

/* ── Single logo pill ────────────────────────────────────────────── */

const LogoPill = ({ logo }: { logo: typeof logos[number] }) => {
  const { Logo } = logo;
  return (
    <motion.div
      whileHover={{ scale: 1.06, y: -2 }}
      transition={{ type: 'spring', stiffness: 320, damping: 20 }}
      className="flex items-center gap-3 min-w-fit px-4 py-2.5 rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm shadow-sm cursor-default select-none"
      style={{
        boxShadow: `0 0 0 1px hsl(var(--border) / 0.5), 0 4px 20px -4px ${logo.glow}`,
      }}
    >
      {/* Logo icon */}
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center p-1.5 flex-shrink-0 shadow-md"
        style={{ backgroundColor: logo.bg, color: logo.color }}
      >
        <Logo />
      </div>

      {/* Name */}
      <span className="text-sm font-semibold text-foreground/80 whitespace-nowrap">
        {logo.name}
      </span>
    </motion.div>
  );
};

/* ── Section ─────────────────────────────────────────────────────── */

export const TrustedBySection = () => {
  const { t } = useTranslation();

  // Double the array so the marquee loops seamlessly
  const row1 = [...logos, ...logos];
  const row2 = [...logos.slice(3), ...logos.slice(0, 3), ...logos.slice(3), ...logos.slice(0, 3)];

  return (
    <section className="py-14 relative overflow-hidden border-y border-border/30">
      {/* Subtle background */}
      <div className="absolute inset-0 bg-gradient-to-b from-muted/20 via-muted/40 to-muted/20" />

      <div className="relative z-10">
        {/* Label */}
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center text-xs font-semibold text-muted-foreground tracking-[0.2em] uppercase mb-8"
        >
          {t('trustedBy.title')}
        </motion.p>

        {/* Row 1 — left to right */}
        <div className="relative overflow-hidden mb-4">
          <div className="flex gap-4 animate-marquee will-change-transform">
            {row1.map((logo, i) => (
              <LogoPill key={`r1-${i}`} logo={logo} />
            ))}
          </div>
        </div>

        {/* Row 2 — right to left (reverse) */}
        <div className="relative overflow-hidden">
          <div className="flex gap-4 animate-marquee-reverse will-change-transform">
            {row2.map((logo, i) => (
              <LogoPill key={`r2-${i}`} logo={logo} />
            ))}
          </div>
        </div>
      </div>

      {/* Left/right gradient fade */}
      <div className="absolute inset-y-0 left-0 w-40 bg-gradient-to-r from-background to-transparent pointer-events-none z-20" />
      <div className="absolute inset-y-0 right-0 w-40 bg-gradient-to-l from-background to-transparent pointer-events-none z-20" />
    </section>
  );
};
