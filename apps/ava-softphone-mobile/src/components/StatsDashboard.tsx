import React, { useEffect, useMemo, useRef, useState } from 'react';
import { colors, font, radius } from '../lib/theme';
import { Card, Chip, SectionTitle, Skeleton } from './ui/Primitives';
import { mobileApi, CallRecord, RecordingEntry, VoicemailEntry, SmsThread, HomeStatsResponse, HomeStatsPayload, emptyHomeStats } from '../lib/mobileApi';

type Period = 'today' | 'week' | 'month';

function fmtDuration(sec: number): string {
  if (!sec || sec < 60) return `${Math.max(0, Math.round(sec))}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function detectLang(): 'fr' | 'en' {
  try {
    const l = (localStorage.getItem('ava.lang') || navigator.language || 'fr').toLowerCase();
    return l.startsWith('en') ? 'en' : 'fr';
  } catch { return 'fr'; }
}

const L = {
  fr: {
    eyebrow: 'Tableau de bord', title: "Vue d'ensemble",
    received: 'Reçus', missed: 'Manqués', outbound: 'Sortants', avg: 'Durée moy.',
    unread: 'SMS non lus', vmNew: 'Msgrie nouv.', vmTotal: 'Msgrie tot.',
    recordings: 'Enregistrements', transcribed: 'transcrits', pending: 'en attente',
    today: "Aujourd'hui", week: 'Semaine', month: 'Mois',
    summary: 'Résumé AVA',
  },
  en: {
    eyebrow: 'Dashboard', title: 'Overview',
    received: 'Answered', missed: 'Missed', outbound: 'Outbound', avg: 'Avg duration',
    unread: 'Unread SMS', vmNew: 'New voicemail', vmTotal: 'Total voicemail',
    recordings: 'Recordings', transcribed: 'transcribed', pending: 'pending',
    today: 'Today', week: 'Week', month: 'Month',
    summary: 'AVA summary',
  },
} as const;

// Cache AI summary per period so we don't re-hit the AI on every open/focus.
const summaryCache = new Map<string, { text: string; at: number }>();
const CACHE_TTL_MS = 5 * 60_000;

export default function StatsDashboard() {
  const [period, setPeriod] = useState<Period>('today');
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<HomeStatsResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const lang = useMemo(detectLang, []);
  const t = L[lang];
  const inflight = useRef(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (inflight.current) return;
      inflight.current = true;
      setErr(null);
      const cacheKey = `${period}:${lang}`;
      const cached = summaryCache.get(cacheKey);
      const fresh = cached && Date.now() - cached.at < CACHE_TTL_MS;
      try {
        const res = await mobileApi.homeStats(period, lang);
        if (!alive) return;
        // Preserve cached AI summary for the period if the server returned empty.
        if (fresh && !res.summary) res.summary = cached!.text;
        if (res.summary) summaryCache.set(cacheKey, { text: res.summary, at: Date.now() });
        setPayload(res);
      } catch (e: any) {
        if (!alive) return;
        // Fallback: client-side aggregation using existing endpoints.
        try {
          const [c, r, v, th] = await Promise.all([
            mobileApi.calls({ rangeDays: 30, limit: 500 }).catch(() => [] as CallRecord[]),
            mobileApi.recordings(undefined, { rangeDays: 30 }).catch(() => [] as RecordingEntry[]),
            mobileApi.voicemails().catch(() => [] as VoicemailEntry[]),
            mobileApi.threads().catch(() => [] as SmsThread[]),
          ]);
          if (!alive) return;
          setPayload({
            period, lang, scope: { organizationId: null, extension: null },
            stats: aggregateClient(period, c, th, r, v),
            prior: emptyHomeStats(), summary: '', insights: [],
          });
          setErr(e?.message || null);
        } catch (e2: any) {
          if (alive) setErr(e2?.message || 'Erreur de chargement');
        }
      } finally {
        if (alive) setLoading(false);
        inflight.current = false;
      }
    };
    setLoading(true);
    load();
    const iv = window.setInterval(load, 60_000);
    const onCallEnded = () => load();
    window.addEventListener('ava:callEnded', onCallEnded as EventListener);
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      window.clearInterval(iv);
      window.removeEventListener('ava:callEnded', onCallEnded as EventListener);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [period, lang]);

  const stats = payload?.stats || emptyHomeStats();
  const insights = payload?.insights || [];
  const summary = payload?.summary || '';

  return (
    <>
      <SectionTitle
        eyebrow={t.eyebrow}
        title={t.title}
        right={<PeriodToggle value={period} onChange={setPeriod} labels={{ today: t.today, week: t.week, month: t.month }} />}
      />
      {err && (
        <Card padded={true} style={{ marginBottom: 10, background: 'rgba(255,90,90,0.10)', border: '1px solid rgba(255,90,90,0.3)' }}>
          <span style={{ color: colors.danger, fontSize: font.sm }}>{err}</span>
        </Card>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        <StatCard label={t.received} value={stats.calls.received} tone="success" icon="↘" loading={loading} />
        <StatCard label={t.missed} value={stats.calls.missed} tone="danger" icon="✕" loading={loading} />
        <StatCard label={t.outbound} value={stats.calls.outbound} tone="cyan" icon="↗" loading={loading} />
        <StatCard label={t.avg} value={fmtDuration(stats.calls.avgDurationSec)} tone="violet" icon="⏱" loading={loading} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 10 }}>
        <MiniStat label={t.unread} value={stats.sms.unread} tone="cyan" loading={loading} />
        <MiniStat label={t.vmNew} value={stats.voicemails.new} tone="gold" loading={loading} />
        <MiniStat label={t.vmTotal} value={stats.voicemails.total} tone="gold" loading={loading} />
      </div>

      <Card padded={true} style={{ marginTop: 10, background: 'linear-gradient(155deg, rgba(23,198,204,0.10), rgba(255,255,255,0.03))', border: '1px solid rgba(23,198,204,0.24)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1.6, color: colors.avaCyan, textTransform: 'uppercase' }}>{t.recordings}</div>
          <div style={{ fontSize: font.lg, fontWeight: 800, color: colors.textIce, fontFamily: 'JetBrains Mono, monospace' }}>
            {loading ? <Skeleton w={30} h={18} /> : stats.recordings.total}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Chip tone="cyan">{stats.recordings.transcribed} {t.transcribed}</Chip>
          <Chip tone="gold">{stats.recordings.pending} {t.pending}</Chip>
        </div>
      </Card>

      {(summary || loading) && (
        <Card padded={true} style={{ marginTop: 10, background: 'linear-gradient(155deg, rgba(140,120,255,0.12), rgba(255,255,255,0.03))', border: '1px solid rgba(140,120,255,0.28)' }}>
          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1.6, color: colors.avaViolet, textTransform: 'uppercase', marginBottom: 6 }}>{t.summary}</div>
          {loading && !summary ? <Skeleton w={220} h={14} /> : (
            <div style={{ fontSize: font.sm, color: colors.textIce, lineHeight: 1.45 }}>{summary}</div>
          )}
        </Card>
      )}

      {insights.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          {insights.map((i) => (
            <InsightCard key={i.id} tone={i.tone} text={i.text} />
          ))}
        </div>
      )}
    </>
  );
}

function aggregateClient(period: Period, calls: CallRecord[], threads: SmsThread[], recs: RecordingEntry[], vms: VoicemailEntry[]): HomeStatsPayload {
  const cutoff = period === 'today'
    ? (() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); })()
    : period === 'week' ? Date.now() - 7*86400_000 : Date.now() - 30*86400_000;
  const inRange = (iso?: string) => (iso ? new Date(iso).getTime() : 0) >= cutoff;
  const cs = calls.filter((c) => inRange(c.startedAt));
  const received = cs.filter((c) => c.direction === 'in' && c.status === 'answered').length;
  const missed = cs.filter((c) => c.status === 'missed').length;
  const outbound = cs.filter((c) => c.direction === 'out').length;
  const durs = cs.filter((c) => c.durationSec > 0).map((c) => c.durationSec);
  const avg = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : 0;
  const rs = recs.filter((r) => inRange(r.startedAt));
  const transcribed = rs.filter((r) => r.hasTranscript).length;
  const vs = vms.filter((v) => inRange(v.receivedAt));
  const smsUnread = threads.reduce((s, tr) => s + (tr.unread || 0), 0);
  return {
    calls: { received, missed, outbound, avgDurationSec: avg },
    sms: { unread: smsUnread, activeThreads: threads.length },
    recordings: { total: rs.length, transcribed, pending: Math.max(0, rs.length - transcribed), failed: 0 },
    voicemails: { new: vs.filter((v) => v.isNew).length, total: vs.length },
  };
}

function PeriodToggle({ value, onChange, labels }: { value: Period; onChange: (p: Period) => void; labels: { today: string; week: string; month: string } }) {
  const opts: { k: Period; label: string }[] = [
    { k: 'today', label: labels.today },
    { k: 'week', label: labels.week },
    { k: 'month', label: labels.month },
  ];
  return (
    <div style={{ display: 'inline-flex', gap: 2, padding: 2, borderRadius: 999, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}>
      {opts.map((o) => {
        const active = o.k === value;
        return (
          <button
            key={o.k}
            onClick={() => onChange(o.k)}
            style={{
              padding: '5px 10px', borderRadius: 999, border: 0, cursor: 'pointer',
              fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4,
              background: active ? colors.avaCyan : 'transparent',
              color: active ? '#001018' : colors.textSub,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
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

function StatCard({ label, value, tone, icon, loading }: { label: string; value: number | string; tone: 'success' | 'danger' | 'cyan' | 'gold' | 'violet'; icon: string; loading?: boolean }) {
  const c = toneColor(tone);
  return (
    <Card padded={true} style={{
      padding: 14,
      background: `linear-gradient(155deg, ${c}1f, ${colors.graphite} 75%)`,
      border: `1px solid ${c}33`, position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1.6, color: c, textTransform: 'uppercase' }}>{label}</div>
        <div style={{ width: 22, height: 22, borderRadius: 8, display: 'grid', placeItems: 'center', background: `${c}26`, color: c, fontSize: 12, fontWeight: 900 }}>{icon}</div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: colors.textIce, marginTop: 6, fontFamily: 'JetBrains Mono, monospace', letterSpacing: -0.5 }}>
        {loading ? <Skeleton w={50} h={22} /> : value}
      </div>
    </Card>
  );
}

function MiniStat({ label, value, tone, loading }: { label: string; value: number; tone: 'cyan' | 'gold' | 'violet'; loading?: boolean }) {
  const c = toneColor(tone);
  return (
    <div style={{ padding: '10px 10px', borderRadius: radius.lg, background: `${c}14`, border: `1px solid ${c}30` }}>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.2, color: c, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: colors.textIce, marginTop: 4, fontFamily: 'JetBrains Mono, monospace' }}>
        {loading ? <Skeleton w={30} h={16} /> : value}
      </div>
    </div>
  );
}

function InsightCard({ tone, text }: { tone: 'danger' | 'success' | 'cyan' | 'gold'; text: string }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  const c = toneColor(tone === 'success' ? 'success' : tone);
  return (
    <div style={{
      padding: '10px 12px', borderRadius: radius.lg, background: `${c}14`, border: `1px solid ${c}33`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    }}>
      <span style={{ fontSize: font.sm, color: colors.textIce, lineHeight: 1.4 }}>{text}</span>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        style={{ border: 0, background: 'transparent', color: colors.textSub, cursor: 'pointer', fontSize: 14, padding: 4 }}
      >×</button>
    </div>
  );
}
