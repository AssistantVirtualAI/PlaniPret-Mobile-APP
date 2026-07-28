/**
 * "État natif" panel: surfaces the live state of the CapacitorPjsip plugin
 * (presence, registration status, last error, last events) so users no longer
 * have to guess why the UI is "connecting" forever.
 */
import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  subscribeNativeSip,
  startNativeSipTracking,
  type NativeSipSnapshot,
} from '../../lib/sip/nativeSipState';
import { forceNativeReconnect } from '../../hooks/useSoftphoneNative';
import { colors } from '../../lib/theme';

function fmtTime(t: number) {
  return new Date(t).toISOString().substring(11, 19);
}

function statusColor(s: NativeSipSnapshot['regStatus']) {
  if (s === 'registered') return '#16a34a';
  if (s === 'error') return colors.danger;
  if (s === 'connecting') return '#f59e0b';
  return '#64748b';
}

export default function NativeStatePanel() {
  const [snap, setSnap] = useState<NativeSipSnapshot | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    startNativeSipTracking();
    return subscribeNativeSip(setSnap);
  }, []);

  if (!snap) return null;

  const reconnect = async () => {
    setBusy(true);
    try {
      // Delegate to the single source of truth (useSoftphoneNative). This
      // avoids the panel triggering a second parallel initAccount, which
      // caused duplicate SIP registrations on FusionPBX.
      await forceNativeReconnect();
    } catch {
      // error already piped into snapshot via plugin event
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={panel}>
      <div style={header}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>État natif</span>
        <span style={{ ...dot, background: statusColor(snap.regStatus) }} />
        <span style={{ fontSize: 12, color: colors.textSub }}>{snap.regStatus}</span>
      </div>

      <div style={row}>
        <span style={lbl}>Plugin</span>
        <span style={val}>
          {snap.pluginAvailable ? '✓ chargé' : '✗ absent'}
          <span style={{ color: colors.textSub, marginLeft: 6 }}>
            ({snap.pluginName}, {Capacitor.getPlatform()})
          </span>
        </span>
      </div>

      {snap.lastError && (
        <div style={errBox}>
          <strong>Erreur :</strong> {snap.lastError}
        </div>
      )}

      <div style={{ ...row, alignItems: 'flex-start' }}>
        <span style={lbl}>Dernier événement</span>
        <span style={{ ...val, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
          {snap.lastEvent
            ? `${fmtTime(snap.lastEvent.at)} ${snap.lastEvent.name} ${JSON.stringify(snap.lastEvent.data ?? {}).slice(0, 120)}`
            : '—'}
        </span>
      </div>

      <button onClick={reconnect} disabled={busy || !snap.pluginAvailable} style={btn}>
        {busy ? 'Reconnexion…' : 'Reconnecter maintenant'}
      </button>

      {snap.events.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 11, color: colors.textSub, cursor: 'pointer' }}>
            Journal natif ({snap.events.length})
          </summary>
          <div style={log}>
            {snap.events.map((e, i) => (
              <div key={i} style={logRow}>
                <span style={{ color: colors.textSub }}>{fmtTime(e.at)}</span>{' '}
                <span style={{ color: '#93c5fd' }}>{e.name}</span>{' '}
                <span>{JSON.stringify(e.data ?? {}).slice(0, 160)}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

const panel: React.CSSProperties = {
  marginTop: 16, padding: 12, borderRadius: 12,
  background: 'rgba(255,255,255,0.03)',
  border: `1px solid ${colors.border}`, display: 'flex', flexDirection: 'column', gap: 8,
};
const header: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 };
const dot: React.CSSProperties = { width: 8, height: 8, borderRadius: 999, display: 'inline-block' };
const row: React.CSSProperties = { display: 'flex', gap: 8, fontSize: 12, justifyContent: 'space-between' };
const lbl: React.CSSProperties = { color: colors.textSub, flexShrink: 0 };
const val: React.CSSProperties = { color: colors.textIce, textAlign: 'right', wordBreak: 'break-all' };
const errBox: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 8, fontSize: 12,
  background: `${colors.danger}1f`, color: colors.danger, border: `1px solid ${colors.danger}4d`,
};
const btn: React.CSSProperties = {
  height: 36, borderRadius: 10, border: `1px solid ${colors.border}`,
  background: colors.graphite, color: colors.textIce, fontSize: 13, cursor: 'pointer',
};
const log: React.CSSProperties = {
  marginTop: 6, maxHeight: 140, overflowY: 'auto',
  background: 'rgba(0,0,0,0.3)', padding: 6, borderRadius: 8,
  fontFamily: 'ui-monospace, monospace', fontSize: 10, lineHeight: 1.4,
};
const logRow: React.CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
