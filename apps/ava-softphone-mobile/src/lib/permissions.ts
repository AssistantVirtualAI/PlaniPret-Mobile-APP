/**
 * Centralized mobile permission requests for Lemtel AI Phone.
 *
 * Requests microphone, speaker (via getUserMedia/audio output), contacts,
 * camera, and notification permissions. Safe to call on web (no-ops).
 */
import { Capacitor } from '@capacitor/core';
import { CapacitorPjsip } from './sip/nativeSipProvider';

export type PermissionStatus = 'granted' | 'denied' | 'prompt' | 'unsupported';

export interface AllPermissions {
  microphone: PermissionStatus;
  speaker: PermissionStatus;
  contacts: PermissionStatus;
  notifications: PermissionStatus;
  camera: PermissionStatus;
}

/** Microphone + speaker output (WebRTC). Triggers OS prompt on native. */
export async function requestMicrophone(): Promise<PermissionStatus> {
  const platform = Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web';
  console.log('[permissions] requestMicrophone start', { platform });
  try {
    if (Capacitor.isNativePlatform()) {
      if (platform === 'ios') {
        try {
          const res = await CapacitorPjsip.requestMicrophonePermission();
          console.log('[permissions] iOS PJSIP mic result', res);
          if (res?.granted) return 'granted';
        } catch (e) { console.warn('[permissions] PJSIP mic failed', e); }
      }
      const pluginGranted = false;
      const pluginDenied = false;
      // mozartec removed — no capacitor microphone plugin fallback; use getUserMedia below.
      if (pluginGranted) return 'granted';
      try {
        if (navigator.mediaDevices?.getUserMedia) {
          console.log('[permissions] falling back to getUserMedia');
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((t) => t.stop());
          return 'granted';
        }
      } catch (e: any) {
        console.warn('[permissions] getUserMedia failed', { name: e?.name, message: e?.message });
        if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') return 'denied';
      }
      return pluginDenied ? 'denied' : 'prompt';
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return 'unsupported';
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return 'granted';
  } catch (e) {
    console.error('[permissions] requestMicrophone fatal', e);
    return 'denied';
  }
}

/**
 * Speaker / audio output permission. Most platforms don't gate playback,
 * but we proactively initialize an AudioContext to satisfy autoplay policies.
 */
export async function unlockAudioOutput(): Promise<PermissionStatus> {
  try {
    const Ctx: typeof AudioContext | undefined =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return 'unsupported';
    const ctx = new Ctx();
    if (ctx.state === 'suspended') await ctx.resume();
    // Play a 1-sample silent buffer to truly unlock on iOS.
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
    return ctx.state === 'running' ? 'granted' : 'prompt';
  } catch {
    return 'denied';
  }
}

/** Contacts permission via @capacitor-community/contacts. */
export async function requestContacts(): Promise<PermissionStatus> {
  if (!Capacitor.isNativePlatform()) return 'unsupported';
  // App Store 5.1.2: NEVER trigger the iOS contacts prompt automatically.
  // The prompt is only requested from ContactsConsentSheet after the user
  // explicitly agrees to server upload. Here we only report current status.
  try {
    const { Contacts } = await import('@capacitor-community/contacts');
    const check = await Contacts.checkPermissions();
    return check?.contacts === 'granted' ? 'granted' : 'prompt';
  } catch {
    return 'prompt';
  }
}


/** Push + local notifications. */
export async function requestNotifications(): Promise<PermissionStatus> {
  if (!Capacitor.isNativePlatform()) {
    if (typeof Notification === 'undefined') return 'unsupported';
    try {
      const result = await Notification.requestPermission();
      return result === 'granted' ? 'granted' : result === 'denied' ? 'denied' : 'prompt';
    } catch { return 'denied'; }
  }
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const push = await PushNotifications.requestPermissions();
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.requestPermissions();
    return push.receive === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

/** Camera permission (for future video calls / avatar capture). */
export async function requestCamera(): Promise<PermissionStatus> {
  if (!Capacitor.isNativePlatform()) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
      return 'granted';
    } catch { return 'denied'; }
  }
  try {
    const { Camera } = await import('@capacitor/camera');
    const res = await Camera.requestPermissions({ permissions: ['camera'] });
    return res.camera === 'granted' ? 'granted' : 'denied';
  } catch { return 'denied'; }
}

/**
 * Request all permissions required for a fully working call/SMS experience.
 * Call once after the user signs in.
 */
export async function requestAllPermissions(): Promise<AllPermissions> {
  // Mic + audio output FIRST so phone calls work immediately.
  const microphone = await requestMicrophone();
  const speaker = await unlockAudioOutput();
  // Then notifications (so missed call / SMS push works).
  const notifications = await requestNotifications();
  // Then contacts (so the dialer can autocomplete).
  const contacts = await requestContacts();
  // Camera last — only requested when user opens video call later.
  const camera: PermissionStatus = 'prompt';
  const result: AllPermissions = { microphone, speaker, contacts, notifications, camera };
  try { sessionStorage.setItem('lemtel-permissions', JSON.stringify(result)); } catch {}
  return result;
}

export function loadCachedPermissions(): AllPermissions | null {
  try {
    const raw = sessionStorage.getItem('lemtel-permissions');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/**
 * Non-prompting check of current permission state. Uses the Permissions API
 * where available, falls back to enumerateDevices() for microphone heuristics.
 */
export async function checkAllPermissions(): Promise<AllPermissions> {
  const perms: AllPermissions = {
    microphone: 'prompt',
    speaker: 'granted', // playback never gated
    contacts: 'prompt',
    notifications: 'prompt',
    camera: 'prompt',
  };

  // Microphone — try Permissions API, then enumerateDevices heuristic.
  try {
    if (Capacitor.isNativePlatform()) {
      // mozartec removed — no plugin check available on native; leave as 'prompt'.
    } else {
      const anyPerm: any = (navigator as any).permissions;
      if (anyPerm?.query) {
        try {
          const st = await anyPerm.query({ name: 'microphone' as PermissionName });
          if (st?.state === 'granted' || st?.state === 'denied' || st?.state === 'prompt') {
            perms.microphone = st.state as PermissionStatus;
          }
        } catch { /* not supported */ }
      }
      if (perms.microphone === 'prompt' && navigator.mediaDevices?.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const mic = devices.find((d) => d.kind === 'audioinput');
        if (mic && mic.label) perms.microphone = 'granted';
      }
    }
  } catch { /* ignore */ }

  // Notifications (web only; native uses real check via plugin).
  if (!Capacitor.isNativePlatform() && typeof Notification !== 'undefined') {
    perms.notifications =
      Notification.permission === 'granted' ? 'granted'
        : Notification.permission === 'denied' ? 'denied' : 'prompt';
  } else if (Capacitor.isNativePlatform()) {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      const res = await PushNotifications.checkPermissions();
      perms.notifications = res.receive === 'granted' ? 'granted'
        : res.receive === 'denied' ? 'denied' : 'prompt';
    } catch { /* ignore */ }
  }

  // Contacts (native only).
  if (Capacitor.isNativePlatform()) {
    try {
      const { Contacts } = await import('@capacitor-community/contacts');
      const res = await Contacts.checkPermissions();
      perms.contacts = res?.contacts === 'granted' ? 'granted'
        : res?.contacts === 'denied' ? 'denied' : 'prompt';
    } catch { /* ignore */ }
  }

  return perms;
}

/** Open the OS-level app settings page so the user can flip a denied permission. */
export async function openAppSettings(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const platform = Capacitor.getPlatform();
  try {
    if (platform === 'ios') {
      try {
        const { App } = await import('@capacitor/app');
        await (App as any).openUrl?.({ url: 'app-settings:' });
      } catch {
        window.open('app-settings:', '_system');
      }
      return;
    }
    if (platform === 'android') {
      // Try the native-settings plugin first (proper Android intent).
      try {
        const pkg = 'capacitor-native-settings';
        const mod: any = await import(/* @vite-ignore */ pkg);
        const NativeSettings = mod.NativeSettings ?? mod.default;
        if (NativeSettings?.openAndroid) {
          await NativeSettings.openAndroid({ option: 'application_details' });
          return;
        }
      } catch { /* plugin missing */ }
      // Fallback: use App plugin with the correct package intent URI.
      try {
        const { App } = await import('@capacitor/app');
        const info = await App.getInfo();
        const pkg = info?.id ?? 'com.lemtel.softphone';
        await (App as any).openUrl?.({ url: `package:${pkg}` });
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}
