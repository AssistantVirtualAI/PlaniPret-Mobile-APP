import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { CapacitorSipNative } from '../lib/sip/nativeSipProvider';
import { useT } from '../lib/i18n';

const IS_ANDROID = Capacitor.getPlatform() === 'android';

type Stats = Awaited<ReturnType<typeof CapacitorSipNative.getRtpStats>>;

export default function AudioDiagnosticsScreen() {
  const { tx } = useT();
  const [stats, setStats] = useState<Stats | null>(null);
  const [route, setRoute] = useState<string>('');
  const [btEvents, setBtEvents] = useState<Array<{ t: number; outputs: string[]; bluetooth: boolean }>>([]);
  const [tone, setTone] = useState<{ running: boolean; micPeak: number; route: string }>({
    running: false, micPeak: 0, route: '',
  });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let mounted = true;
    let sub: any;
    (async () => {
      try {
        sub = await CapacitorSipNative.addListener('audioRouteChanged', (d: any) => {
          if (!mounted) return;
          setBtEvents(prev => [{ t: Date.now(), outputs: d.outputs || [], bluetooth: !!d.bluetooth }, ...prev].slice(0, 20));
          setRoute((d.outputs || []).join(','));
        });
      } catch {}
      try {
        const r = await CapacitorSipNative.getAudioRoute();
        setRoute(r.outputs.map(o => o.portType).join(','));
      } catch {}
    })();
    timerRef.current = setInterval(async () => {
      try {
        const s = await CapacitorSipNative.getRtpStats();
        if (mounted) setStats(s);
      } catch {}
    }, 500);
    return () => {
      mounted = false;
      if (timerRef.current) clearInterval(timerRef.current);
      sub?.remove?.().catch(() => {});
    };
  }, []);

  const runToneTest = async () => {
    setTone({ running: true, micPeak: 0, route: '' });
    try {
      const r = await CapacitorSipNative.playTestTone({ seconds: 2, frequency: 440 });
      setTone({ running: false, micPeak: r.micPeak, route: r.route });
    } catch (e: any) {
      setTone({ running: false, micPeak: 0, route: 'error: ' + (e?.message || e) });
    }
  };

  const setRouteTo = async (r: 'auto' | 'speaker' | 'earpiece' | 'bluetooth') => {
    try { await CapacitorSipNative.setAudioRoute({ route: r }); } catch {}
  };

  const row = (k: string, v: any) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, borderBottom: '1px solid #1f2937' }}>
      <span style={{ color: '#94a3b8' }}>{k}</span>
      <span style={{ color: '#e2e8f0', fontFamily: 'ui-monospace,monospace' }}>{String(v ?? '—')}</span>
    </div>
  );

  return (
    <div style={{ padding: 16, color: '#e2e8f0', background: '#0b1220', minHeight: '100%' }}>
      <h2 style={{ marginTop: 0 }}>{tx('Diagnostic audio', 'Audio diagnostics')}</h2>

      <section style={{ background: '#0f172a', padding: 12, borderRadius: 12, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>{tx('Test pré-appel', 'Pre-call test')}</h3>
        {IS_ANDROID ? (
          <p style={{ color: '#f59e0b', fontSize: 12 }}>
            {tx('Test audio non disponible sur Android (JsSIP/WebRTC gère l’audio directement).',
                'Audio test not available on Android (JsSIP/WebRTC handles audio directly).')}
          </p>
        ) : (
          <>
            <p style={{ color: '#94a3b8', fontSize: 12 }}>
              {tx('Joue un ton 440 Hz pendant 2 s sur la sortie active et démarre RemoteIO pour mesurer le pic micro.', 'Plays a 440 Hz tone for 2 s on the active output and starts RemoteIO to measure mic peak.')}
            </p>
            <button onClick={runToneTest} disabled={tone.running}
              style={{ padding: '10px 16px', borderRadius: 8, background: '#2563eb', color: '#fff', border: 0 }}>
              {tone.running ? tx('Test en cours…', 'Running…') : tx('▶ Lancer le test', '▶ Run test')}
            </button>
            <div style={{ marginTop: 10 }}>
              {row(tx('Pic micro', 'Mic peak'), `${(tone.micPeak * 100).toFixed(1)}%`)}
              {row(tx('Route audio', 'Audio route'), tone.route)}
            </div>
          </>
        )}
      </section>

      <section style={{ background: '#0f172a', padding: 12, borderRadius: 12, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>{tx('Forcer la route', 'Force route')}</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(['auto','speaker','earpiece','bluetooth'] as const).map(r => (
            <button key={r} onClick={() => setRouteTo(r)} disabled={IS_ANDROID && r !== 'speaker' && r !== 'earpiece' && r !== 'bluetooth'}
              style={{ padding: '8px 12px', borderRadius: 8, background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155' }}>
              {r}
            </button>
          ))}
        </div>
        <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 8 }}>{tx('Route actuelle', 'Current route')} : {route || '—'}</p>
      </section>

      <section style={{ background: '#0f172a', padding: 12, borderRadius: 12, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>{tx('Stats RTP (temps réel)', 'RTP stats (real-time)')}</h3>
        {stats?.running ? (
          <div>
            {row('Local', `${stats.localIp}:${stats.localPort}`)}
            {row('Remote', `${stats.remoteIp}:${stats.remotePort}`)}
            {row(tx('TX paquets', 'TX packets'), stats.txPackets)}
            {row(tx('RX paquets', 'RX packets'), stats.rxPackets)}
            {row('TX bytes', stats.txBytes)}
            {row('RX bytes', stats.rxBytes)}
            {row(tx('Seq sortante', 'Seq out'), stats.seqOut)}
            {row(tx('Seq entrante', 'Seq in'), stats.lastSeq)}
            {row(tx('Pic micro', 'Mic peak'), `${((stats.micPeak ?? 0) * 100).toFixed(1)}%`)}
            {row(tx('Pic RX', 'RX peak'), `${((stats.rxPeak ?? 0) * 100).toFixed(1)}%`)}
            {row('Uptime', `${(((stats.uptimeMs ?? 0) / 1000) | 0)} s`)}
            {row('Route', stats.route)}
            {row('Backend', stats.audioBackend || '—')}
            {row('Input callbacks', stats.inputCallbacks ?? 0)}
            {row('Render callbacks', stats.renderCallbacks ?? 0)}
            {row('Input frames', stats.inputFrames ?? 0)}
            {row('Render frames', stats.renderFrames ?? 0)}
            {row(tx('Format capture', 'Capture format'), stats.tapFormat || '—')}
            {row('Converter', stats.converterFormat || '—')}
            {row('Session', stats.sessionState || '—')}
            {row(tx('RemoteIO erreur', 'RemoteIO error'), stats.lastEngineError || '—')}
          </div>
        ) : (
          <p style={{ color: '#94a3b8', fontSize: 12 }}>{tx("Aucun appel actif. Les stats apparaîtront pendant l'appel.", 'No active call. Stats will appear during the call.')}</p>
        )}
      </section>

      <section style={{ background: '#0f172a', padding: 12, borderRadius: 12 }}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>{tx('Événements Bluetooth / route', 'Bluetooth / route events')}</h3>
        {btEvents.length === 0 && <p style={{ color: '#94a3b8', fontSize: 12 }}>{tx('Aucun changement détecté.', 'No changes detected.')}</p>}
        {btEvents.map((e, i) => (
          <div key={i} style={{ fontSize: 12, padding: '4px 0', borderBottom: '1px solid #1f2937' }}>
            <span style={{ color: '#94a3b8' }}>{new Date(e.t).toLocaleTimeString()} </span>
            <span style={{ color: e.bluetooth ? '#22c55e' : '#f59e0b' }}>{e.bluetooth ? 'BT' : 'no-BT'}</span>
            <span style={{ color: '#cbd5e1', marginLeft: 8 }}>{e.outputs.join(',')}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
