/**
 * Auto-reconnect helper: re-runs the provided callback when the app comes
 * back to the foreground or when the network reconnects / changes type
 * (Wi-Fi ↔ cellular). iOS does not let us programmatically pick the radio,
 * but we react on every handover so the SIP session re-registers on whichever
 * link currently has connectivity (effectively "best-signal" handover).
 */
import { Capacitor } from '@capacitor/core';

let lastType: string | null = null;

export async function attachNativeAutoReconnect(reconnect: () => void): Promise<() => void> {
  const cleanups: Array<() => void> = [];
  if (!Capacitor.isNativePlatform()) return () => {};

  // Debounce re-registration bursts (network flapping, rapid fg/bg cycles)
  // — each initAccount creates a fresh SIP registration on FusionPBX.
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleReconnect = (delayMs: number, source: string) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      console.log('[NativeSIP] debounced reconnect fired from', source);
      reconnect();
    }, delayMs);
  };

  try {
    const { App } = await import('@capacitor/app');
    const sub = await App.addListener('appStateChange', (s) => {
      if (s.isActive) {
        console.log('[NativeSIP] appStateChange:active → debounced reconnect');
        scheduleReconnect(1500, 'appStateChange');
      }
    });
    cleanups.push(() => { sub.remove().catch(() => {}); });
  } catch {}

  try {
    const { Network } = await import('@capacitor/network');
    try {
      const cur = await Network.getStatus();
      lastType = cur.connectionType ?? null;
    } catch {}
    const sub = await Network.addListener('networkStatusChange', (s) => {
      if (!s.connected) return;
      const nextType = s.connectionType ?? null;
      const typeChanged = nextType !== lastType;
      console.log('[NativeSIP] networkStatusChange', {
        ...s,
        previousType: lastType,
        typeChanged,
      });
      lastType = nextType;
      // Respect the user's "auto Wi-Fi / LTE handover" preference.
      let handoverEnabled = true;
      try {
        const v = localStorage.getItem('ava.autoHandover');
        handoverEnabled = v === null ? true : (v === 'on' || v === '1' || v === 'true');
      } catch {}
      if (!handoverEnabled) return;
      scheduleReconnect(Capacitor.getPlatform() === 'android' ? 5000 : (typeChanged ? 1200 : 3000), 'networkStatusChange');
    });
    cleanups.push(() => { sub.remove().catch(() => {}); });
  } catch {}

  cleanups.push(() => { if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; } });
  return () => { cleanups.forEach((c) => { try { c(); } catch {} }); };
}

export function currentConnectionType(): string | null {
  return lastType;
}
