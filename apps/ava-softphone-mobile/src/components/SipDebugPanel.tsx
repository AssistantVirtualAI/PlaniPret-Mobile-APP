/**
 * Panneau de debug SIP flottant.
 *
 * Affiche en temps réel :
 *  - le sipStatus courant + historique des transitions
 *  - les événements JsSIP filtrables (failed, hangup, timeout-session,
 *    timeout-ice, retry, register.*), avec horodatage HH:MM:SS.mmm
 *
 * Activation :
 *   - localStorage.setItem('sip_debug_panel', '1')   → visible
 *   - localStorage.removeItem('sip_debug_panel')     → caché
 * ou via l'URL : ?sipDebug=1
 *
 * Le panneau se réduit en pastille flottante ; toucher pour ré-ouvrir.
 */
import { useEffect, useMemo, useState } from 'react';
import type { SipLogEntry } from '../lib/sip/sipPersistence';
import type { SIPStatus } from '../hooks/useSoftphone';

type Props = {
  sipStatus: SIPStatus;
  sipLog: SipLogEntry[];
  onClear?: () => void;
};

const DEBUG_EVENT_FILTER = new Set([
  'status.transition',
  'session.failed',
  'session.ended',
  'session.confirmed',
  'session.new',
  'call.establishment-failed',
  'call.retry-timeout',
  'call.retry-488',
  'call.established',
  'register.ok',
  'register.failed',
  'register.timeout',
  'register.unregistered',
  'register.re-check',
  'register.re-check.failed',
  'register.silent-reattempt',
  'ws.connected',
  'ws.disconnected',
  'sdp.fallback-rewritten',
]);

function isPanelEnabled(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const url = new URL(window.location.href);
    if (url.searchParams.get('sipDebug') === '1') {
      window.localStorage.setItem('sip_debug_panel', '1');
    }
    return window.localStorage.getItem('sip_debug_panel') === '1';
  } catch { return false; }
}

function fmtTime(t: number): string {
  const d = new Date(t);
  const pad = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export function SipDebugPanel({ sipStatus, sipLog, onClear }: Props) {
  const [enabled, setEnabled] = useState<boolean>(() => isPanelEnabled());
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const onStorage = () => setEnabled(isPanelEnabled());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const filtered = useMemo(
    () => sipLog.filter((e) => DEBUG_EVENT_FILTER.has(e.event)).slice(-80).reverse(),
    [sipLog],
  );

  if (!enabled) return null;

  const statusColor =
    sipStatus === 'registered' ? '#22c55e'
    : sipStatus === 'connecting' || sipStatus === 'retrying' ? '#f59e0b'
    : sipStatus === 'error' ? '#ef4444'
    : '#64748b';

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        aria-label="Ouvrir le panneau de debug SIP"
        style={{
          position: 'fixed', bottom: 90, right: 12, zIndex: 9999,
          background: '#0f172a', color: statusColor, border: `1px solid ${statusColor}`,
          borderRadius: 999, padding: '6px 10px', fontSize: 11, fontFamily: 'monospace',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}
      >
        SIP · {sipStatus}
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed', bottom: 90, right: 12, zIndex: 9999,
        width: 320, maxHeight: 380, background: 'rgba(15,23,42,0.96)',
        color: '#e2e8f0', border: '1px solid #334155', borderRadius: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)', fontFamily: 'monospace', fontSize: 11,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 10px', background: '#1e293b', borderBottom: '1px solid #334155',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: statusColor }} />
          <strong style={{ fontSize: 11 }}>SIP debug</strong>
          <span style={{ color: statusColor }}>{sipStatus}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {onClear && (
            <button
              onClick={onClear}
              style={{ background: 'transparent', color: '#94a3b8', border: '1px solid #475569', borderRadius: 6, padding: '2px 6px', fontSize: 10 }}
            >clear</button>
          )}
          <button
            onClick={() => setCollapsed(true)}
            style={{ background: 'transparent', color: '#94a3b8', border: '1px solid #475569', borderRadius: 6, padding: '2px 8px', fontSize: 10 }}
          >_</button>
        </div>
      </div>
      <div style={{ overflowY: 'auto', padding: '4px 8px' }}>
        {filtered.length === 0 && (
          <div style={{ color: '#64748b', padding: '10px 0' }}>Aucun événement encore.</div>
        )}
        {filtered.map((e, i) => {
          const color =
            e.level === 'error' ? '#f87171'
            : e.level === 'warn' ? '#fbbf24'
            : e.event === 'status.transition' ? '#38bdf8'
            : '#cbd5e1';
          return (
            <div key={`${e.time}-${i}`} style={{ padding: '2px 0', borderBottom: '1px dashed #1e293b', lineHeight: 1.35 }}>
              <span style={{ color: '#64748b' }}>{fmtTime(e.time)}</span>{' '}
              <span style={{ color }}>{e.event}</span>
              {e.detail ? <span style={{ color: '#94a3b8' }}> — {e.detail}</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SipDebugPanel;
