/**
 * One-time native runtime initialization:
 * - Hide splash screen
 * - Set status bar style
 * - Wire app pause/resume hooks
 */
import { Capacitor } from '@capacitor/core';
import { primeRingbackContext } from './sip/ringback';

// Unlock the WebAudio AudioContext on the very first user gesture so the
// ringback tone can play instantly when the user later taps "Call".
// Must run on every platform (native + web preview).
let _ringbackPrimed = false;
const _primeOnce = () => {
  if (_ringbackPrimed) return;
  _ringbackPrimed = true;
  try { primeRingbackContext(); } catch {}
};
if (typeof document !== 'undefined') {
  document.addEventListener('touchstart', _primeOnce, { once: true, passive: true });
  document.addEventListener('click', _primeOnce, { once: true });
  document.addEventListener('keydown', _primeOnce, { once: true });
}

export async function bootNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: 400 });
  } catch {}
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#001a3d' });
  } catch {}

  // Delta contact sync — fires at most once per 24h, non-blocking.
  try {
    const { maybeRunDeltaSync } = await import('./contactsSync');
    void maybeRunDeltaSync().then((r) => {
      if (r) console.log('[nativeBoot] contacts delta sync', r);
    });
  } catch {}
}

export async function onAppStateChange(handler: (active: boolean) => void): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) return () => {};
  try {
    const { App } = await import('@capacitor/app');
    const sub = await App.addListener('appStateChange', (s) => handler(s.isActive));
    return () => sub.remove();
  } catch {
    return () => {};
  }
}
