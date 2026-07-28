import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';

/**
 * Background presence ping.
 * Pings `update_platform_seen` RPC only when the app is in the foreground.
 * Interval raised to 10 minutes to reduce server load and BLF registration
 * issues caused by excessive API traffic.
 *
 * Pull-on-request: interval only runs while the app is active (foreground).
 * Stops automatically when the app goes to background.
 */
const PING_INTERVAL_MS = 10 * 60_000; // 10 minutes (was 60s)

export function usePresencePing(opts: { portalUrl: string; accessToken: string | null }) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!opts.accessToken) return;
    const platform = Capacitor.isNativePlatform()
      ? (Capacitor.getPlatform() === 'ios' ? 'ios' : 'android')
      : 'web';

    const ping = async () => {
      try {
        await fetch(`${opts.portalUrl.replace(/\/$/, '')}/rest/v1/rpc/update_platform_seen`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${opts.accessToken}`,
            apikey: opts.accessToken!,
          },
          body: JSON.stringify({ p_platform: platform }),
        });
      } catch {}
    };

    const start = () => {
      if (timerRef.current) return;
      ping(); // immediate ping on start
      timerRef.current = setInterval(ping, PING_INTERVAL_MS);
    };

    const stop = () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };

    // Only ping while app is in foreground
    if (Capacitor.isNativePlatform()) {
      (async () => {
        try {
          const { App } = await import('@capacitor/app');
          start();
          const sub = await App.addListener('appStateChange', (s) => {
            if (s.isActive) start(); else stop();
          });
          return () => { stop(); sub.remove(); };
        } catch { start(); }
      })();
    } else {
      start();
      const onFocus = () => start();
      const onBlur = () => stop();
      window.addEventListener('focus', onFocus);
      window.addEventListener('blur', onBlur);
      return () => { stop(); window.removeEventListener('focus', onFocus); window.removeEventListener('blur', onBlur); };
    }

    return () => stop();
  }, [opts.portalUrl, opts.accessToken]);
}
