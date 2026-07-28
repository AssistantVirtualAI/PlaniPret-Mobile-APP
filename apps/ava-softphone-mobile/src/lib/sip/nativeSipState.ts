/**
 * Global, lightweight singleton that tracks the native CapacitorPjsip plugin
 * state so any screen (notably the new "État natif" panel) can render it
 * without owning the SIP lifecycle itself.
 *
 * - Tracks plugin availability (so the UI never gets stuck on "connecting"
 *   when the native binary is missing from the build).
 * - Captures registration status + last error + last raw event.
 * - Persists nothing: long-term credentials live in `Store` (creds.ts).
 */
import { Capacitor } from '@capacitor/core';
import { CapacitorPjsip } from './nativeSipProvider';

export type NativeRegStatus = 'unknown' | 'idle' | 'connecting' | 'registered' | 'error';

export interface NativeSipSnapshot {
  pluginAvailable: boolean;
  pluginName: string;
  regStatus: NativeRegStatus;
  lastError: string | null;
  lastEvent: { name: string; at: number; data: any } | null;
  events: Array<{ name: string; at: number; data: any }>;
}

const MAX_EVENTS = 25;

let snapshot: NativeSipSnapshot = {
  pluginAvailable: Capacitor.isPluginAvailable('CapacitorPjsip'),
  pluginName: 'CapacitorPjsip',
  regStatus: 'unknown',
  lastError: null,
  lastEvent: null,
  events: [],
};

const listeners = new Set<(s: NativeSipSnapshot) => void>();
const emit = () => listeners.forEach((cb) => { try { cb(snapshot); } catch {} });

const push = (name: string, data: any) => {
  const e = { name, at: Date.now(), data };
  snapshot = {
    ...snapshot,
    lastEvent: e,
    events: [e, ...snapshot.events].slice(0, MAX_EVENTS),
  };
};

export function setNativeRegStatus(status: NativeRegStatus, error?: string | null) {
  snapshot = { ...snapshot, regStatus: status, lastError: error ?? (status === 'error' ? snapshot.lastError : null) };
  emit();
}

export function getNativeSipSnapshot(): NativeSipSnapshot { return snapshot; }

export function subscribeNativeSip(cb: (s: NativeSipSnapshot) => void): () => void {
  listeners.add(cb);
  cb(snapshot);
  return () => { listeners.delete(cb); };
}

let started = false;
/**
 * Idempotent. Wires global listeners onto the native plugin so the snapshot
 * stays fresh even when no React screen owns the SIP hook.
 */
export async function startNativeSipTracking(): Promise<void> {
  if (started) return;
  started = true;
  // Native PJSIP only exists on iOS. On Android / web the plugin is a JS-only
  // no-op stub (see nativeSipProvider) — don't wire listeners and don't paint
  // the UI red with "Plugin non disponible".
  if (Capacitor.getPlatform() !== 'ios') {
    push('platform-skipped', { platform: Capacitor.getPlatform() });
    setNativeRegStatus('idle', null);
    return;
  }
  if (!snapshot.pluginAvailable) {
    push('plugin-unavailable', { native: Capacitor.isNativePlatform() });
    setNativeRegStatus('error', 'Plugin CapacitorPjsip non disponible');
    return;
  }
  try {
    await CapacitorPjsip.addListener('registration', (d: any) => {
      push('registration', d);
      if (d?.status === 'registered') setNativeRegStatus('registered', null);
      else if (d?.status === 'error') setNativeRegStatus('error', d?.reason || `Registration failed${d?.code ? ` (${d.code})` : ''}`);
      else emit();
    });
    await CapacitorPjsip.addListener('callStateChanged', (d: any) => { push('callStateChanged', d); emit(); });
    await CapacitorPjsip.addListener('callEnded', (d: any) => { push('callEnded', d); emit(); });
    await CapacitorPjsip.addListener('log', (d: any) => { push('log', d); emit(); });
  } catch (e: any) {
    setNativeRegStatus('error', e?.message || 'addListener failed');
  }
}
