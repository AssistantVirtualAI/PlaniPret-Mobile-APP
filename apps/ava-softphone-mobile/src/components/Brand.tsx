import React from 'react';
import { colors, gradients } from '../lib/theme';

/** AVA mark — uses the official AVA logo asset. */
export function LemtelMark({ size = 32 }: { size?: number }) {
  return (
    <img
      src="/ava-logo.png"
      alt="AVA"
      width={size}
      height={size}
      style={{
        width: size, height: size, display: 'block',
        borderRadius: size * 0.22,
        boxShadow: `0 8px 22px -10px ${colors.lemtelBlue}`,
      }}
    />
  );
}

/** AVA powered-by chip — features the AVA Statistics logo. */
export function AvaBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: compact ? '2px 8px' : '3px 10px',
      borderRadius: 999,
      background: 'linear-gradient(110deg, rgba(122,76,255,0.16), rgba(35,214,255,0.22), rgba(122,76,255,0.16))',
      border: `1px solid ${colors.borderAI}`,
      color: colors.avaCyan, fontSize: compact ? 9 : 9.5, fontWeight: 800,
      letterSpacing: 1.4, textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>
      Powered by
      <img
        src="/ava-statistics-logo.png"
        alt="AVA Statistics"
        style={{
          height: compact ? 14 : 16,
          width: 'auto',
          display: 'inline-block',
          verticalAlign: 'middle',
        }}
      />
    </span>
  );
}

/** Hero gradient banner used on Home + dashboards. */
export function HeroGradient({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      padding: '20px 18px 22px',
      borderRadius: 22,
      background: gradients.hero,
      border: `1px solid ${colors.border}`,
      ...style,
    }}>
      <div aria-hidden style={{
        position: 'absolute', top: -80, right: -60, width: 220, height: 220,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${colors.signalGold}22 0%, transparent 65%)`,
        pointerEvents: 'none',
      }} />
      <div aria-hidden style={{
        position: 'absolute', bottom: -120, left: -40, width: 260, height: 260,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${colors.avaViolet}28 0%, transparent 65%)`,
        pointerEvents: 'none',
      }} />
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  );
}
