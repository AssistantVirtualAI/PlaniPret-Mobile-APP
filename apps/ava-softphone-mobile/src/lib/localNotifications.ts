/**
 * Local on-device notifications (lock-screen / banner) for missed calls,
 * voicemails and SMS. Wraps @capacitor/local-notifications so callers don't
 * have to deal with permissions / platform checks.
 */
import { Capacitor } from '@capacitor/core';

export type LocalNotifKind = 'missed_call' | 'voicemail' | 'sms';

let permissionGranted: boolean | null = null;

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  if (permissionGranted !== null) return permissionGranted;
  try {
    const { LocalNotifications } = await import(/* @vite-ignore */ '@capacitor/local-notifications');
    const cur = await LocalNotifications.checkPermissions();
    if (cur.display === 'granted') { permissionGranted = true; return true; }
    const req = await LocalNotifications.requestPermissions();
    permissionGranted = req.display === 'granted';
    return permissionGranted;
  } catch (e) {
    console.warn('[localNotif] permission failed', e);
    permissionGranted = false;
    return false;
  }
}

const recentIds = new Set<string>();
function dedupe(key: string): boolean {
  if (recentIds.has(key)) return true;
  recentIds.add(key);
  if (recentIds.size > 200) {
    const first = recentIds.values().next().value;
    if (first) recentIds.delete(first);
  }
  return false;
}

export async function showLocalNotification(opts: {
  kind: LocalNotifKind;
  title: string;
  body: string;
  id?: number;
  dedupeKey?: string;
  extra?: Record<string, any>;
}): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (opts.dedupeKey && dedupe(opts.dedupeKey)) return;
  const ok = await ensureNotificationPermission();
  if (!ok) return;
  try {
    const { LocalNotifications } = await import(/* @vite-ignore */ '@capacitor/local-notifications');
    await LocalNotifications.schedule({
      notifications: [{
        id: opts.id ?? Math.floor(Math.random() * 1_000_000_000),
        title: opts.title,
        body: opts.body,
        smallIcon: 'ic_stat_icon_config_sample',
        channelId: opts.kind === 'sms' ? 'sms' : opts.kind === 'voicemail' ? 'voicemail' : 'missed_calls',
        extra: { kind: opts.kind, ...(opts.extra || {}) },
      }],
    });
  } catch (e) {
    console.warn('[localNotif] schedule failed', e);
  }
}

export async function initNotificationChannels(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
  try {
    const { LocalNotifications } = await import(/* @vite-ignore */ '@capacitor/local-notifications');
    await Promise.all([
      LocalNotifications.createChannel({ id: 'missed_calls', name: 'Missed calls', importance: 5, visibility: 1 }),
      LocalNotifications.createChannel({ id: 'voicemail',    name: 'Voicemail',    importance: 5, visibility: 1 }),
      LocalNotifications.createChannel({ id: 'sms',          name: 'Messages',     importance: 5, visibility: 1 }),
    ]);
  } catch (e) { console.warn('[localNotif] channels failed', e); }
}
