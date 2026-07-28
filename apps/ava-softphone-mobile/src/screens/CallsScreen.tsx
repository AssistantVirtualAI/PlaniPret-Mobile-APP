import React, { useEffect, useMemo, useState, Suspense, lazy } from 'react';
import { ImpactStyle } from '@capacitor/haptics';
import { colors, font, radius, gradients } from '../lib/theme';
import { mobileApi, CallRecord } from '../lib/mobileApi';
import { Card, Chip, SectionTitle, Skeleton, EmptyState, PrimaryButton, GhostButton } from '../components/ui/Primitives';
import CallDetailScreen from './CallDetailScreen';
import Dialpad from '../components/Dialpad';
import VoicemailScreen from './VoicemailScreen';
// Lazy: recordings tab pulls a heavier audio/transcript bundle; load on demand.
const RecordingsScreen = lazy(() => import('./RecordingsScreen'));
import { useRealtimeCDR } from '../hooks/useRealtimeCDR';
import type { Creds } from '../lib/creds';
import { showMobileToast } from '../lib/mobileToast';
import { restGet } from '../lib/mobileSupabase';
import { useTr } from '../lib/i18n';
import { dialNumber } from '../lib/dialNumber';


type SubTab = 'recents' | 'recordings' | 'voicemail' | 'dial';

export default function CallsScreen({ sp, haptic, creds, initialSub, initialFilter }: { sp: any; haptic: (s?: ImpactStyle) => Promise<void>; creds?: Creds | null; initialSub?: SubTab; initialFilter?: 'all' | 'missed' }) {
  const { tr } = useTr();

  const [sub, setSub] = useState<SubTab>(initialSub || 'recents');
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'missed'>(initialFilter || 'all');
  // Sync when parent updates from deep link (notification tap).
  useEffect(() => { if (initialSub) setSub(initialSub); }, [initialSub]);
  useEffect(() => { if (initialFilter) setFilter(initialFilter); }, [initialFilter]);
  const [extFilter, setExtFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [rangeDays, setRangeDays] = useState<7 | 30>(7);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [myExt, setMyExt] = useState<string | null>(null);
  const [domainExtensions, setDomainExtensions] = useState<string[]>([]);
  const [fallbackDomainUuid, setFallbackDomainUuid] = useState<string | null>(null);
  const [number, setNumber] = useState('');
  const [dialError, setDialError] = useState<string | null>(null);
  const [dialDebug, setDialDebug] = useState<string | null>(null);
  const [dialing, setDialing] = useState(false);

  // Real-time CDR via Supabase Realtime (postgres_changes) with automatic
  // 15s polling fallback + visible warning if the realtime channel fails.
  const queryExt = isAdmin && extFilter !== 'all' ? extFilter : null;
  const { calls, transport, warning, dismissWarning } = useRealtimeCDR(creds || null, rangeDays, queryExt);

  // Resolve admin + own extension to scope/filter the History list.
  useEffect(() => {
    let cancelled = false;
    mobileApi.me().then((m) => {
      if (cancelled) return;
      const admin = !!m?.permissions?.admin;
      setIsAdmin(admin);
      setMyExt(m?.extension?.number || null);
      setFallbackDomainUuid(m?.domain?.fusionpbxDomainUuid || m?.organization?.fusionpbxDomainUuid || null);
      if (!admin && m?.extension?.number) setExtFilter(m.extension.number);
    }).catch(() => { if (!cancelled) setIsAdmin(false); });
    return () => { cancelled = true; };
  }, [creds?.accessToken]);

  useEffect(() => {
    const domainUuid = creds?.domainUuid || creds?.fusionpbxDomainUuid || fallbackDomainUuid;
    if (!creds?.accessToken || !domainUuid || !isAdmin) return;
    restGet<{ extension: string }[]>(`/rest/v1/pbx_extensions_directory?select=extension&domain_uuid=eq.${encodeURIComponent(domainUuid)}&enabled=eq.true&order=extension.asc`, creds.accessToken)
      .then((rows) => setDomainExtensions((rows || []).map((r) => String(r.extension)).filter(Boolean)))
      .catch(() => setDomainExtensions([]));
  }, [creds?.accessToken, creds?.domainUuid, creds?.fusionpbxDomainUuid, fallbackDomainUuid, isAdmin]);

  if (selected) return <CallDetailScreen id={selected} onBack={() => setSelected(null)} />;

  const matchExt = (c: CallRecord, ext: string) =>
    c.extension === ext || c.from === ext || c.to === ext;

  const filtered = (calls || []).filter((c) => {
    const statusOk = filter === 'all' ? true : c.status === 'missed';
    if (!statusOk) return false;
    if (isAdmin === false && myExt && !matchExt(c, myExt)) return false;
    if (isAdmin && extFilter !== 'all' && !matchExt(c, extFilter)) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return [c.customer, c.from, c.to, c.extension, c.status, c.direction].filter(Boolean).join(' ').toLowerCase().includes(q);
    }
    return true;
  });

  const extensionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of domainExtensions) set.add(e);
    for (const c of calls || []) if (c.extension) set.add(c.extension);
    if (myExt) set.add(myExt);
    return Array.from(set).sort();
  }, [calls, domainExtensions, myExt]);


  const startCall = async (to: string) => {
    if (!to) return;
    await haptic(ImpactStyle.Medium);
    setDialing(true);
    setDialError(null);
    const stamp = new Date().toISOString();
    try {
      if (sp?.snap?.status !== 'registered' || !sp?.call) {
        const msg = sp?.snap?.error || 'SIP not registered yet — tap Retry on the dialer to reconnect.';
        setDialError(msg);
        setDialDebug(JSON.stringify({ message: msg, sipStatus: sp?.snap?.status, stamp }));
        showMobileToast(msg, 'error');
        return;
      }
      const ok = sp.call(to);
      if (ok === false) {
        const msg = 'Unable to start call via SIP';
        setDialError(msg);
        showMobileToast(msg, 'error');
        return;
      }
      console.info('[AVA keypad] SIP call started', { to, sipStatus: sp?.snap?.status, stamp });
      setDialDebug(`SIP call started · ${stamp}`);
      // NOTE: Do NOT call mobile-calls-start — JsSIP handles the call directly.
      // The FusionPBX originate API lacks permissions and was causing a 403.
    } catch (e: any) {
      const msg = e?.message || 'Unable to start call';
      const detail = { message: msg, status: e?.status, detail: e?.detail, path: e?.path, to, sipStatus: sp?.snap?.status, sipError: sp?.snap?.error, stamp };
      console.error('[AVA keypad] call failed', detail);
      setDialError(msg);
      setDialDebug(JSON.stringify(detail));
      showMobileToast(msg, 'error');
    } finally {
      setDialing(false);
    }
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '14px 14px 20px' }}>
      {warning && (
        <div role="status" style={{
          marginBottom: 10, padding: '10px 12px', borderRadius: 12,
          background: 'rgba(245,158,11,0.12)', border: `1px solid ${colors.warning}55`,
          color: colors.warning, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <span>⚠ {warning}</span>
          <button onClick={dismissWarning} style={{ background: 'transparent', border: 'none', color: colors.warning, cursor: 'pointer', fontSize: 14 }}>×</button>
        </div>
      )}
      <SegmentedControl value={sub} onChange={setSub} tr={tr} />
      {transport === 'realtime' && false /* could surface a "live" pill here */}

      {sub === 'dial' && (
        <div style={{ marginTop: 6 }}>
          <NumberDisplay value={number} placeholder={tr.calls.enterNumber} clearLabel={tr.common.clear} onBackspace={() => { haptic(); setNumber((n) => n.slice(0, -1)); }} onClear={() => setNumber('')} />
          <Dialpad
            onPress={(k) => { haptic(ImpactStyle.Light); setNumber((n) => n + k); }}
            onLongPressZero={() => { haptic(ImpactStyle.Medium); setNumber((n) => n + '+'); }}
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <PrimaryButton onClick={() => startCall(number)} disabled={!number || dialing} style={{ flex: 1 }}>
              {dialing ? `⏳ ${tr.calls.dialing}` : `📞 ${tr.calls.call}`}
            </PrimaryButton>
            <GhostButton tone="cyan" onClick={() => sp?.snap?.status === 'connecting' ? null : haptic()}>
              {sp?.snap?.status === 'registered' ? tr.calls.live : sp?.snap?.status || tr.calls.offline}
            </GhostButton>
          </div>

          {(dialError || dialDebug) && (
            <Card style={{ marginTop: 12 }} accent={dialError ? 'gold' : 'cyan'}>
              {dialError && <div style={{ fontSize: font.sm, color: colors.danger, fontWeight: 800, marginBottom: 6 }}>{tr.calls.keypadError}: {dialError}</div>}
              <div style={{ fontSize: 11, color: colors.mutedSilver, lineHeight: 1.45, wordBreak: 'break-word', fontFamily: 'JetBrains Mono, monospace' }}>
                {dialDebug || `SIP status: ${sp?.snap?.status || 'offline'}`}
              </div>
            </Card>
          )}
          {sp?.snap?.status !== 'registered' && (
            <Card style={{ marginTop: 14 }} accent="gold">
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.4, color: colors.signalGold, textTransform: 'uppercase' }}>{tr.calls.sipNotReg}</div>
              <p style={{ fontSize: font.sm, color: colors.mutedSilver, margin: '6px 0 10px', lineHeight: 1.5 }}>
                {sp?.snap?.error || tr.calls.sipConnecting}
              </p>
              <PrimaryButton onClick={() => sp?.reconnect?.()}>{tr.calls.retryConnect}</PrimaryButton>
            </Card>
          )}
        </div>
      )}


      {sub === 'recordings' && (
        <div style={{ marginTop: 6 }}>
          <Suspense fallback={<ListSkeleton rows={4} />}>
            <RecordingsScreen creds={creds || null} isAdmin={!!isAdmin} myExtension={myExt} rangeDays={rangeDays} onRangeDaysChange={setRangeDays} />
          </Suspense>
        </div>
      )}

      {sub === 'recents' && (
        <>
          <div style={{ display: 'flex', gap: 6, margin: '12px 0 10px' }}>
            {(['all', 'missed'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '6px 12px', borderRadius: 999,
                background: filter === f ? colors.signalGold + '1a' : 'transparent',
                border: `1px solid ${filter === f ? colors.borderGold : colors.border}`,
                color: filter === f ? colors.signalGold : colors.mutedSilver,
                fontSize: 10.5, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer',
              }}>{f === 'all' ? tr.calls.all : tr.calls.missed}</button>
            ))}
          </div>

          {isAdmin && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 2px 10px' }}>
              <label style={{ fontSize: font.xs, color: colors.mutedSilver, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>{tr.calls.extension}</label>
              <select value={extFilter} onChange={(e) => setExtFilter(e.target.value)} style={{ flex: 1, padding: '7px 10px', borderRadius: 10, border: `1px solid ${colors.border}`, background: 'rgba(255,255,255,0.06)', color: colors.textIce, fontSize: 12, fontWeight: 700 }}>
                <option value="all">{tr.calls.allExtensions}</option>
                {myExt && <option value={myExt}>{tr.calls.mine.replace('{ext}', myExt)}</option>}
                {extensionOptions.filter((e) => e !== myExt).map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
          )}
          {isAdmin === false && myExt && (
            <div style={{ fontSize: font.xs, color: colors.mutedSilver, margin: '0 2px 10px' }}>{tr.calls.showingMine.replace('{ext}', myExt)}</div>
          )}

          <div style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '0 2px 10px' }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr.calls.searchPlaceholder} style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 10, border: `1px solid ${colors.border}`, background: 'rgba(255,255,255,0.06)', color: colors.textIce, fontSize: 12, outline: 'none' }} />
            {([7, 30] as const).map((d) => <button key={d} onClick={() => setRangeDays(d)} style={{ padding: '7px 9px', borderRadius: 10, border: `1px solid ${rangeDays === d ? colors.borderGold : colors.border}`, background: rangeDays === d ? colors.signalGold + '1a' : 'rgba(255,255,255,0.04)', color: rangeDays === d ? colors.signalGold : colors.mutedSilver, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>{d}d</button>)}
          </div>


          {!calls && <ListSkeleton rows={6} />}
          {calls && filtered.length === 0 && (
            <EmptyState icon="📞" title={tr.calls.noCalls} hint={tr.calls.noCallsHint} cta={{ label: tr.calls.openDialer, onPress: () => setSub('dial') }} />
          )}

          {calls && filtered.map((c) => <CallRow key={c.id} c={c} onPress={() => { haptic(); setSelected(c.id); }} onCall={(num) => { haptic(ImpactStyle.Medium); dialNumber(sp, num); }} />)}
        </>
      )}

      {sub === 'voicemail' && <div style={{ marginTop: 12 }}><VoicemailScreen haptic={haptic} /></div>}

      <div style={{ height: 80 }} />
    </div>
  );
}

function SegmentedControl({ value, onChange, tr }: { value: SubTab; onChange: (v: SubTab) => void; tr: any }) {
  const items: { id: SubTab; label: string }[] = [
    { id: 'recents', label: tr.calls.history },
    { id: 'recordings', label: tr.calls.recordings },
    { id: 'voicemail', label: tr.calls.voicemail },
    { id: 'dial', label: tr.calls.keypad },
  ];
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 4,
      padding: 4, borderRadius: radius.lg,
      background: 'rgba(255,255,255,0.04)',
      border: `1px solid ${colors.border}`,
    }}>
      {items.map((it) => {
        const active = it.id === value;
        return (
          <button key={it.id} onClick={() => onChange(it.id)} style={{
            padding: '10px 8px', borderRadius: radius.md, border: 'none',
            background: active ? gradients.call : 'transparent',
            color: active ? '#fff' : colors.mutedSilver,
            fontSize: font.sm, fontWeight: 700, cursor: 'pointer',
            transition: 'all .18s ease',
          }}>{it.label}</button>
        );
      })}
    </div>
  );
}

function NumberDisplay({ value, placeholder, clearLabel, onClear, onBackspace }: { value: string; placeholder: string; clearLabel: string; onClear: () => void; onBackspace: () => void }) {
  return (
    <div style={{
      margin: '12px 0 16px', padding: '20px 16px',
      borderRadius: radius.xl,
      background: gradients.card,
      border: `1px solid ${colors.border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      minHeight: 64,
    }}>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: value.length > 10 ? 22 : 28, color: colors.textIce, fontWeight: 600, letterSpacing: 0.5, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value || <span style={{ color: colors.mutedSilver, fontWeight: 400 }}>{placeholder}</span>}
      </span>
      {value && (
        <>
          <button onClick={onBackspace} style={{ background: 'transparent', border: 'none', color: colors.mutedSilver, fontSize: 22, cursor: 'pointer', padding: 4 }}>⌫</button>
          <button onClick={onClear} style={{ background: 'transparent', border: 'none', color: colors.mutedSilver, fontSize: 12, cursor: 'pointer' }}>{clearLabel}</button>
        </>
      )}
    </div>
  );
}


function CallRow({ c, onPress, onCall }: { c: CallRecord; onPress: () => void; onCall: (num: string) => void }) {
  const arrow = c.status === 'missed' ? '↙' : c.direction === 'in' ? '↘' : '↗';
  const arrowColor = c.status === 'missed' ? colors.danger : c.direction === 'in' ? colors.success : colors.avaCyan;
  const callbackNumber = c.direction === 'in' ? c.from : c.to;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
      padding: '10px 12px', marginBottom: 8,
      borderRadius: radius.lg,
      background: gradients.card,
      border: `1px solid ${colors.border}`,
      color: colors.textIce,
    }}>
      <button onClick={onPress} style={{
        flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12,
        background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', textAlign: 'left', padding: 0,
      }}>
        <span style={{ color: arrowColor, fontSize: 18, width: 18, textAlign: 'center' }}>{arrow}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: font.base, fontWeight: 600, color: colors.textIce, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {c.customer || callbackNumber}
          </div>
          <div style={{ fontSize: font.xs, color: colors.mutedSilver, fontFamily: 'JetBrains Mono, monospace', marginTop: 2 }}>
            {callbackNumber}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span style={{ fontSize: font.xs, color: colors.mutedSilver }}>{new Date(c.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {c.hasRecording && <Chip tone="gold" size="xs">REC</Chip>}
            {c.hasTranscript && <Chip tone="violet" size="xs">AI</Chip>}
          </div>
        </div>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); if (callbackNumber) onCall(callbackNumber); }}
        disabled={!callbackNumber}
        aria-label={`Appeler ${callbackNumber || ''}`}
        title={`Appeler ${callbackNumber || ''}`}
        style={{
          width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
          border: 'none', cursor: callbackNumber ? 'pointer' : 'not-allowed',
          background: callbackNumber ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'rgba(255,255,255,0.06)',
          color: '#fff', display: 'grid', placeItems: 'center',
          boxShadow: callbackNumber ? '0 4px 12px rgba(34,197,94,0.35)' : 'none',
        }}
      >
        <span style={{ fontSize: 18 }}>☏</span>
      </button>
    </div>
  );
}

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{
          display: 'grid', gridTemplateColumns: '24px 1fr 60px',
          alignItems: 'center', gap: 12, padding: 14, marginBottom: 8,
          borderRadius: 12, background: gradients.card, border: `1px solid ${colors.border}`,
        }}>
          <Skeleton w={16} h={16} r={999} />
          <div>
            <Skeleton w="55%" h={12} />
            <div style={{ height: 6 }} />
            <Skeleton w="35%" h={10} />
          </div>
          <Skeleton w={40} h={10} />
        </div>
      ))}
    </div>
  );
}
