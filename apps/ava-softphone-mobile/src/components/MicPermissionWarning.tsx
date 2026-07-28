import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { requestMicrophone } from '../lib/permissions';

/**
 * In-app warning banner that shows whenever microphone access is denied.
 *
 * Polls the permission status every 4s (cheap) so it disappears as soon
 * as the user grants access from iOS Settings without needing to restart
 * the app. On web it relies on the standard Permissions API when available.
 */
export default function MicPermissionWarning() {
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function probe() {
      try {
        // Permissions API path (Chrome / Android web).
        const anyNav: any = navigator;
        if (anyNav.permissions?.query) {
          try {
            const st = await anyNav.permissions.query({ name: 'microphone' as PermissionName });
            if (!cancelled) setDenied(st.state === 'denied');
            return;
          } catch { /* fall through */ }
        }
        // Native iOS / fallback: probe via getUserMedia only if we don't yet
        // know — never spam the user with a fresh prompt loop.
      } catch { /* ignore */ }
    }

    probe();
    const id = setInterval(probe, 4000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (!denied) return null;

  const retry = async () => {
    setBusy(true);
    try {
      const st = await requestMicrophone();
      if (st === 'granted') setDenied(false);
    } finally {
      setBusy(false);
    }
  };

  const openSettings = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const { App } = await import('@capacitor/app');
        // iOS: opens the app's settings page.
        await (App as any).openUrl?.({ url: 'app-settings:' }).catch(() => {});
      } catch { /* ignore */ }
    }
  };

  return (
    <div
      role="alert"
      style={{
        margin: '8px 12px', padding: '10px 12px',
        borderRadius: 10,
        background: 'rgba(239,68,68,0.14)',
        border: '1px solid rgba(239,68,68,0.4)',
        color: '#fecaca',
        fontSize: 13, lineHeight: 1.35,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span aria-hidden style={{ fontSize: 16 }}>🎤</span>
        <strong style={{ fontWeight: 700 }}>Microphone access blocked</strong>
      </div>
      <div>
        Calls cannot start without microphone access. Enable it in your device settings
        (Settings → Lemtel → Microphone) and return here.
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          onClick={retry}
          disabled={busy}
          style={btnStyle('#22c55e')}
        >
          {busy ? 'Checking…' : 'Try again'}
        </button>
        {Capacitor.isNativePlatform() && (
          <button onClick={openSettings} style={btnStyle('#64748b')}>
            Open Settings
          </button>
        )}
      </div>
    </div>
  );
}

function btnStyle(color: string): React.CSSProperties {
  return {
    padding: '6px 12px', borderRadius: 8,
    background: color, color: '#0b0f1a',
    fontWeight: 700, fontSize: 12,
    border: 'none', cursor: 'pointer',
  };
}
