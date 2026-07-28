import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ImpactStyle } from '@capacitor/haptics';
import { Moon, Sun } from 'lucide-react';
import { colors, font, gradients, radius } from '../lib/theme';
import { mobileApi, DomainStats, MeResponse, StatsRange } from '../lib/mobileApi';
import { Card, Chip, SectionTitle, Skeleton, StatusDot, AIPanel, GhostButton } from '../components/ui/Primitives';
import { LemtelMark, AvaBadge, HeroGradient } from '../components/Brand';
import { useAutoSync } from '../hooks/useAutoSync';
import { useTheme } from '../lib/ThemeContext';
import { useMobileCredentials } from '../hooks/useMobileCredentials';
import { restGet } from '../lib/mobileSupabase';
import type { Tab } from '../components/BottomTabs';
import NotificationsSheet, { NotificationBell, useNotificationCounts } from '../components/NotificationsSheet';
import { useT } from '../lib/i18n';

const AI_CACHE_KEY = (range: string) => `ava.aisummary.${range}`;

type DashboardProps = { onNavigate: (t: Tab) => void; haptic: (s?: ImpactStyle) => Promise<void>; onOpenProfile?: () => void };

export default function DashboardScreen(props: DashboardProps) {
  return (
    <DashboardCrashGuard {...props}>
      <DashboardScreenInner {...props} />
    </DashboardCrashGuard>
  );
}

class DashboardCrashGuard extends React.Component<DashboardProps & { children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) {
    console.error('[DashboardScreenError]', error);
    try { localStorage.setItem('ava.dashboard.lastError', `${error?.name || 'Error'}: ${error?.message || ''}\n${error?.stack || ''}`); } catch {}
  }
  render() {
    if (this.state.error) {
      return <DashboardSafeFallback {...this.props} error={this.state.error} onRetry={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}

function DashboardSafeFallback({ onNavigate, haptic, onRetry, onOpenProfile, error }: DashboardProps & { onRetry: () => void; error?: Error | null }) {
  const { t, tx } = useT();
  const safeHaptic = useMemo(() => safeAsync(haptic), [haptic]);
  const go = (tab: Tab) => { safeHaptic(); try { onNavigate(tab); } catch {} };
  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '14px 14px 20px' }}>
      <HeroGradient>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <LemtelMark size={42} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: font.lg, fontWeight: 800, color: colors.textIce }}>AVA Softphone</div>
            <div style={{ fontSize: 10.5, color: colors.signalGold, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>
              {safeTranslate(t, 'tabs.home', 'Home')}
            </div>
          </div>
          <button
            onClick={() => { safeHaptic(); safeRun(onOpenProfile, 'open profile'); }}
            aria-label="My profile"
            style={{ width: 38, height: 38, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.10)', color: colors.textIce, fontWeight: 800 }}
          >MH</button>
        </div>
        <h1 style={{ fontSize: font.xxl, color: colors.textIce, margin: '18px 0 6px', fontWeight: 800 }}>
          {tx('Accueil disponible', 'Home available')}
        </h1>
        <p style={{ fontSize: font.sm, color: colors.textSub, lineHeight: 1.5, margin: 0 }}>
          {tx("Une donnée du tableau de bord n'a pas pu être affichée, mais l'application reste accessible.", 'One dashboard data field could not be displayed, but the app remains accessible.')}
        </p>
        {error?.message && (
          <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,80,80,0.12)', border: '1px solid rgba(255,80,80,0.3)', fontSize: 11, color: '#ffd5d5', fontFamily: 'JetBrains Mono, monospace', wordBreak: 'break-word' }}>
            {String(error.message).slice(0, 280)}
          </div>
        )}
      </HeroGradient>
      <SectionTitle eyebrow="AVA" title={tx('Actions rapides', 'Quick actions')} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Card onPress={() => go('contacts')}><QuickTile icon="👤" label={safeTranslate(t, 'tabs.contacts', 'Contacts')} /></Card>
        <Card onPress={() => go('chats')}><QuickTile icon="💬" label={safeTranslate(t, 'tabs.chats', 'Chats')} /></Card>
        <Card onPress={() => go('calls')}><QuickTile icon="☎" label={safeTranslate(t, 'tabs.calls', 'Calls')} /></Card>
        <Card onPress={() => go('keypad')}><QuickTile icon="⌨" label={safeTranslate(t, 'tabs.keypad', 'Keypad')} /></Card>
      </div>
      <Card style={{ marginTop: 12 }}>
        <button
          onClick={() => { safeHaptic(); onRetry(); }}
          style={{ width: '100%', minHeight: 46, border: 0, borderRadius: radius.lg, background: colors.lemtelBlue, color: '#fff', fontWeight: 800, fontSize: font.sm }}
        >{safeTranslate(t, 'common.retry', 'Retry')}</button>
      </Card>
      <div style={{ height: 80 }} />
    </div>
  );
}

function QuickTile({ icon, label }: { icon: string; label: string }) {
  return (
    <div style={{ minHeight: 58, display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 34, height: 34, borderRadius: 12, display: 'grid', placeItems: 'center', background: `${colors.avaCyan}18`, color: colors.avaCyan, fontSize: 18 }}>{icon}</span>
      <span style={{ fontSize: font.sm, fontWeight: 800, color: colors.textIce }}>{label}</span>
    </div>
  );
}

function DashboardScreenInner({
  onNavigate, haptic, onOpenProfile,
}: DashboardProps) {
  const { mode, toggle } = useTheme();
  const { t, lang, toggle: toggleLang } = useT();
  const RANGE_LABELS: Record<StatsRange, string> = { today: t('common.today'), '7d': t('common.range7d'), '30d': t('common.range30d') };
  const [range, setRange] = useState<StatsRange>('today');
  const [notifOpen, setNotifOpen] = useState(false);
  const notifCounts = useNotificationCounts();
  const me = useAutoSync<MeResponse>(() => mobileApi.me(), { intervalMs: 5 * 60_000, cacheKey: 'me', staleTimeMs: 120_000 });
  const stats = useAutoSync<DomainStats>(() => mobileApi.domainStats(range), { intervalMs: 15 * 60_000, deps: [range], cacheKey: `domainStats:${range}`, staleTimeMs: 5 * 60_000 });
  const m = isRecord(me.data) ? (me.data as any) : null;
  const hasStats = isUsableStats(stats.data);
  const s = useMemo(() => sanitizeStats(stats.data), [stats.data]);
  const userName = safeText(m?.user?.name || m?.user?.email, 'User');
  const firstName = userName.split(/[\s@]/).filter(Boolean)[0] || 'User';
  const orgName = safeText(m?.organization?.name, 'Lemtel Télécom');
  const domainLabel = safeText(m?.domain?.sipDomain || m?.organization?.sipDomain || orgName, orgName);

  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const lastKeyRef = useRef<string>('');

  useEffect(() => {
    if (!hasStats) return;
    const sig = `${range}|${safeNumber(s.totalCalls ?? s.callsToday)}|${safeNumber(s.answered)}|${safeNumber(s.missed)}|${safeText(s.peakHour, '')}`;
    if (lastKeyRef.current === sig) return;
    lastKeyRef.current = sig;
    try {
      const cached = localStorage.getItem(AI_CACHE_KEY(sig));
      if (cached) { setAiSummary(cached); return; }
    } catch {}
    setAiLoading(true); setAiError(null);
    try {
      mobileApi.aiSummary(range, s, RANGE_LABELS[range])
        .then((r) => {
          const summary = safeText(r?.summary, '');
          setAiSummary(summary);
          try { localStorage.setItem(AI_CACHE_KEY(sig), summary); } catch {}
        })
        .catch((e) => setAiError(e?.message || 'AVA summary failed'))
        .finally(() => setAiLoading(false));
    } catch (e: any) {
      setAiError(e?.message || 'AVA summary failed');
      setAiLoading(false);
    }
  }, [hasStats, s, range]);


  const total = safeNumber(s?.totalCalls ?? s?.callsToday);
  const answered = safeNumber(s?.answered ?? s?.answeredToday);
  const missed = safeNumber(s?.missed ?? s?.missedToday);
  const voicemails = safeNumber(s?.voicemails ?? s?.voicemailsToday);
  const rawBuckets = s?.buckets ?? s?.last7Days ?? [];
  const buckets = Array.isArray(rawBuckets) ? rawBuckets.slice(-30).map((v) => safeNumber(v)) : [];
  const topExtensions = normalizeTopExtensions(s?.topExtensions);
  const safeHaptic = useMemo(() => safeAsync(haptic), [haptic]);
  const safeNavigate = (next: Tab) => {
    try { onNavigate(next); } catch (e) { console.warn('[Dashboard] navigation failed', e); }
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '14px 14px 20px' }}>
      <HeroGradient>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <LemtelMark size={42} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: font.lg, fontWeight: 800, color: colors.textIce, letterSpacing: -0.3 }}>AVA Softphone</span>
              <AvaBadge />
            </div>
            <div style={{ fontSize: 10.5, color: colors.signalGold, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', marginTop: 2 }}>
              {t('header.callHistory')} · {RANGE_LABELS[range]}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            {hasStats ? <StatusDot state="registered" /> : <Skeleton w={40} h={14} />}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                onClick={() => { safeHaptic(); safeRun(toggle, 'theme toggle'); }}
                aria-label={t('header.toggleTheme')}
                title={t('header.toggleTheme')}
                style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.10)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  color: colors.textIce, cursor: 'pointer',
                  display: 'grid', placeItems: 'center',
                }}
              >
                {mode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button
                onClick={() => { safeHaptic(); safeRun(toggleLang, 'language toggle'); }}
                aria-label={t('header.toggleLang')}
                title={t('header.toggleLang')}
                style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.10)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  color: colors.textIce, cursor: 'pointer',
                  fontSize: 11, fontWeight: 800, letterSpacing: 0.5,
                }}
              >
                {lang.toUpperCase()}
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => safeRun(onOpenProfile, 'open profile')}
                aria-label="My profile"
                style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: `linear-gradient(135deg, ${colors.lemtelBlue}, ${colors.avaCyan})`,
                  color: '#fff', fontWeight: 800, fontSize: 13, border: '2px solid rgba(255,255,255,0.85)',
                  cursor: 'pointer', display: 'grid', placeItems: 'center',
                  boxShadow: '0 8px 18px -8px rgba(7,22,168,0.45)',
                }}
              >
                {safeText(m?.user?.name || m?.user?.email, 'U').split(/[\s@]/)[0].slice(0, 2).toUpperCase()}
              </button>
              <NotificationBell onClick={() => setNotifOpen(true)} count={notifCounts.total} />
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: font.sm, color: colors.mutedSilver }}>
            {m ? domainLabel : <Skeleton w="60%" h={10} />}
          </div>
          <h1 style={{ fontSize: font.xxl, color: colors.textIce, margin: '6px 0 4px', fontWeight: 800, letterSpacing: -0.5 }}>
            {m ? `${t('dashboard.greeting')} ${firstName}` : <Skeleton w="60%" h={26} />}
          </h1>
          <p style={{ fontSize: font.base, color: colors.textSub, margin: 0, lineHeight: 1.5 }}>
            {hasStats ? t('dashboard.callsLine', { total, answered, missed }) : <Skeleton w="100%" h={14} />}
          </p>
        </div>
      </HeroGradient>

      {/* Range tabs */}
      <div style={{ display: 'flex', gap: 6, margin: '14px 0 10px', padding: 4, background: 'rgba(255,255,255,0.08)', borderRadius: radius.xl }}>
        {(Object.keys(RANGE_LABELS) as StatsRange[]).map((r) => (
          <button key={r} onClick={() => { safeHaptic(); setRange(r); }} style={{
            flex: 1, padding: '8px 6px', borderRadius: radius.lg, border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 800, letterSpacing: 0.5,
            background: range === r ? `linear-gradient(135deg, ${colors.lemtelBlue}, ${colors.avaCyan})` : 'transparent',
            color: range === r ? '#fff' : colors.mutedSilver,
            transition: 'all .2s ease',
          }}>{RANGE_LABELS[r]}</button>
        ))}
      </div>

      {/* Inline status / error banner so the dashboard never silently shows nothing. */}
      {(() => {
        const noSoftphone = isRecord(stats.data) && (stats.data as any).noSoftphone === true;
        const errMsg = stats.error?.message;
        if (!errMsg && !noSoftphone) return null;
        return (
          <Card padded={true} style={{
            marginBottom: 10,
            background: noSoftphone ? 'rgba(255,200,40,0.10)' : 'rgba(255,80,80,0.10)',
            border: `1px solid ${noSoftphone ? 'rgba(255,200,40,0.35)' : 'rgba(255,80,80,0.35)'}`,
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', color: noSoftphone ? colors.signalGold : colors.danger, marginBottom: 4 }}>
              {noSoftphone
                ? (lang === 'fr' ? 'Compte non lié à un poste' : 'Account not linked to an extension')
                : (lang === 'fr' ? 'Statistiques indisponibles' : 'Stats unavailable')}
            </div>
            <div style={{ fontSize: font.sm, color: colors.textIce, lineHeight: 1.4 }}>
              {noSoftphone
                ? (lang === 'fr'
                    ? "Votre compte n'est pas associé à un poste softphone. Demandez à un admin de lier votre extension."
                    : "Your account isn't linked to a softphone extension yet. Ask an admin to link your extension.")
                : (errMsg || (lang === 'fr' ? 'Erreur inconnue.' : 'Unknown error.'))}
            </div>
            <button
              onClick={() => { safeHaptic(); stats.refresh(); }}
              style={{
                marginTop: 8, padding: '8px 14px', border: 0, borderRadius: radius.lg,
                background: colors.lemtelBlue, color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer',
              }}
            >{lang === 'fr' ? 'Réessayer' : 'Retry'}</button>
          </Card>
        );
      })()}



      {(() => {
        const isAdmin = !!m?.permissions?.admin || m?.dataScope === 'domain_admin';
        const outbound = safeNumber(s?.outboundCalls);
        const inbound = Math.max(0, total - outbound);
        const scopeLabel = isAdmin
          ? safeText(m?.domain?.sipDomain || m?.organization?.name, 'Domain')
          : (m?.extension?.number ? `Ext ${safeText(m.extension.number)}` : 'My activity');
        const scopeEyebrow = isAdmin ? t('dashboard.domain') : t('dashboard.myActivity');
        return (
          <>
            <SectionTitle eyebrow={scopeEyebrow} title={`${scopeLabel} · ${RANGE_LABELS[range]}`} />
            <AnswerRateHero
              answered={hasStats ? answered : undefined}
              missed={hasStats ? missed : undefined}
              total={hasStats ? total : undefined}
              voicemails={hasStats ? voicemails : undefined}
              avgSec={hasStats ? safeNumber(s.avgDurationSec) : undefined}
              rangeLabel={RANGE_LABELS[range]}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
              <DirectionDonut inbound={hasStats ? inbound : undefined} outbound={hasStats ? outbound : undefined} />
              <TalkTimeGauge totalSec={hasStats ? safeNumber(s.totalTalkSec) : undefined} avgSec={hasStats ? safeNumber(s.avgDurationSec) : undefined} />
            </div>

            <SectionTitle eyebrow={t('dashboard.breakdown')} title={isAdmin ? t('dashboard.domainMetrics') : t('dashboard.myMetrics')} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              <Metric label={t('m.totalCalls')} value={hasStats ? total : undefined} tone="cyan" icon="☎" pct={100} />
              <Metric label={t('m.answered')} value={hasStats ? answered : undefined} tone="success" icon="↗" pct={total ? (answered / total) * 100 : 0} />
              <Metric label={t('m.missed')} value={hasStats ? missed : undefined} tone="danger" icon="↘" pct={total ? (missed / total) * 100 : 0} />
              <Metric label={t('m.voicemails')} value={hasStats ? voicemails : undefined} tone="gold" icon="✉" pct={total ? (voicemails / total) * 100 : 0} />
              <Metric label={t('m.answerRate')} value={hasStats ? `${safeNumber(s.answerRate)}%` : undefined} tone="success" icon="◐" pct={safeNumber(s?.answerRate)} />
              <Metric label={t('m.avgDuration')} value={hasStats ? `${safeNumber(s.avgDurationSec)}s` : undefined} tone="violet" icon="◷" pct={Math.min(100, (safeNumber(s?.avgDurationSec) / 300) * 100)} />
              <Metric label={t('m.totalTalk')} value={hasStats ? fmtTalk(safeNumber(s.totalTalkSec)) : undefined} tone="cyan" icon="∿" pct={75} />
              <Metric label={t('m.peakHour')} value={hasStats ? `${safeNumber(s.peakHour)}:00` : undefined} tone="gold" icon="◉" pct={(safeNumber(s?.peakHour) / 24) * 100} />
              <Metric label={t('m.outbound')} value={hasStats ? outbound : undefined} tone="cyan" icon="↗" pct={total ? (outbound / total) * 100 : 0} />
              <Metric label={t('m.failedDials')} value={hasStats ? safeNumber(s.dialFailedCount) : undefined} tone="danger" icon="✕" pct={total ? (safeNumber(s?.dialFailedCount) / total) * 100 : 0} />
              <Metric label={t('m.dialSuccess')} value={hasStats ? `${safeNumber(s.dialSuccessRate)}%` : undefined} tone="success" icon="✓" pct={safeNumber(s?.dialSuccessRate)} />
              {isAdmin && <Metric label={t('m.activeExt')} value={hasStats ? safeNumber(s.activeExtensions) : undefined} tone="violet" icon="◆" pct={Math.min(100, (safeNumber(s?.activeExtensions) / 20) * 100)} />}
            </div>

            {isAdmin && m?.extension?.number && (
              <>
                <SectionTitle eyebrow={t('dashboard.myExtension')} title={`Ext ${m.extension.number} · ${RANGE_LABELS[range]}`} />
                <MyExtensionStats range={range} extension={safeText(m.extension.number)} domainUuid={safeText(m.domain?.fusionpbxDomainUuid || m.organization?.fusionpbxDomainUuid, '') || null} />
              </>
            )}
          </>
        );
      })()}



      <SectionTitle eyebrow={RANGE_LABELS[range]} title={t('dashboard.callsPerDay')} />
      <Card padded={true}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, buckets.length || 7)}, 1fr)`, gap: range === '30d' ? 2 : 6, alignItems: 'end', height: 90 }}>
          {(buckets.length ? buckets : Array(7).fill(0)).map((v, i, arr) => {
            const max = arr.reduce((best, n) => Math.max(best, safeNumber(n)), 1);
            const h = Math.max(6, Math.round((v / max) * 84));
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{
                  width: '100%', height: h, borderRadius: 4,
                  background: `linear-gradient(180deg, ${colors.lemtelBlue}, ${colors.blueGlow})`,
                  opacity: hasStats ? 1 : 0.25,
                }} />
                {range !== '30d' && (
                  <span style={{ fontSize: 9, color: colors.mutedSilver }}>{dayLabel(i, arr.length || 7)}</span>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <SectionTitle eyebrow={t('dashboard.insights')} title={`${t('dashboard.topExtensions')} · ${RANGE_LABELS[range]}`} />
      {!hasStats && [1,2,3].map(i => <Card key={i} style={{ marginBottom: 8 }}><Skeleton w="60%" h={12} /></Card>)}
      {hasStats && topExtensions.length === 0 && (
        <Card><div style={{ fontSize: font.sm, color: colors.mutedSilver, textAlign: 'center' }}>{safeTranslate(t, 'dashboard.noActivity', 'No activity yet')}</div></Card>
      )}
        {hasStats && topExtensions.map((ext, i) => (
        <Card key={`${ext.extension || 'ext'}-${i}`} style={{ marginBottom: 8 }} padded={true}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 16, fontWeight: 800, color: colors.lemtelBlue, minWidth: 28 }}>#{i+1}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: font.base, fontWeight: 700, color: colors.textIce }}>Ext {ext.extension || '—'}</div>
              <div style={{ fontSize: font.xs, color: colors.mutedSilver }}>{ext.name || '—'}</div>
            </div>
            <Chip tone="cyan">{ext.calls} {t('m.totalCalls').toLowerCase()}</Chip>
          </div>
        </Card>
      ))}

      <SectionTitle eyebrow={t('dashboard.avaAssistant')} title={`${t('dashboard.avaSummary')} · ${RANGE_LABELS[range]}`} />
      <AIPanel title={t('dashboard.avaSummary')} accent={colors.avaViolet} right={<GhostButton tone="violet" style={{ padding: '6px 10px' }} onClick={() => safeNavigate('ava')}>{t('dashboard.openChat')}</GhostButton>}>
        {!hasStats ? (
          <Skeleton w="100%" h={42} />
        ) : (
          <div style={{ fontSize: font.base, lineHeight: 1.55, color: colors.textIce }}>
            {aiLoading && !aiSummary ? (
              <Skeleton w="100%" h={42} />
            ) : aiError && !aiSummary ? (
              <p style={{ margin: '0 0 8px', color: colors.danger, fontSize: font.sm }}>{aiError}</p>
            ) : aiSummary ? (
              <p style={{ margin: '0 0 8px' }}>{aiSummary}</p>
            ) : (
              <p style={{ margin: '0 0 8px' }}>
                {total === 0
                  ? (lang === 'fr'
                      ? "Aucun appel dans cette période — actualisez quand de nouveaux CDR arrivent."
                      : `No calls in this range yet — refresh once new CDRs land.`)
                  : (lang === 'fr'
                      ? `Sur ${RANGE_LABELS[range].toLowerCase()}, ${total} appels · ${answered} répondus, ${missed} manqués.`
                      : `Across ${RANGE_LABELS[range].toLowerCase()}, ${total} calls · ${answered} answered, ${missed} missed.`)}
              </p>
            )}
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {(['today','7d','30d'] as StatsRange[]).map((r) => (
                <button key={r} onClick={() => { safeHaptic(); setRange(r); }} style={{
                  padding: '4px 10px', borderRadius: 999, border: `1px solid ${colors.border}`,
                  background: range === r ? colors.avaViolet : 'transparent',
                  color: range === r ? '#fff' : colors.textSub, fontSize: 10.5, fontWeight: 700,
                  letterSpacing: 0.6, textTransform: 'uppercase', cursor: 'pointer',
                }}>{RANGE_LABELS[r]}</button>
              ))}
            </div>
          </div>
        )}
      </AIPanel>

      <div style={{ height: 80 }} />
      <NotificationsSheet open={notifOpen} onClose={() => setNotifOpen(false)} onNavigate={onNavigate} />
    </div>
  );
}

function isRecord(v: unknown): v is Record<string, any> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function isUsableStats(v: unknown): v is DomainStats {
  return isRecord(v) && !(typeof (v as any).error === 'string');
}

function sanitizeStats(raw: unknown): any {
  const r = isRecord(raw) && !(typeof (raw as any).error === 'string') ? (raw as any) : {};
  const total = safeNumber(r.totalCalls ?? r.callsToday);
  const answered = safeNumber(r.answered ?? r.answeredToday);
  const missed = safeNumber(r.missed ?? r.missedToday);
  const voicemails = safeNumber(r.voicemails ?? r.voicemailsToday);
  const outbound = safeNumber(r.outboundCalls);
  const last7Days = Array.isArray(r.last7Days) ? r.last7Days.map((v: unknown) => safeNumber(v)) : undefined;
  const buckets = Array.isArray(r.buckets)
    ? r.buckets.map((v: unknown) => safeNumber(v))
    : last7Days;
  return {
    ...r,
    totalCalls: total,
    callsToday: safeNumber(r.callsToday, total),
    answered,
    answeredToday: safeNumber(r.answeredToday, answered),
    missed,
    missedToday: safeNumber(r.missedToday, missed),
    voicemails,
    voicemailsToday: safeNumber(r.voicemailsToday, voicemails),
    outboundCalls: outbound,
    answerRate: r.answerRate != null ? safeNumber(r.answerRate) : (total ? Math.round((answered / total) * 100) : 0),
    avgDurationSec: safeNumber(r.avgDurationSec),
    totalTalkSec: safeNumber(r.totalTalkSec),
    peakHour: safeNumber(r.peakHour),
    dialFailedCount: safeNumber(r.dialFailedCount),
    dialSuccessRate: safeNumber(r.dialSuccessRate),
    activeExtensions: safeNumber(r.activeExtensions),
    buckets: buckets || [],
    last7Days: last7Days || buckets || [],
    topExtensions: Array.isArray(r.topExtensions) ? r.topExtensions : [],
  };
}

function safeText(v: unknown, fallback = ''): string {
  if (typeof v === 'string') return v;
  if (v == null) return fallback;
  try { return String(v); } catch { return fallback; }
}

function safeTranslate(t: (key: any, params?: any) => string, key: string, fallback: string, params?: any) {
  try {
    const value = t(key as any, params);
    return safeText(value, fallback) || fallback;
  } catch {
    return fallback;
  }
}

function safeNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function safeRun(fn: (() => void) | undefined, label = 'action') {
  try { fn?.(); } catch (e) { console.warn(`[Dashboard] ${label} failed`, e); }
}

function safeAsync<T extends (...args: any[]) => any>(fn: T | undefined) {
  return (...args: Parameters<T>) => {
    try {
      const out = fn?.(...args);
      if (out && typeof (out as Promise<unknown>).catch === 'function') {
        (out as Promise<unknown>).catch((e) => console.warn('[Dashboard] async action failed', e));
      }
    } catch (e) {
      console.warn('[Dashboard] action failed', e);
    }
  };
}

function normalizeTopExtensions(raw: unknown): { extension: string; name?: string; calls: number }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (Array.isArray(item)) {
        return { extension: safeText(item[0]), calls: safeNumber(item[1]), name: safeText(item[2], '') || undefined };
      }
      if (isRecord(item)) {
        return {
          extension: safeText(item.extension ?? item.ext ?? item.number),
          name: safeText(item.name ?? item.displayName ?? item.display_name, '') || undefined,
          calls: safeNumber(item.calls ?? item.count ?? item.total),
        };
      }
      return { extension: safeText(item), calls: 0 };
    })
    .filter((item) => item.extension || item.calls > 0);
}

function dayLabel(i: number, total: number) {
  const d = new Date(); d.setDate(d.getDate() - (total - 1 - i));
  return ['S','M','T','W','T','F','S'][d.getDay()];
}

function fmtTalk(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h${m}m`;
  return `${m}m`;
}

function toneHex(tone: 'success' | 'danger' | 'cyan' | 'gold' | 'violet') {
  return tone === 'success' ? colors.success : tone === 'danger' ? colors.danger : tone === 'cyan' ? colors.avaCyan : tone === 'gold' ? colors.signalGold : colors.avaViolet;
}

function Metric({ label, value, tone, icon, pct }: { label: string; value?: number | string; tone: 'success' | 'danger' | 'cyan' | 'gold' | 'violet'; icon?: string; pct?: number }) {
  const c = toneHex(tone);
  const p = Math.max(0, Math.min(100, pct ?? 0));
  return (
    <Card padded={true} style={{
      padding: 14, position: 'relative', overflow: 'hidden',
      background: `linear-gradient(155deg, ${c}1f, ${colors.graphite} 75%)`,
      border: `1px solid ${c}33`,
    }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(120% 60% at 100% 0%, ${c}26, transparent 60%)`, pointerEvents: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
        <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1.6, color: c, textTransform: 'uppercase' }}>{label}</div>
        <div style={{ width: 22, height: 22, borderRadius: 8, display: 'grid', placeItems: 'center', background: `${c}26`, color: c, fontSize: 12, fontWeight: 900 }}>{icon ?? '•'}</div>
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: colors.textIce, marginTop: 6, fontFamily: 'JetBrains Mono, monospace', letterSpacing: -0.5, position: 'relative' }}>
        {value ?? <Skeleton w={40} h={22} />}
      </div>
      <div style={{ marginTop: 10, height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.06)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, width: `${p}%`, background: `linear-gradient(90deg, ${c}, ${c}88)`, borderRadius: 999, transition: 'width 500ms ease' }} />
      </div>
    </Card>
  );
}

function AnswerRateHero({ answered, missed, total, voicemails, avgSec, rangeLabel }: {
  answered?: number; missed?: number; total?: number; voicemails?: number; avgSec?: number; rangeLabel: string;
}) {
  const { t, lang } = useT();
  const a = answered ?? 0; const m = missed ?? 0; const tot = total ?? (a + m);
  const rate = tot > 0 ? Math.round((a / tot) * 100) : 0;
  const ofLbl = lang === 'fr' ? 'sur' : 'of';
  const handledLbl = lang === 'fr' ? 'traités' : 'handled';
  const size = 92; const stroke = 10; const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (rate / 100) * circ;
  return (
    <Card padded={true} style={{
      padding: 16, marginTop: 4,
      background: `linear-gradient(135deg, rgba(0,35,230,0.28), rgba(23,198,204,0.12) 55%, rgba(10,15,32,0.92))`,
      border: '1px solid rgba(23,198,204,0.32)',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', right: -40, top: -40, width: 200, height: 200, background: 'radial-gradient(circle, rgba(23,198,204,0.22), transparent 70%)' }} />
      <div style={{ position: 'absolute', left: -30, bottom: -50, width: 160, height: 160, background: 'radial-gradient(circle, rgba(106,77,255,0.18), transparent 70%)' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
        <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
          <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
            <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.10)" strokeWidth={stroke} fill="none" />
            <circle cx={size / 2} cy={size / 2} r={r} stroke="url(#answerHero)" strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 700ms ease' }} />
            <defs>
              <linearGradient id="answerHero" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={colors.avaCyan} />
                <stop offset="100%" stopColor={colors.signalGold} />
              </linearGradient>
            </defs>
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', flexDirection: 'column' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: colors.textIce, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>{rate}%</div>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1.6, color: colors.avaCyan, textTransform: 'uppercase' }}>{t('m.answerRateLabel')} · {rangeLabel}</div>
          <div style={{ fontSize: font.lg, fontWeight: 800, color: colors.textIce, marginTop: 2, letterSpacing: -0.3 }}>{a} {ofLbl} {tot} {handledLbl}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <Chip tone="cyan">{a} {t('m.answered').toLowerCase()}</Chip>
            <Chip tone="gold">{m} {t('m.missed').toLowerCase()}</Chip>
            {voicemails != null && <Chip tone="violet">{voicemails} {lang === 'fr' ? 'msg' : 'vm'}</Chip>}
          </div>
        </div>
      </div>

      {/* Mini bar: answered vs missed vs voicemails */}
      <div style={{ marginTop: 14, height: 10, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', display: 'flex', position: 'relative' }}>
        <div style={{ width: `${tot ? (a / tot) * 100 : 0}%`, background: `linear-gradient(90deg, ${colors.avaCyan}, ${colors.avaCyan}cc)` }} />
        <div style={{ width: `${tot ? (m / tot) * 100 : 0}%`, background: `linear-gradient(90deg, ${colors.signalGold}, ${colors.signalGold}cc)` }} />
        <div style={{ width: `${tot ? ((voicemails ?? 0) / tot) * 100 : 0}%`, background: `linear-gradient(90deg, ${colors.avaViolet}, ${colors.avaViolet}cc)` }} />
      </div>

      {avgSec != null && (
        <div style={{ marginTop: 10, display: 'flex', gap: 12, fontSize: 10.5, color: colors.mutedSilver, fontWeight: 700, letterSpacing: 0.4 }}>
          <span>⌀ {avgSec}s {lang === 'fr' ? 'durée moy.' : 'avg call'}</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>{tot} {lang === 'fr' ? 'interactions' : 'total interactions'}</span>
        </div>
      )}
    </Card>
  );
}

function MyExtensionStats({ range, extension, domainUuid }: { range: StatsRange; extension: string; domainUuid?: string | null }) {
  const { t, tx } = useT();
  const mobile = useMobileCredentials();
  const [s, setS] = React.useState<{ total: number; answered: number; missed: number; voicemails: number; recordings: number; avgSec: number } | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!mobile.accessToken || !domainUuid || !extension) return;
    let cancelled = false;
    const now = new Date();
    const since = new Date(now);
    if (range === 'today') since.setHours(0, 0, 0, 0);
    else if (range === '7d') since.setDate(now.getDate() - 7);
    else since.setDate(now.getDate() - 30);
    const sinceIso = since.toISOString();
    setErr(null);
    const base = `/rest/v1/pbx_call_records?domain_uuid=eq.${encodeURIComponent(domainUuid)}&start_at=gte.${encodeURIComponent(sinceIso)}&order=start_at.desc&limit=1000`;
    const urls = [
      `${base}&select=id,call_status,duration_seconds,has_recording,direction,extension&extension=eq.${encodeURIComponent(extension)}`,
      `${base}&select=id,call_status,duration_seconds,has_recording,direction,caller_number,source_number,destination_number,destination`,
      `${base}&select=id,call_status,duration_seconds,has_recording,direction,caller_number,destination`,
    ];
    (async () => {
      let rows: any[] = [];
      let last: any = null;
      for (const url of urls) {
        try { rows = await restGet<any[]>(url, mobile.accessToken!); last = null; break; }
        catch (e) { last = e; }
      }
      if (last) throw last;
      return rows;
    })()
      .then((rows) => {
        if (cancelled) return;
        const ext = String(extension);
        const r = (rows || []).filter((x: any) => {
          if (x.extension) return String(x.extension) === ext;
          return [x.caller_number, x.source_number, x.destination_number, x.destination].some((v) => String(v || '') === ext);
        });
        const total = r.length;
        const answered = r.filter((x) => (x.call_status || '').toLowerCase() === 'answered').length;
        const missed = r.filter((x) => ['missed', 'no_answer', 'noanswer'].includes(String(x.call_status || '').toLowerCase())).length;
        const voicemails = r.filter((x) => String(x.call_status || '').toLowerCase().includes('voicemail')).length;
        const recordings = r.filter((x) => !!x.has_recording).length;
        const dur = r.reduce((a, x) => a + (Number(x.duration_seconds) || 0), 0);
        setS({ total, answered, missed, voicemails, recordings, avgSec: total ? Math.round(dur / total) : 0 });
      })
      .catch((e) => { if (!cancelled) setErr(e?.message || 'Failed'); });
    return () => { cancelled = true; };
  }, [mobile.accessToken, domainUuid, extension, range]);

  if (err) return <Card accent="gold"><div style={{ fontSize: font.sm, color: colors.mutedSilver }}>{tx('Statistiques de mon poste temporairement indisponibles.', 'My extension stats are temporarily unavailable.')}</div></Card>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
      <Metric label={t('m.myCalls')} value={s?.total} tone="cyan" />
      <Metric label={t('m.myAnswered')} value={s?.answered} tone="success" />
      <Metric label={t('m.myMissed')} value={s?.missed} tone="danger" />
      <Metric label={t('m.myVoicemails')} value={s?.voicemails} tone="gold" />
      <Metric label={t('m.myRecordings')} value={s?.recordings} tone="violet" />
      <Metric label={t('m.myAvgDuration')} value={s != null ? `${s.avgSec}s` : undefined} tone="cyan" />
    </div>
  );
}

function DirectionDonut({ inbound, outbound }: { inbound?: number; outbound?: number }) {
  const { t } = useT();
  const i = inbound ?? 0; const o = outbound ?? 0; const tot = i + o;
  const ratio = tot > 0 ? i / tot : 0;
  const size = 84; const stroke = 11; const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <Card padded={true} style={{
      padding: 14, position: 'relative', overflow: 'hidden',
      background: `linear-gradient(150deg, rgba(23,198,204,0.16), ${colors.graphite} 78%)`,
      border: '1px solid rgba(23,198,204,0.28)',
    }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1.6, color: colors.avaCyan, textTransform: 'uppercase' }}>{t('m.direction')}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
          <circle cx={size/2} cy={size/2} r={r} stroke={`${colors.signalGold}55`} strokeWidth={stroke} fill="none" />
          <circle cx={size/2} cy={size/2} r={r} stroke={colors.avaCyan} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${circ*ratio} ${circ}`} style={{ transition: 'stroke-dasharray 600ms ease' }} />
        </svg>
        <div style={{ flex: 1, minWidth: 0, fontSize: 11, fontWeight: 700, color: colors.textIce }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: colors.avaCyan }} />
            <span>{t('m.inbound')}</span>
            <span style={{ marginLeft: 'auto', fontFamily: 'JetBrains Mono, monospace' }}>{inbound != null ? i : '·'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: colors.signalGold }} />
            <span>{t('m.outboundLong')}</span>
            <span style={{ marginLeft: 'auto', fontFamily: 'JetBrains Mono, monospace' }}>{outbound != null ? o : '·'}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function TalkTimeGauge({ totalSec, avgSec }: { totalSec?: number; avgSec?: number }) {
  const { t } = useT();
  const total = totalSec ?? 0;
  const targetH = 8; const targetSec = targetH * 3600;
  const pct = Math.min(100, (total / targetSec) * 100);
  return (
    <Card padded={true} style={{
      padding: 14, position: 'relative', overflow: 'hidden',
      background: `linear-gradient(150deg, rgba(106,77,255,0.18), ${colors.graphite} 78%)`,
      border: '1px solid rgba(106,77,255,0.28)',
    }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1.6, color: colors.avaViolet, textTransform: 'uppercase' }}>{t('m.talkTime')}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: colors.textIce, marginTop: 6, fontFamily: 'JetBrains Mono, monospace', letterSpacing: -0.5 }}>
        {totalSec != null ? fmtTalk(total) : <Skeleton w={50} h={22} />}
      </div>
      <div style={{ fontSize: 10, color: colors.mutedSilver, marginTop: 2, fontWeight: 700 }}>
        {t('m.avg')} {avgSec != null ? `${avgSec}s` : '—'} · {t('m.target')} {targetH}h
      </div>
      <div style={{ marginTop: 10, height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${colors.avaViolet}, ${colors.avaCyan})`, borderRadius: 999, transition: 'width 600ms ease' }} />
      </div>
    </Card>
  );
}
