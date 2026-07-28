import React, { useEffect, useRef, useState } from 'react';
import { buildWssFallbackList, type SIPConfig } from '../lib/sip/jssipProvider';
import { supabase } from '../lib/mobileSupabase';

type Result = {
  url: string;
  state: 'pending' | 'ok' | 'fail';
  ms?: number;
  reason?: string;
  at?: string;
};

const PRIMARY_PORT = '7443';

function classifyWsFailure(url: string): string {
  return (
    'Connection refused or rejected. Most common cause on port 7443: ' +
    'the WSS endpoint is using a self-signed or untrusted SSL certificate ' +
    'that mobile browsers refuse. Verify by opening ' +
    url.replace('wss://', 'https://') +
    ' in a new tab — if the browser warns about the certificate, install a CA-signed (Let\'s Encrypt) certificate.'
  );
}

function probe(url: string, timeoutMs = 5000): Promise<Result> {
  return new Promise((resolve) => {
    const started = Date.now();
    let settled = false;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url, 'sip');
    } catch (e: any) {
      resolve({ url, state: 'fail', reason: e?.message || 'WebSocket constructor failed', at: new Date().toISOString() });
      return;
    }
    const done = (r: Result) => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch {}
      resolve({ ...r, at: new Date().toISOString() });
    };
    const timer = setTimeout(
      () => done({ url, state: 'fail', ms: Date.now() - started, reason: 'Timeout — server did not respond within ' + timeoutMs + 'ms' }),
      timeoutMs,
    );
    ws.onopen = () => { clearTimeout(timer); done({ url, state: 'ok', ms: Date.now() - started }); };
    ws.onerror = () => { clearTimeout(timer); done({ url, state: 'fail', ms: Date.now() - started, reason: classifyWsFailure(url) }); };
    ws.onclose = (ev) => {
      if (settled) return;
      clearTimeout(timer);
      if (ev.code === 1000 || ev.code === 1005) done({ url, state: 'ok', ms: Date.now() - started });
      else done({ url, state: 'fail', ms: Date.now() - started, reason: `Closed (code ${ev.code}). ${classifyWsFailure(url)}` });
    };
  });
}

async function logFallback(primary: Result, fallback: Result, all: Result[]) {
  try {
    // Console for local diagnostics
    // eslint-disable-next-line no-console
    console.warn('[WSS] Fallback from', primary.url, 'to', fallback.url, {
      at: new Date().toISOString(),
      primary_reason: primary.reason,
    });
    await supabase.functions.invoke('pp-wss-fallback-log', {
      body: {
        primary_url: primary.url,
        fallback_url: fallback.url,
        primary_reason: primary.reason ?? null,
        results: all.map((r) => ({ url: r.url, state: r.state, ms: r.ms, at: r.at, reason: r.reason })),
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[WSS] fallback log failed', e);
  }
}

export default function WssDiagnostics({
  config,
  onClose,
  autoRun = true,
}: {
  config: SIPConfig | null;
  onClose: () => void;
  autoRun?: boolean;
}) {
  const urls = config ? buildWssFallbackList(config) : [];
  const [results, setResults] = useState<Result[]>(urls.map((url) => ({ url, state: 'pending' })));
  const [running, setRunning] = useState(false);
  const didAutoRun = useRef(false);

  const primaryUrl = urls.find((u) => u.includes(`:${PRIMARY_PORT}`)) ?? urls[0];
  const primaryResult = results.find((r) => r.url === primaryUrl);

  const run = async () => {
    if (!config) return;
    setRunning(true);
    const fresh: Result[] = urls.map((url) => ({ url, state: 'pending' as const }));
    setResults(fresh);
    const collected: Result[] = [];
    for (let i = 0; i < urls.length; i++) {
      const r = await probe(urls[i]);
      collected.push(r);
      setResults((prev) => prev.map((p, idx) => (idx === i ? r : p)));
    }
    setRunning(false);

    // Detect primary -> fallback and log it
    const primary = collected.find((r) => r.url.includes(`:${PRIMARY_PORT}`));
    if (primary && primary.state === 'fail') {
      const fallback = collected.find((r) => r.state === 'ok' && r.url !== primary.url);
      if (fallback) await logFallback(primary, fallback, collected);
    }
  };

  useEffect(() => {
    if (!autoRun || didAutoRun.current || !config) return;
    didAutoRun.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, autoRun]);

  const banner = (() => {
    if (!primaryResult || primaryResult.state === 'pending') {
      return { color: '#f59e0b', label: `Testing port ${PRIMARY_PORT}…`, sub: primaryUrl };
    }
    if (primaryResult.state === 'ok') {
      return { color: '#22c55e', label: `Port ${PRIMARY_PORT} OK (${primaryResult.ms}ms)`, sub: primaryUrl };
    }
    return { color: '#ef4444', label: `Port ${PRIMARY_PORT} FAILED — using fallback`, sub: primaryResult.reason ?? primaryUrl };
  })();

  return (
    <div role="dialog" aria-modal="true" style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(8,14,30,0.92)', backdropFilter: 'blur(14px)',
      display: 'flex', flexDirection: 'column',
      paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)',
      color: '#fff',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>WSS Diagnostics</div>
        <button onClick={onClose} aria-label="Close" style={{
          background: 'rgba(255,255,255,0.12)', color: '#fff', border: 'none',
          borderRadius: 999, width: 36, height: 36, fontSize: 18, cursor: 'pointer',
        }}>✕</button>
      </div>

      {/* Primary port status banner */}
      <div style={{
        margin: '0 16px 8px', padding: 12, borderRadius: 12,
        background: `${banner.color}1a`,
        border: `1px solid ${banner.color}66`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 10, height: 10, borderRadius: 999, background: banner.color,
            boxShadow: `0 0 12px ${banner.color}`,
          }} />
          <strong style={{ fontSize: 13 }}>{banner.label}</strong>
        </div>
        <div style={{ marginTop: 4, fontSize: 11, opacity: 0.85, wordBreak: 'break-all' }}>{banner.sub}</div>
      </div>

      <div style={{ padding: '0 16px 12px', fontSize: 12, opacity: 0.8 }}>
        Tests each known SIP WebSocket endpoint. Port {PRIMARY_PORT} is the primary;
        fallback events are logged with your user ID and timestamp.
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
        {!config && (
          <div style={{ padding: 16, background: 'rgba(239,68,68,0.12)', borderRadius: 12, color: '#fca5a5' }}>
            SIP configuration not loaded yet — sign in and wait for the credentials to hydrate.
          </div>
        )}
        {results.map((r, i) => (
          <div key={i} style={{
            margin: '8px 0', padding: 12, borderRadius: 12,
            background: r.state === 'ok' ? 'rgba(34,197,94,0.10)' : r.state === 'fail' ? 'rgba(239,68,68,0.10)' : 'rgba(245,158,11,0.10)',
            border: `1px solid ${r.state === 'ok' ? '#22c55e55' : r.state === 'fail' ? '#ef444455' : '#f59e0b55'}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <code style={{ fontSize: 12, wordBreak: 'break-all' }}>
                {r.url}
                {r.url.includes(`:${PRIMARY_PORT}`) && (
                  <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#3b82f6', color: '#fff' }}>PRIMARY</span>
                )}
              </code>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                background: r.state === 'ok' ? '#22c55e' : r.state === 'fail' ? '#ef4444' : '#f59e0b',
                color: '#0a0f1f',
              }}>
                {r.state === 'ok' ? `OK ${r.ms}ms` : r.state === 'fail' ? 'FAIL' : 'pending'}
              </span>
            </div>
            {r.at && (
              <div style={{ marginTop: 4, fontSize: 10, opacity: 0.6 }}>{new Date(r.at).toLocaleTimeString()}</div>
            )}
            {r.reason && (
              <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.4, opacity: 0.9 }}>{r.reason}</div>
            )}
          </div>
        ))}
      </div>

      <div style={{ padding: 16, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <button
          onClick={run}
          disabled={running || !config}
          style={{
            width: '100%', padding: '12px 16px', borderRadius: 12, border: 'none',
            background: running ? 'rgba(59,130,246,0.4)' : 'linear-gradient(135deg,#3b82f6,#1d4ed8)',
            color: '#fff', fontWeight: 700, fontSize: 14,
            cursor: running ? 'wait' : 'pointer',
          }}
        >
          {running ? 'Testing endpoints…' : 'Run diagnostics'}
        </button>
      </div>
    </div>
  );
}
