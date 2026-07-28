/**
 * SIP Debug screen — dedicated view of the SIP register lifecycle.
 *
 * Shows:
 *  - a stepper: idle → connecting → registered (or error / retrying)
 *  - live indicator + last failure reason
 *  - filtered timeline of recent SIP / JsSIP events
 *  - actions: re-register, clear log, copy log
 *
 * Accessible from the More tab → Diagnostics SIP.
 */
import React, { useMemo } from 'react';
import { colors, font } from '../lib/theme';
import { Card, SectionTitle, SettingsRow } from '../components/ui/Primitives';
import type { SipLogEntry } from '../lib/sip/sipPersistence';
import type { SIPStatus } from '../hooks/useSoftphone';
import { useT } from '../lib/i18n';

const STEPS: SIPStatus[] = ['idle', 'connecting', 'registered'];

const KEEP = new Set([
  'status.transition',
  'register.ok',
  'register.failed',
  'register.timeout',
  'register.unregistered',
  'register.re-check',
  'register.re-check.failed',
  'register.silent-reattempt',
  'ws.connected',
  'ws.disconnected',
  'session.failed',
  'session.ended',
  'session.confirmed',
  'session.new',
  'call.establishment-failed',
  'call.retry-timeout',
  'call.retry-488',
  'call.established',
  'reconnect.manual',
  'reconnect.auto',
  'reconnect.auto.failed',
  'probe.ok',
  'probe.fail',
  'sdp.fallback-rewritten',
  'verto.connecting',
  'verto.registered',
  'verto.error',
  'verto.disconnected',
  'verto.incoming',
  'verto.reconnect',
  'verto.call.error',
  'verto.native.status',
  'verto.native.poll',
  'verto.native.error',
  'verto.disconnected.native-held',
  'verto.app.background.native-hold',
  'verto.app.foreground.sync',
]);

function pad(n: number, l = 2) { return String(n).padStart(l, '0'); }
function fmtTime(t: number) {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function statusColor(s: SIPStatus) {
  if (s === 'registered') return colors.success || '#22c55e';
  if (s === 'connecting' || s === 'retrying') return '#f59e0b';
  if (s === 'error') return colors.danger || '#ef4444';
  return colors.mutedSilver || '#64748b';
}

export default function SipDebugScreen({ sp }: { sp: any }) {
  const { lang } = useT();
  const tx = (fr: string, en: string) => (lang === 'fr' ? fr : en);

  const status: SIPStatus = (sp?.snap?.status as SIPStatus) || (sp?.sipStatus as SIPStatus) || 'idle';
  const lastError: string | null = sp?.snap?.error || sp?.sipError || sp?.lastPersistedError?.error || null;
  const wss: string | undefined = sp?.sipConfig?.wssUrl;
  const provider: string = sp?.sipProvider || 'jssip-wss';
  const platform: string = sp?.platform || 'unknown';
  const extension: string | undefined = sp?.sipConfig?.extension;
  const domain: string | undefined = sp?.sipConfig?.domain;
  const rawLog: SipLogEntry[] = sp?.sipLog || [];
  const nativeStatus = sp?.androidSipServiceStatus || sp?.snap?.androidSipServiceStatus || null;

  const events = useMemo(
    () => rawLog.filter((e) => KEEP.has(e.event)).slice(-200).reverse(),
    [rawLog],
  );

  const activeIdx = STEPS.indexOf(status);
  const isRetrying = status === 'retrying';
  const isError = status === 'error';

  const copyLog = async () => {
    const text = rawLog
      .map((e) => `${new Date(e.time).toISOString()} [${e.level}] ${e.event}${e.detail ? ' — ' + e.detail : ''}`)
      .join('\n');
    try { await navigator.clipboard.writeText(text || ''); alert(tx('Copié.', 'Copied.')); }
    catch { alert(tx('Échec de la copie', 'Copy failed')); }
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '14px 14px 24px' }}>
      {/* Live status card */}
      <Card padded={true} accent="gold" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: 12, height: 12, borderRadius: 999,
            background: statusColor(status),
            boxShadow: `0 0 10px ${statusColor(status)}`,
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: font.md, fontWeight: 800, color: colors.textIce }}>
              SIP · {status}
            </div>
            <div style={{ fontSize: font.xs, color: colors.mutedSilver, marginTop: 2, fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {provider} · {platform} · {extension || '—'}@{domain || '—'}
            </div>
            <div style={{ fontSize: font.xs, color: colors.mutedSilver, marginTop: 2, fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {wss || tx('Credentials SIP incomplets', 'SIP credentials incomplete')}
            </div>
          </div>
        </div>

        {/* Stepper idle → connecting → registered */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14 }}>
          {STEPS.map((s, i) => {
            const active = i <= activeIdx && activeIdx >= 0;
            const dotColor = isError ? colors.danger : active ? statusColor(s) : '#334155';
            return (
              <React.Fragment key={s}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 10, height: 10, borderRadius: 999,
                    background: dotColor,
                    boxShadow: active && !isError ? `0 0 8px ${dotColor}` : 'none',
                  }} />
                  <span style={{ fontSize: 11, color: active ? colors.textIce : colors.mutedSilver, fontWeight: active ? 700 : 500 }}>
                    {s}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <span style={{
                    flex: 1, height: 2, borderRadius: 2,
                    background: i < activeIdx ? statusColor('registered') : '#1e293b',
                  }} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {(isRetrying || isError || lastError) && (
          <div style={{
            marginTop: 12, padding: '8px 10px', borderRadius: 8,
            background: `${isError ? colors.danger : '#f59e0b'}1a`,
            border: `1px solid ${(isError ? colors.danger : '#f59e0b')}55`,
            fontSize: 12, color: colors.textIce,
          }}>
            {isRetrying && (
              <div style={{ marginBottom: lastError ? 4 : 0 }}>
                {tx('Nouvelle tentative en cours…', 'Retrying registration…')}
                {typeof sp?.retryAttempt === 'number' && sp.retryAttempt > 0 ? ` (#${sp.retryAttempt})` : ''}
              </div>
            )}
            {lastError && (
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                {lastError}
              </div>
            )}
          </div>
        )}
      </Card>

      {platform === 'android' && (
        <>
          <SectionTitle eyebrow="ANDROID" title={tx('Service natif background', 'Native background service')} />
          <Card padded={false} style={{ marginBottom: 14 }}>
            <SettingsRow label={tx('Statut natif', 'Native status')} icon="◆" value={nativeStatus?.status || 'unknown'} />
            <SettingsRow label={tx('Dernière raison', 'Last reason')} icon="!" value={nativeStatus?.reason || '—'} />
            <SettingsRow label="WakeLock" icon="◉" value={nativeStatus?.wakeLockHeld ? 'held' : 'not held'} />
            <SettingsRow label="WifiLock" icon="≋" value={nativeStatus?.wifiLockHeld ? 'held' : 'not held'} />
            <SettingsRow label={tx('Dernier login', 'Last login')} icon="✓" value={nativeStatus?.lastLoginAt ? new Date(nativeStatus.lastLoginAt).toLocaleTimeString() : '—'} />
            <SettingsRow label={tx('Dernier ping', 'Last ping')} icon="↔" value={nativeStatus?.lastPingAt ? new Date(nativeStatus.lastPingAt).toLocaleTimeString() : '—'} />
            <SettingsRow label={tx('Tentatives', 'Attempts')} icon="#" value={String(nativeStatus?.reconnectAttempt ?? 0)} />
          </Card>
        </>
      )}

      {/* Actions */}
      <SectionTitle eyebrow="SIP" title={tx('Actions', 'Actions')} />
      <Card padded={false}>
        <SettingsRow
          label={tx("Relancer l'enregistrement", 'Re-register')}
          icon="↻"
          onPress={() => sp?.reconnect?.()}
        />
        <SettingsRow
          label={tx('Copier le journal', 'Copy log')}
          icon="⧉"
          onPress={copyLog}
        />
        <SettingsRow
          label={tx('Vider le journal', 'Clear log')}
          icon="✕"
          onPress={() => sp?.clearSipLog?.()}
        />
      </Card>

      {/* Timeline */}
      <SectionTitle
        eyebrow={tx('ÉVÉNEMENTS', 'EVENTS')}
        title={tx('Journal SIP', 'SIP timeline')}
      />
      <Card padded={true}>
        {events.length === 0 ? (
          <div style={{ color: colors.mutedSilver, fontSize: 12, padding: '8px 2px' }}>
            {tx('Aucun événement pour le moment.', 'No events yet.')}
          </div>
        ) : (
          <div style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
            maxHeight: 460, overflowY: 'auto',
          }}>
            {events.map((e, i) => {
              const color =
                e.level === 'error' ? (colors.danger || '#f87171')
                : e.level === 'warn' ? '#fbbf24'
                : e.event === 'status.transition' ? '#38bdf8'
                : e.event === 'register.ok' ? (colors.success || '#22c55e')
                : colors.textIce;
              return (
                <div
                  key={`${e.time}-${i}`}
                  style={{ padding: '4px 0', borderBottom: `1px dashed ${colors.border}`, lineHeight: 1.4 }}
                >
                  <span style={{ color: colors.mutedSilver }}>{fmtTime(e.time)}</span>{' '}
                  <span style={{ color }}>{e.event}</span>
                  {e.detail ? <span style={{ color: colors.textSub }}> — {e.detail}</span> : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div style={{ height: 80 }} />
    </div>
  );
}
