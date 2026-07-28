/**
 * androidCallNotif.ts
 *
 * Lightweight helpers to trigger / dismiss the native Android incoming-call
 * notification (fullscreen intent + ringtone) from the JsSIP path.
 *
 * Uses the AndroidSipServicePlugin instance already registered in
 * nativeSipProvider.ts — no registerPlugin() call here to avoid
 * "already registered" errors.
 *
 * The real Kotlin implementation lives in CapacitorPjsip.kt —
 * showIncomingCallNotif / dismissIncomingCallNotif methods.
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
