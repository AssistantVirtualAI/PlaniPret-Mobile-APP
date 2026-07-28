/**
 * Permission state — sourced from the OS, persisted via @capacitor/preferences.
 *
 * No localStorage / sessionStorage anywhere: those get wiped by the OS/webview
 * cache eviction and can't be trusted for a "have we ever asked?" signal.
 * Persistent state lives in native SharedPreferences / NSUserDefaults through
 * @capacitor/preferences; the current permission value comes from the plugin
 * `checkPermissions()` (or `getUserMedia` on web).
 */
import { Capacitor } from '@capacitor/core';
import { requestMicrophone, requestContacts, requestNotifications, openAppSettings } from './permissions';

export type PermKey = 'microphone' | 'contacts' | 'notifications';
export type PermState = 'unknown' | 'granted' | 'denied' | 'blocked' | 'unavailable';

const ASKED_KEY: Record<PermKey, string> = {
  microphone: 'perm_microphone_asked',
  contacts: 'perm_contacts_asked',
  notifications: 'perm_notifications_asked',
};

async function getAsked(key: PermKey): Promise<boolean> {
  try {
    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await Preferences.get({ key: ASKED_KEY[key] });
    return value === 'true';
  } catch { return false; }
}

async function markAsked(key: PermKey): Promise<void> {
  try {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key: ASKED_KEY[key], value: 'true' });
  } catch { /* ignore */ }
}

export async function markMicrophoneAsked(): Promise<void> { await markAsked('microphone'); }

/**
 * Non-prompting state probe.
 *
 * Microphone (native): call the plugin `checkPermissions` — if it says denied
 * we cross-reference the "asked" flag stored in @capacitor/preferences to
 * classify as `denied` (never asked yet, OS will still show a dialog) vs
 * `blocked` (already asked; OS won't re-prompt).
 *
 * Web: `navigator.permissions.query`.
 */
export async function getPermState(key: PermKey): Promise<PermState> {
  const native = Capacitor.isNativePlatform();
  if (!native) return webCheck(key);

  try {
    if (key === 'microphone') {
      // mozartec removed — rely on getUserMedia probe
      return 'unknown';
    }
    if (key === 'contacts') {
      const { Contacts } = await import('@capacitor-community/contacts');
      const r = await Contacts.checkPermissions();
      if (r?.contacts === 'granted') return 'granted';
      if (r?.contacts === 'denied') return (await getAsked('contacts')) ? 'blocked' : 'denied';
      return 'unknown';
    }
    if (key === 'notifications') {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      const r = await PushNotifications.checkPermissions();
      if (r.receive === 'granted') return 'granted';
      if (r.receive === 'denied') return (await getAsked('notifications')) ? 'blocked' : 'denied';
      return 'unknown';
    }
  } catch {
    if (key === 'contacts') return 'unavailable';
    return 'unknown';
  }
  return 'unknown';
}

async function webCheck(key: PermKey): Promise<PermState> {
  if (key === 'contacts') return 'unavailable';
  if (key === 'microphone') {
    const p: any = (navigator as any).permissions;
    if (p?.query) {
      try {
        const s = await p.query({ name: 'microphone' as PermissionName });
        if (s.state === 'granted') return 'granted';
        // Web: denied means the site is blocked — user must flip it in the
        // browser's site settings (there's no runtime prompt anymore).
        if (s.state === 'denied') return 'blocked';
        return 'denied';
      } catch { return 'unknown'; }
    }
    return 'unknown';
  }
  if (key === 'notifications') {
    if (typeof Notification === 'undefined') return 'unavailable';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'blocked';
    return 'denied';
  }
  return 'unknown';
}

/**
 * Trigger the OS permission dialog and classify the result.
 *
 * The `markAsked` write happens BEFORE the request so a subsequent
 * `getPermState` call can flip `denied` → `blocked` even if the OS killed
 * the dialog silently (permanent denial).
 */
export async function requestPerm(key: PermKey): Promise<PermState> {
  await markAsked(key);
  let raw: string = 'denied';
  try {
    if (key === 'microphone') raw = await requestMicrophone();
    else if (key === 'contacts') raw = await requestContacts();
    else if (key === 'notifications') raw = await requestNotifications();
  } catch { raw = 'denied'; }

  if (raw === 'granted') return 'granted';
  if (raw === 'unsupported') return 'unavailable';

  // Post-request re-check: distinguishes "denied this time" from "was already
  // blocked and OS silently returned denied without showing the dialog".
  const post = await getPermState(key);
  if (post === 'granted') return 'granted';
  return post === 'blocked' ? 'blocked' : 'denied';
}

export { openAppSettings };
