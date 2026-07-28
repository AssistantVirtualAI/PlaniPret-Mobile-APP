import React from 'react';
import { colors, gradients, radius, font, shadow } from '../../lib/theme';

/* ─── Card ───────────────────────────────────────────────────── */
export function Card({
  children, style, accent, padded = true, onPress,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  accent?: 'gold' | 'cyan' | 'violet' | 'blue';
  padded?: boolean;
  onPress?: () => void;
}) {
  const accentColor =
    accent === 'gold'   ? colors.signalGold :
    accent === 'cyan'   ? colors.avaCyan :
    accent === 'violet' ? colors.avaViolet :
    accent === 'blue'   ? colors.blueGlow : null;

  return (
    <div onClick={onPress} className="lemtel-card" style={{
      position: 'relative',
      background: gradients.card,
      border: `1px solid ${accentColor ? accentColor + '44' : colors.border}`,
      borderRadius: radius.xl,
      padding: padded ? 16 : 0,
      boxShadow: shadow.glass,
      overflow: 'hidden',
      cursor: onPress ? 'pointer' : 'default',
      ...style,
    }}>
      {accentColor && (
        <span aria-hidden style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, ${accentColor}, ${colors.lemtelBlue} 70%, transparent)`,
          opacity: 0.85,
        }} />
      )}
      {children}
    </div>
  );
}

/* ─── Chip ───────────────────────────────────────────────────── */
export function Chip({
  children, tone = 'neutral', size = 'sm',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'gold' | 'cyan' | 'violet' | 'success' | 'danger' | 'warning';
  size?: 'xs' | 'sm';
}) {
  const map: Record<string, string> = {
    neutral: colors.mutedSilver,
    gold:    colors.signalGold,
    cyan:    colors.avaCyan,
    violet:  colors.avaViolet,
    success: colors.success,
    danger:  colors.danger,
    warning: colors.warning,
  };
  const c = map[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      minHeight: size === 'xs' ? 20 : 24,
      padding: size === 'xs' ? '2px 7px' : '3px 10px',
      borderRadius: radius.pill,
      background: c + '14',
      border: `1px solid ${c}44`,
      color: c,
      fontSize: size === 'xs' ? 9.5 : 10.5,
      fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

/* ─── StatusDot ─────────────────────────────────────────────── */
export function StatusDot({ state }: { state: 'registered' | 'connecting' | 'retrying' | 'offline' }) {
  const c =
    state === 'registered' ? colors.success :
    state === 'retrying'   ? colors.warning :
    state === 'connecting' ? colors.warning :
                             colors.danger;
  const label =
    state === 'registered' ? 'Live' :
    state === 'retrying'   ? 'Retrying…' :
    state;
  return (
    <span data-status={state} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontSize: font.xs, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase',
      color: c,
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: c, boxShadow: `0 0 10px ${c}`,
      }} />
      {label}
    </span>
  );
}

/* ─── Section header ────────────────────────────────────────── */
export function SectionTitle({
  eyebrow, title, right,
}: { eyebrow?: string; title: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', margin: '20px 0 10px', padding: '0 4px' }}>
      <div>
        {eyebrow && <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1.8, color: colors.signalGold, textTransform: 'uppercase' }}>{eyebrow}</div>}
        <h2 style={{ fontSize: font.lg, color: colors.textIce, margin: '2px 0 0', fontWeight: 700, letterSpacing: -0.3 }}>{title}</h2>
      </div>
      {right}
    </div>
  );
}

/* ─── Primary button (Lemtel blue → gold) ───────────────────── */
export function PrimaryButton({
  children, onClick, disabled, style,
}: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; style?: React.CSSProperties }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseDown={(e) => !disabled && ((e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.97)')}
      onMouseUp={(e) => ((e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)')}
      onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)')}
      style={{
        position: 'relative',
        minHeight: 48,
        padding: '13px 22px',
        borderRadius: radius.xl,
        border: '1px solid rgba(255,255,255,0.25)',
        background: disabled
          ? 'rgba(255,255,255,0.06)'
          : `linear-gradient(135deg, ${colors.lemtelBlue} 0%, #2247ff 55%, ${colors.avaCyan} 130%)`,
        color: disabled ? colors.mutedSilver : '#fff',
        fontSize: font.base,
        fontWeight: 700,
        letterSpacing: 0.3,
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: disabled
          ? 'none'
          : '0 18px 40px -18px rgba(7,22,168,0.75), 0 1px 0 rgba(255,255,255,0.4) inset, 0 -2px 8px rgba(0,0,0,0.15) inset',
        transition: 'transform .15s ease, box-shadow .2s ease, filter .2s ease',
        overflow: 'hidden',
        ...style,
      }}
    >
      {!disabled && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.35) 50%, transparent 70%)',
            transform: 'translateX(-100%)',
            animation: 'ava-shimmer 2.6s ease-in-out infinite',
            pointerEvents: 'none',
          }}
        />
      )}
      <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        {children}
      </span>
      <style>{`@keyframes ava-shimmer { 0%{transform:translateX(-100%)} 60%,100%{transform:translateX(100%)} }`}</style>
    </button>
  );
}

/* ─── Ghost button ──────────────────────────────────────────── */
export function GhostButton({
  children, onClick, tone = 'neutral', style,
}: { children: React.ReactNode; onClick?: () => void; tone?: 'neutral' | 'cyan' | 'violet' | 'gold'; style?: React.CSSProperties }) {
  const c = tone === 'cyan' ? colors.avaCyan : tone === 'violet' ? colors.avaViolet : tone === 'gold' ? colors.signalGold : colors.lemtelBlue;
  return (
    <button
      onClick={onClick}
      onMouseDown={(e) => ((e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.97)')}
      onMouseUp={(e) => ((e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)')}
      onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)')}
      style={{
        minHeight: 44,
        padding: '11px 16px',
        borderRadius: radius.xl,
        background: `linear-gradient(180deg, rgba(255,255,255,0.95) 0%, ${c}10 100%)`,
        border: `1px solid ${c}40`,
        color: c,
        fontSize: font.sm,
        fontWeight: 700,
        letterSpacing: 0.2,
        cursor: 'pointer',
        boxShadow: `0 6px 16px -8px ${c}55, 0 1px 0 rgba(255,255,255,0.8) inset`,
        transition: 'transform .15s ease, box-shadow .2s ease, background .2s ease',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        justifyContent: 'center',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/* ─── AVA insight panel ─────────────────────────────────────── */
export function AIPanel({
  title = 'AVA Insight', children, accent = colors.avaViolet, right,
}: { title?: string; children: React.ReactNode; accent?: string; right?: React.ReactNode }) {
  return (
    <Card padded={false} style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 20, height: 20, borderRadius: 6,
            background: gradients.ai, display: 'grid', placeItems: 'center',
            color: '#fff', fontSize: 9, fontWeight: 800, letterSpacing: 0.4,
          }}>AI</span>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.4, color: accent, textTransform: 'uppercase' }}>{title}</span>
        </div>
        {right}
      </div>
      <div style={{ padding: '4px 14px 14px' }}>{children}</div>
    </Card>
  );
}

/* ─── Settings row ──────────────────────────────────────────── */
export function SettingsRow({
  label, value, icon, onPress, right,
}: { label: string; value?: string; icon?: React.ReactNode; onPress?: () => void; right?: React.ReactNode }) {
  return (
    <button onClick={onPress} style={{
      display: 'flex', alignItems: 'center', gap: 12,
      width: '100%', minHeight: 54, padding: '14px 14px',
      background: 'transparent', border: 'none',
      borderBottom: `1px solid ${colors.border}`,
      color: colors.textIce, cursor: onPress ? 'pointer' : 'default',
      textAlign: 'left',
    }}>
      {icon && <span style={{ fontSize: 18, width: 24, color: colors.avaCyan }}>{icon}</span>}
      <span style={{ flex: 1, fontSize: font.base, fontWeight: 500 }}>{label}</span>
      {value && <span style={{ fontSize: font.sm, color: colors.mutedSilver }}>{value}</span>}
      {right}
      {onPress && <span style={{ color: colors.mutedSilver, fontSize: 16 }}>›</span>}
    </button>
  );
}

/* ─── Empty state ───────────────────────────────────────────── */
export function EmptyState({
  icon = '✦', title, hint, accent = colors.avaCyan, cta,
}: { icon?: React.ReactNode; title: string; hint: string; accent?: string; cta?: { label: string; onPress: () => void } }) {
  return (
    <div style={{
      position: 'relative', margin: '20px 16px',
      padding: '32px 22px', textAlign: 'center',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
      borderRadius: radius.xl,
      background: `radial-gradient(circle at 50% 0%, ${accent}1c, transparent 70%), ${colors.graphite}`,
      border: `1px solid ${accent}44`,
      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), 0 12px 32px -20px ${accent}55`,
      overflow: 'hidden',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16, display: 'grid', placeItems: 'center',
        background: `linear-gradient(135deg, ${accent}33, ${colors.lemtelBlue}1c)`,
        border: `1px solid ${accent}66`,
        color: accent, fontSize: 24,
      }}>{icon}</div>
      <div style={{ fontSize: font.md, fontWeight: 700, color: colors.textIce }}>{title}</div>
      <div style={{ fontSize: font.sm, color: colors.mutedSilver, maxWidth: 280, lineHeight: 1.5 }}>{hint}</div>
      {cta && <PrimaryButton onClick={cta.onPress} style={{ marginTop: 6 }}>{cta.label}</PrimaryButton>}
    </div>
  );
}

/* ─── Waveform placeholder ──────────────────────────────────── */
export function Waveform({ progress = 0, color = colors.signalGold }: { progress?: number; color?: string }) {
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center', height: 36 }}>
      {Array.from({ length: 56 }).map((_, i) => {
        const active = (i / 56) <= progress;
        return (
          <span key={i} style={{
            flex: 1, height: `${18 + Math.abs(Math.sin(i * 0.6)) * 78}%`,
            background: active ? color : colors.avaCyan,
            opacity: active ? 0.95 : 0.32, borderRadius: 1,
          }} />
        );
      })}
    </div>
  );
}

/* ─── Skeleton (shimmer) ────────────────────────────────────── */
export function Skeleton({ w = '100%', h = 12, r = 8, style }: { w?: number | string; h?: number | string; r?: number; style?: React.CSSProperties }) {
  return <div className="lemtel-skeleton" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}
