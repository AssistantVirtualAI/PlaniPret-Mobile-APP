import React, { useEffect, useState } from 'react';
import { ImpactStyle } from '@capacitor/haptics';
import { colors, gradients, font, radius } from '../lib/theme';
import { mobileApi, DashboardBrief, MeResponse } from '../lib/mobileApi';
import { Card, Chip, StatusDot, SectionTitle, AIPanel, Skeleton, PrimaryButton, GhostButton } from '../components/ui/Primitives';
import { LemtelMark, AvaBadge, HeroGradient } from '../components/Brand';
import type { Tab } from '../components/BottomTabs';
import StatsDashboard from '../components/StatsDashboard';


interface Props { onNavigate: (t: Tab) => void; haptic: (s?: ImpactStyle) => Promise<void> }

export default function HomeScreen({ onNavigate, haptic }: Props) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [data, setData] = useState<DashboardBrief | null>(null);

  useEffect(() => {
    mobileApi.me().then(setMe);
    mobileApi.dashboard().then(setData);
  }, []);

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '14px 14px 20px' }}>
      {/* Account header */}
      <HeroGradient>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <LemtelMark size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: font.lg, fontWeight: 800, color: colors.textIce, letterSpacing: -0.3 }}>Lemtel</span>
              <AvaBadge />
            </div>
            <div style={{ fontSize: 10.5, color: colors.signalGold, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', marginTop: 2 }}>
              AI Phone
            </div>
          </div>
          {data ? <StatusDot state={data?.status?.sipState ?? 'unknown'} /> : <Skeleton w={50} h={14} />}
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: font.sm, color: colors.mutedSilver }}>
            {me ? `${me?.dataScope === 'domain_admin' ? 'Admin domaine' : 'Extension'} ${me?.extension?.number ?? '—'} · ${me?.domain?.sipDomain || me?.organization?.name || 'Lemtel'}` : <Skeleton w="60%" h={10} />}
          </div>
          <h1 style={{ fontSize: font.xxl, color: colors.textIce, margin: '6px 0 4px', fontWeight: 800, letterSpacing: -0.5 }}>
            {data?.greeting || (me ? `Bonjour, ${(me?.user?.name || me?.user?.email || 'Utilisateur').split(/[\s@]/).filter(Boolean)[0]}` : <Skeleton w="70%" h={26} />)}
          </h1>
          <p style={{ fontSize: font.base, color: colors.textSub, margin: 0, lineHeight: 1.5 }}>
            {data?.brief || <Skeleton w="100%" h={14} />}
          </p>
        </div>
      </HeroGradient>

      {/* Quick actions */}
      <SectionTitle eyebrow="Raccourcis" title="Actions rapides" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <QuickAction label="Appeler" icon="☎" tone="gold" onPress={() => { haptic(ImpactStyle.Medium); onNavigate('calls'); }} />
        <QuickAction label="Message" icon="✉" tone="cyan" onPress={() => { haptic(); onNavigate('messages'); }} />
        <QuickAction label="Demander à AVA" icon="✦" tone="violet" onPress={() => { haptic(); onNavigate('ai'); }} />
        <QuickAction label="Accueil" icon="◉" tone="violet" onPress={() => { haptic(); onNavigate('ai'); }} />
        <QuickAction label="Transfert" icon="↪" tone="gold" onPress={() => { haptic(); onNavigate('settings'); }} />
        <QuickAction label="Messagerie" icon="✉" tone="cyan" onPress={() => { haptic(); onNavigate('calls'); }} />
      </div>

      {/* Data scope */}
      <SectionTitle eyebrow="Données PBX réelles" title="Portée d'accès" />
      <Card padded={true} style={{ marginBottom: 10, background: 'linear-gradient(145deg, rgba(23,198,204,0.12), rgba(255,255,255,0.045))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 14, display: 'grid', placeItems: 'center', background: gradients.ai, fontSize: 18 }}>⌁</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: font.base, fontWeight: 800, color: colors.textIce }}>{data?.scope?.label || (me?.dataScope === 'domain_admin' ? 'Admin du domaine' : 'Utilisateur extension')}</div>
            <div style={{ fontSize: font.sm, color: colors.mutedSilver, marginTop: 2 }}>{me ? `${me?.client?.name ? `${me.client.name} · ` : ''}${me?.organization?.name || 'Lemtel'} · ${me?.domain?.sipDomain || me?.extension?.sipDomain || '—'}` : 'Chargement de la portée du domaine…'}</div>
          </div>
          <Chip tone={me?.permissions?.admin ? 'gold' : 'cyan'}>{me?.permissions?.admin ? 'Admin' : 'Utilisateur'}</Chip>
        </div>
      </Card>

      {me?.status?.updatedAt && (
        <div style={{ margin: '8px 2px 0', fontSize: font.xs, color: colors.mutedSilver }}>
          État PBX synchronisé {new Date(me.status.updatedAt).toLocaleString()}
        </div>
      )}

      {/* Comprehensive stats dashboard with period toggle */}
      <StatsDashboard />


      {/* Activity sparkline */}
      <SectionTitle eyebrow="12 dernières heures" title="Activité d'appels" />
      <ActivitySpark answered={data?.metrics?.answeredCalls ?? 0} missed={data?.metrics?.missedCalls ?? 0} />

      {/* Needs attention */}
      <SectionTitle eyebrow="Priorisé par AVA" title="À traiter" />
      {!data && <Card><Skeleton w="80%" h={12} /><div style={{ height: 8 }} /><Skeleton w="50%" h={10} /></Card>}
      {data?.needsAttention?.map?.((n) => (
        <Card key={n.id} accent={n.accent === 'danger' ? 'gold' : (n.accent as any)} style={{ marginBottom: 10 }} onPress={() => haptic()}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 12, display: 'grid', placeItems: 'center',
              background: gradients.ai, fontSize: 16,
            }}>{n.kind === 'voicemail' ? '✉' : n.kind === 'callback' ? '↺' : '✓'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: font.base, fontWeight: 700, color: colors.textIce }}>{n.title}</div>
              <div style={{ fontSize: font.sm, color: colors.mutedSilver }}>{n.subtitle}</div>
            </div>
            <Chip tone={n.accent === 'gold' ? 'gold' : n.accent === 'cyan' ? 'cyan' : 'violet'}>{(n.kind || '').replace('_', ' ')}</Chip>
          </div>
        </Card>
      ))}

      {/* AI brief */}
      <SectionTitle eyebrow="Résumé AVA" title="Ce qui a changé depuis votre dernière connexion" />
      <AIPanel title="Résumé quotidien AVA" right={<GhostButton tone="cyan" style={{ padding: '6px 10px' }} onClick={() => onNavigate('ai')}>Ouvrir l'IA</GhostButton>}>
        <p style={{ fontSize: font.base, lineHeight: 1.55, color: colors.textIce, margin: 0 }}>
          {data?.brief || "Génération du résumé du jour…"}
        </p>
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          <Chip tone="gold">{data?.metrics?.actionItems ?? '·'} tâches</Chip>
          <Chip tone="cyan">{data?.metrics?.unreadSms ?? '·'} non lus</Chip>
          <Chip tone="violet">Agents AVA en ligne</Chip>
        </div>
      </AIPanel>

      <div style={{ height: 80 }} />
    </div>
  );
}

function QuickAction({
  label, icon, tone, onPress,
}: { label: string; icon: string; tone: 'gold' | 'cyan' | 'violet'; onPress: () => void }) {
  const c = tone === 'gold' ? colors.signalGold : tone === 'cyan' ? colors.avaCyan : colors.avaViolet;
  return (
    <button onClick={onPress} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      minHeight: 78,
      padding: '14px 8px', borderRadius: radius.xl,
      background: `linear-gradient(155deg, ${c}1a, ${colors.graphite} 70%)`,
      border: `1px solid ${c}44`,
      color: colors.textIce, fontSize: font.sm, fontWeight: 800, cursor: 'pointer', boxShadow: '0 10px 24px -18px rgba(0,35,230,0.35)',
    }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      {label}
    </button>
  );
}

function toneColor(tone: 'success' | 'danger' | 'cyan' | 'gold' | 'violet') {
  switch (tone) {
    case 'success': return colors.success;
    case 'danger': return colors.danger;
    case 'cyan': return colors.avaCyan;
    case 'gold': return colors.signalGold;
    case 'violet': return colors.avaViolet;
  }
}

function Metric({
  label, value, tone, icon, trend,
}: { label: string; value?: number; tone: 'success' | 'danger' | 'cyan' | 'gold' | 'violet'; icon?: string; trend?: number }) {
  const c = toneColor(tone);
  const pct = Math.min(100, ((value ?? 0) / 20) * 100);
  const up = (trend ?? 0) >= 0;
  return (
    <Card padded={true} style={{
      padding: 14,
      position: 'relative',
      overflow: 'hidden',
      background: `linear-gradient(155deg, ${c}1f, ${colors.graphite} 75%)`,
      border: `1px solid ${c}33`,
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(120% 60% at 100% 0%, ${c}22, transparent 60%)`,
        pointerEvents: 'none',
      }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
        <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1.6, color: c, textTransform: 'uppercase' }}>{label}</div>
        <div style={{
          width: 22, height: 22, borderRadius: 8, display: 'grid', placeItems: 'center',
          background: `${c}26`, color: c, fontSize: 12, fontWeight: 900,
        }}>{icon ?? '•'}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, position: 'relative' }}>
        <div style={{ fontSize: 30, fontWeight: 800, color: colors.textIce, marginTop: 6, fontFamily: 'JetBrains Mono, monospace', letterSpacing: -0.5 }}>
          {value ?? <Skeleton w={40} h={22} />}
        </div>
        {trend != null && value != null && (
          <div style={{
            fontSize: 10, fontWeight: 800, color: up ? colors.success : colors.danger,
            background: `${up ? colors.success : colors.danger}1f`,
            padding: '2px 6px', borderRadius: 6,
          }}>{up ? '▲' : '▼'} {Math.abs(trend)}%</div>
        )}
      </div>
      <div style={{ marginTop: 10, height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.06)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: `linear-gradient(90deg, ${c}, ${c}88)`, borderRadius: 999 }} />
      </div>
    </Card>
  );
}

function AnswerRateHero({ answered, missed }: { answered?: number; missed?: number }) {
  const a = answered ?? 0;
  const m = missed ?? 0;
  const total = a + m;
  const rate = total > 0 ? Math.round((a / total) * 100) : 0;
  const size = 88;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (rate / 100) * circ;
  return (
    <Card padded={true} style={{
      padding: 16,
      background: `linear-gradient(135deg, rgba(0,35,230,0.22), rgba(23,198,204,0.10) 60%, rgba(10,15,32,0.9))`,
      border: '1px solid rgba(23,198,204,0.28)',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', right: -30, top: -30, width: 160, height: 160,
        background: 'radial-gradient(circle, rgba(23,198,204,0.18), transparent 70%)',
      }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
        <div style={{ position: 'relative', width: size, height: size }}>
          <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
            <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
            <circle
              cx={size / 2} cy={size / 2} r={r}
              stroke="url(#answerGrad)" strokeWidth={stroke} fill="none"
              strokeLinecap="round"
              strokeDasharray={circ} strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 600ms ease' }}
            />
            <defs>
              <linearGradient id="answerGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={colors.avaCyan} />
                <stop offset="100%" stopColor={colors.signalGold} />
              </linearGradient>
            </defs>
          </svg>
          <div style={{
            position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
            fontSize: 22, fontWeight: 800, color: colors.textIce, fontFamily: 'JetBrains Mono, monospace',
          }}>{rate}%</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1.6, color: colors.avaCyan, textTransform: 'uppercase' }}>Answer rate</div>
          <div style={{ fontSize: font.lg, fontWeight: 800, color: colors.textIce, marginTop: 2 }}>{a} of {total} calls handled</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <Chip tone="cyan">{a} answered</Chip>
            <Chip tone="gold">{m} missed</Chip>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ActivitySpark({ answered, missed }: { answered: number; missed: number }) {
  // Deterministic pseudo-distribution across 12 hourly buckets
  const buckets = Array.from({ length: 12 }, (_, i) => {
    const seed = Math.sin(i * 1.3 + answered * 0.7 + missed * 0.3) * 0.5 + 0.5;
    const aH = Math.max(1, Math.round(seed * Math.max(answered, 2) * 0.9));
    const mH = Math.max(0, Math.round((1 - seed) * Math.max(missed, 1) * 0.6));
    return { aH, mH };
  });
  const max = Math.max(...buckets.map(b => b.aH + b.mH), 4);
  return (
    <Card padded={true} style={{
      padding: 14,
      background: `linear-gradient(160deg, rgba(106,77,255,0.12), ${colors.graphite} 70%)`,
      border: '1px solid rgba(106,77,255,0.28)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 84 }}>
        {buckets.map((b, i) => {
          const total = b.aH + b.mH;
          const h = max > 0 ? (total / max) * 78 : 0;
          const aRatio = total > 0 ? b.aH / total : 0;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
              <div style={{
                height: h,
                borderRadius: 4,
                background: `linear-gradient(180deg, ${colors.avaCyan} 0%, ${colors.avaCyan} ${aRatio * 100}%, ${colors.signalGold} ${aRatio * 100}%, ${colors.signalGold} 100%)`,
                boxShadow: `0 0 12px -4px ${colors.avaCyan}88`,
              }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 9, color: colors.mutedSilver, letterSpacing: 1 }}>
        <span>8AM</span><span>12PM</span><span>4PM</span><span>8PM</span>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        <LegendDot color={colors.avaCyan} label="Répondus" />
        <LegendDot color={colors.signalGold} label="Manqués" />
      </div>
    </Card>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: colors.mutedSilver, fontWeight: 700 }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: color, boxShadow: `0 0 8px ${color}` }} />
      {label}
    </div>
  );
}
