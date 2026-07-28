import { useEffect, useRef, useState } from 'react';
import {
  onIceDiagnostic,
  isIceDiagOverlayEnabled,
  getActivePcConfig,
  getActiveTurnProvider,
  type IceDiagnosticEvent,
} from '../lib/sip/rtcConfig';

/**
 * Floating diagnostic panel for iOS WebRTC debugging.
 * Visible only when localStorage['sip:iceDiag']='1', ?iceDiag=1,
 * or SIP debug mode is on. Shows the live ICE state, the last 5
 * candidates with their source, and a "Copier diagnostic" button
 * that exports the full state as a shareable text block.
 */
export default function IceDiagnosticsOverlay() {
  const [show, setShow] = useState(false);
  const [iceState, setIceState] = useState<string>('—');
  const [gatherState, setGatherState] = useState<string>('—');
  const [provider, setProvider] = useState<string>('—');
  const [probe, setProbe] = useState<string>('—');
  const [probeMs, setProbeMs] = useState<number | null>(null);
  const [firstRelayMs, setFirstRelayMs] = useState<number | null>(null);
  const [connectedMs, setConnectedMs] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<{ source: string; raw: string; t: number }[]>([]);
  const [mdnsCount, setMdnsCount] = useState(0);
  const [errors, setErrors] = useState<{ where: string; message: string; t: number }[]>([]);
  const [fallback, setFallback] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setShow(isIceDiagOverlayEnabled());
    setProvider(getActiveTurnProvider());

    const off = onIceDiagnostic((e: IceDiagnosticEvent) => {
      if (e.kind === 'ice-state') setIceState(e.state);
      else if (e.kind === 'gather-state') setGatherState(e.state);
      else if (e.kind === 'pc-config') setProvider(e.provider);
      else if (e.kind === 'probe-result') {
        setProbe(`${e.provider}${e.relayFound ? ' ✓' : ' ✗'}`);
        setProbeMs(e.durationMs);
      } else if (e.kind === 'first-relay-candidate') setFirstRelayMs(e.latencyMs);
      else if (e.kind === 'ice-connected') setConnectedMs(e.latencyMs);
      else if (e.kind === 'candidate') {
        setCandidates((prev) => [{ source: e.source, raw: e.raw, t: Date.now() }, ...prev].slice(0, 5));
      } else if (e.kind === 'mdns-candidate') setMdnsCount((n) => n + 1);
      else if (e.kind === 'webrtc-error') {
        setErrors((prev) => [{ where: e.where, message: e.message, t: Date.now() }, ...prev].slice(0, 5));
      } else if (e.kind === 'ice-fallback') {
        setFallback(`${e.from} → ${e.to} (${e.reason})`);
      }
    });
    return () => { off(); if (copyTimerRef.current) clearTimeout(copyTimerRef.current); };
  }, []);

  if (!show) return null;

  const color =
    iceState === 'connected' || iceState === 'completed' ? '#22c55e'
    : iceState === 'failed' ? '#ef4444'
    : iceState === 'disconnected' ? '#f59e0b'
    : '#94a3b8';

  const buildReport = () => {
    const cfg = getActivePcConfig();
    const lines = [
      '=== SIP / ICE diagnostic ===',
      `time     : ${new Date().toISOString()}`,
      `ua       : ${typeof navigator !== 'undefined' ? navigator.userAgent : '—'}`,
      `provider : ${provider}`,
      `probe    : ${probe} (${probeMs ?? '—'} ms)`,
      `ice      : ${iceState}`,
      `gather   : ${gatherState}`,
      `first relay candidate: ${firstRelayMs ?? '—'} ms`,
      `ice connected       : ${connectedMs ?? '—'} ms`,
      `mdns candidates     : ${mdnsCount}`,
      `fallback            : ${fallback ?? '—'}`,
      `iceServers (${cfg.iceServers?.length ?? 0}):`,
      ...(cfg.iceServers ?? []).map((s, i) => `  [${i}] ${Array.isArray(s.urls) ? s.urls.join(', ') : s.urls}`),
      '--- recent candidates ---',
      ...(candidates.length ? candidates.map((c) => `  ${c.source}  ${c.raw}`) : ['  (none yet)']),
      '--- recent errors ---',
      ...(errors.length ? errors.map((er) => `  [${er.where}] ${er.message}`) : ['  (none)']),
    ];
    return lines.join('\n');
  };

  const handleCopy = async (ev: React.MouseEvent) => {
    ev.stopPropagation();
    const text = buildReport();
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      // Last resort: dump to console so the user can copy from devtools.
      console.log(text);
      setCopied(true);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', bottom: 88, right: 8, zIndex: 9999,
        background: 'rgba(4,11,22,0.92)', color: '#e2e8f0',
        border: '1px solid #1e293b', borderRadius: 12, padding: 10,
        font: '11px/1.35 ui-monospace, SFMono-Regular, monospace',
        maxWidth: collapsed ? 180 : 320, boxShadow: '0 8px 24px rgba(0,0,0,.4)',
      }}
      onClick={() => setCollapsed((c) => !c)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: collapsed ? 0 : 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: 8, background: color, display: 'inline-block' }} />
        <strong style={{ color: '#f8fafc' }}>ICE</strong>
        <span style={{ color }}>{iceState}</span>
        <span style={{ color: '#64748b', marginLeft: 'auto' }}>{collapsed ? '▸' : '▾'}</span>
      </div>
      {!collapsed && (
        <>
          <div>gather: <span style={{ color: '#cbd5e1' }}>{gatherState}</span></div>
          <div>provider: <span style={{ color: '#cbd5e1' }}>{provider}</span></div>
          <div>probe: <span style={{ color: '#cbd5e1' }}>{probe} {probeMs != null && `(${probeMs}ms)`}</span></div>
          <div>1st relay: <span style={{ color: '#cbd5e1' }}>{firstRelayMs != null ? `${firstRelayMs}ms` : '—'}</span></div>
          <div>connected: <span style={{ color: '#cbd5e1' }}>{connectedMs != null ? `${connectedMs}ms` : '—'}</span></div>
          <div>mDNS: <span style={{ color: mdnsCount > 0 ? '#f59e0b' : '#cbd5e1' }}>{mdnsCount > 0 ? `${mdnsCount} (.local — iOS WKWebView)` : '0'}</span></div>
          {fallback && <div style={{ color: '#f59e0b' }}>fallback: {fallback}</div>}
          {errors.length > 0 && (
            <div style={{ marginTop: 4, color: '#ef4444' }}>
              ⚠ {errors[0].where}: {errors[0].message.slice(0, 80)}
            </div>
          )}
          <div style={{ marginTop: 6, color: '#64748b' }}>candidates (5 recent)</div>
          {candidates.length === 0 && <div style={{ color: '#475569' }}>—</div>}
          {candidates.map((c, i) => (
            <div key={i} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span style={{ color: c.source.startsWith('TURN') ? '#22c55e' : c.source.startsWith('STUN') ? '#38bdf8' : '#94a3b8' }}>
                {c.source}
              </span>{' '}
              <span style={{ color: '#475569' }}>{c.raw.slice(0, 60)}</span>
            </div>
          ))}
          <button
            type="button"
            onClick={handleCopy}
            style={{
              marginTop: 8, width: '100%', padding: '6px 8px', borderRadius: 8,
              background: copied ? '#16a34a' : '#1e293b', color: '#f8fafc',
              border: '1px solid #334155', font: 'inherit', cursor: 'pointer',
            }}
          >
            {copied ? '✓ Copied' : 'Copy diagnostic'}
          </button>
        </>
      )}
    </div>
  );
}
