/**
 * bootSipGuard — runs once at app boot.
 *
 * 1. Logs the SIP-related env flags and which provider will be used.
 * 2. Wraps console.log/info/warn/error/debug so any JsSIP UA log emitted
 *    while the native flag is active is reported as a fatal misconfiguration.
 * 3. Exposes `getSipBootReport()` for the UI fallback panel.
 *
 * NOTE: The "dispatcher loaded" validation timer has been removed.
 * useSoftphone mounts only AFTER the full boot sequence (SplashAva →
 * permission gate → creds loaded), which can take 15–60 s on a cold launch.
 * A fixed timer always fires a false positive before the hook ever mounts.
 * The only reliable check is the JsSIP leak detector below.
 */
import { NATIVE_SIP_ENABLED } from './nativeSipProvider';

export interface SipBootReport {
  nativeEnabled: boolean;
  dispatcherLoaded: boolean;
  jsSipLeak: string | null;       // first offending log message, if any
  startedAt: number;
}

const report: SipBootReport = {
  nativeEnabled: NATIVE_SIP_ENABLED,
  dispatcherLoaded: false,
  jsSipLeak: null,
  startedAt: Date.now(),
};

let installed = false;

/**
 * Called directly by useSoftphoneNative / useSoftphone when the hook first
 * renders. This replaces the fragile console-sniffing approach and eliminates
 * all timing races between module evaluation and guard installation.
 */
export function notifySipDispatcherLoaded() {
  if (report.dispatcherLoaded) return;
  report.dispatcherLoaded = true;
  // eslint-disable-next-line no-console
  console.log('[SipBootGuard] ✓ dispatcher loaded, provider =',
    NATIVE_SIP_ENABLED ? 'native' : 'jssip');
}

export function installSipBootGuard() {
  if (installed) return;
  installed = true;

  const env = (import.meta as any).env ?? {};
  // eslint-disable-next-line no-console
  console.log('[SipBootGuard] env flags', {
    VITE_NATIVE_SIP: env.VITE_NATIVE_SIP,
    MODE: env.MODE,
    PROD: env.PROD,
    chosenProvider: NATIVE_SIP_ENABLED ? 'native (CapacitorPjsip)' : 'jssip (WebRTC)',
  });

  // Sniff every console call to catch any JsSIP UA log while native is active.
  // This is the only check that matters: if JsSIP boots while NATIVE_SIP=true,
  // two SIP stacks fight over the mic and calls will fail.
  if (!NATIVE_SIP_ENABLED) return; // no leak possible in JsSIP mode

  const channels: Array<'log' | 'info' | 'warn' | 'error' | 'debug'> = [
    'log', 'info', 'warn', 'error', 'debug',
  ];
  channels.forEach((ch) => {
    const original = (console as any)[ch].bind(console);
    (console as any)[ch] = (...args: any[]) => {
      try {
        if (!report.jsSipLeak) {
          const first = typeof args[0] === 'string' ? args[0] : '';
          // JsSIP prints with the "JsSIP:" prefix on every internal log.
          if (/^JsSIP:/.test(first) || /JsSIP\b.*\bUA\b/.test(first)) {
            report.jsSipLeak = first;
            original(
              '[SipBootGuard] ❌ JsSIP UA log detected while VITE_NATIVE_SIP=true —',
              'a parallel SIP stack is running. This must never happen.',
              { sample: first },
            );
          }
        }
      } catch {
        // never let logging crash the app
      }
      original(...args);
    };
  });
}

export function getSipBootReport(): Readonly<SipBootReport> {
  return report;
}
