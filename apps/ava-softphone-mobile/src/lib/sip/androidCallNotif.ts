/**
 * androidCallNotif.ts
 *
 * Lightweight helpers to trigger / dismiss the native Android incoming-call
 * notification (fullscreen intent + ringtone) from the JsSIP path.
 *
 * IMPORTANT: uses a STATIC import of AndroidSipServicePlugin to avoid the
 * "CapacitorPjsip.then() is not implemented on android" error that occurs
 * when using a dynamic import() — Capacitor intercepts Promise chains on
 * plugin objects and throws when .then() is not a registered plugin method.
 */

import { Capacitor } from '@capacitor/core';
import { AndroidSipServicePlugin } from './nativeSipProvider';

export async function showAndroidIncomingCallNotif(callerNumber: string, callerName: string): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  try {
    await AndroidSipServicePlugin.showIncomingCallNotif?.({ callerNumber, callerName });
  } catch (e) {
    console.warn('[androidCallNotif] showIncomingCallNotif failed', e);
  }
}

export async function dismissAndroidIncomingCallNotif(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  try {
    await AndroidSipServicePlugin.dismissIncomingCallNotif?.();
  } catch (e) {
    console.warn('[androidCallNotif] dismissIncomingCallNotif failed', e);
  }
}
