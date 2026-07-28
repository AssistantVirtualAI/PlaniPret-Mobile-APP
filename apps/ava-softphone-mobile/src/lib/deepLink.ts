// Capacitor deep-link handler.
//
// Handles two URL schemes:
//   1. avastatistic://login?ava_token=...  — auto-login token
//   2. tel:+15141234567                    — click-to-call from iOS native
//      (iOS Recents / Contacts tap → opens app → must auto-dial)
//
// For tel: URLs, we store the number in sessionStorage and dispatch a
// custom event so MobileApp.tsx can pick it up and call dialNumber().
//
// Three paths are handled:
//   A) App already running (foreground/background): Capacitor appUrlOpen event
//   B) App launched from terminated state via tel: URL: App.getLaunchUrl()
//   C) App already running, opened via iOS Contacts "Call via AVA Softphone":
//      AppDelegate stores number in Preferences + fires native pendingCall event
//      via CapacitorPjsip.notifyBg → we listen here with addListener
//   D) App launched from terminated state via Contacts intent:
//      AppDelegate stores number in Preferences → we read at boot (Preferences fallback)
import { Capacitor } from '@capacitor/core';

export const PENDING_CALL_KEY = 'ava.pendingCall';

/** Dispatch a custom event so MobileApp can trigger the call immediately. */
function dispatchPendingCall(number: string) {
  sessionStorage.setItem(PENDING_CALL_KEY, number);
  window.dispatchEvent(new CustomEvent('ava:pendingCall', { detail: { number } }));
  console.log('[deep-link] pendingCall dispatched:', number);
}

export async function registerDeepLinkHandler(): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) return () => {};
  const cleanups: Array<() => void> = [];

  try {
    const { App } = await import('@capacitor/app');

    // Path A: Handle URL opened while app is already running (foreground / background).
    const sub = await App.addListener('appUrlOpen', (event: { url: string }) => {
      try {
        const raw = event.url;
        console.log('[deep-link] appUrlOpen:', raw);

        // tel: scheme — iOS Recents / Contacts click-to-call
        if (raw.startsWith('tel:')) {
          const number = raw.replace(/^tel:/, '').replace(/[^\d+*#]/g, '');
          if (number) dispatchPendingCall(number);
          return;
        }

        // avastatistic:// scheme — auto-login token
        const u = new URL(raw);
        const token = u.searchParams.get('ava_token');
        if (token) {
          const target = new URL(window.location.href);
          target.searchParams.set('ava_token', token);
          window.location.replace(target.toString());
        }
      } catch (e) {
        console.warn('[deep-link] parse failed', e);
      }
    });
    cleanups.push(() => sub.remove());

    // Path B: Handle URL that launched the app from terminated state.
    try {
      const launch = await App.getLaunchUrl();
      if (launch?.url?.startsWith('tel:')) {
        const number = launch.url.replace(/^tel:/, '').replace(/[^\d+*#]/g, '');
        if (number) dispatchPendingCall(number);
      }
    } catch {}

    // Path C: App already running — AppDelegate fires native 'pendingCall' event
    // via CapacitorPjsip plugin when user picks "Call via AVA Softphone" from Contacts.
    // This covers the case where appUrlOpen does NOT fire (INStartCallIntent path).
    try {
      const { CapacitorPjsip } = await import('./sip/nativeSipProvider');
      if (CapacitorPjsip && typeof (CapacitorPjsip as any).addListener === 'function') {
        const nativeSub = await (CapacitorPjsip as any).addListener(
          'pendingCall',
          (data: { number?: string }) => {
            const number = String(data?.number || '').replace(/[^\d+*#]/g, '');
            if (number) {
              console.log('[deep-link] native pendingCall event:', number);
              dispatchPendingCall(number);
            }
          },
        );
        cleanups.push(() => { try { nativeSub.remove(); } catch {} });
      }
    } catch (e) {
      console.warn('[deep-link] CapacitorPjsip listener not available:', e);
    }

    // Path D: App launched from terminated state via Contacts intent.
    // AppDelegate stores number in Preferences under 'ava.pendingCallNumber'.
    try {
      const { Preferences } = await import('@capacitor/preferences');
      const stored = await Preferences.get({ key: 'ava.pendingCallNumber' });
      if (stored?.value) {
        await Preferences.remove({ key: 'ava.pendingCallNumber' });
        console.log('[deep-link] Preferences pendingCallNumber:', stored.value);
        dispatchPendingCall(stored.value);
      }
    } catch {}

    return () => cleanups.forEach((fn) => fn());
  } catch {
    return () => {};
  }
}
