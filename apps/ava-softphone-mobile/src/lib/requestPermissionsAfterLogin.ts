import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

function safeStringify(v: any): string {
  try { return JSON.stringify(v); } catch { return String(v); }
}

async function log(step: string, data?: any) {
  const msg = `[Perms][${new Date().toISOString()}] ${step}${data !== undefined ? ' ' + safeStringify(data) : ''}`;
  // eslint-disable-next-line no-console
  console.log(msg);
  try {
    const { value } = await Preferences.get({ key: 'perm_log' });
    const logs = value ? value + '\n' + msg : msg;
    await Preferences.set({ key: 'perm_log', value: logs.slice(-8000) });
  } catch {}
}

async function getAppContext(): Promise<Record<string, any>> {
  const ctx: Record<string, any> = {
    platform: (() => { try { return Capacitor.getPlatform(); } catch { return 'unknown'; } })(),
    isNative: (() => { try { return Capacitor.isNativePlatform(); } catch { return false; } })(),
    ua: typeof navigator !== 'undefined' ? navigator.userAgent?.slice(0, 120) : undefined,
    ts: new Date().toISOString(),
  };
  try {
    const { App } = await import('@capacitor/app');
    const info = await App.getInfo();
    ctx.appId = info.id;
    ctx.appName = info.name;
    ctx.versionName = (info as any).version;
    ctx.versionCode = (info as any).build;
  } catch (e) {
    ctx.appInfoError = String(e);
  }
  try {
    const uid = await Preferences.get({ key: 'sb_user_id' });
    if (uid.value) ctx.uid = uid.value;
  } catch {}
  return ctx;
}

export async function setPermissionLogContext(extra: Record<string, any>) {
  try {
    await Preferences.set({ key: 'perm_ctx_extra', value: safeStringify(extra) });
  } catch {}
}

export async function requestPermissionsAfterLogin(): Promise<void> {
  const ctx = await getAppContext();
  try {
    const extra = await Preferences.get({ key: 'perm_ctx_extra' });
    if (extra.value) ctx.extra = JSON.parse(extra.value);
  } catch {}
  await Preferences.set({ key: 'perm_ctx', value: safeStringify(ctx) }).catch(() => {});
  await log('START', ctx);

  if (!Capacitor.isNativePlatform()) {
    await log('SKIP - not native');
    return;
  }

  const platform = Capacitor.getPlatform();

  // Idempotency flag (v2 so old installs re-run once with logging)
  try {
    await log('CHECK v2 flag');
    const { value } = await Preferences.get({ key: 'permissions_requested_v2' });
    await log('v2 flag value', { value });
    if (value === 'true') { await log('SKIP - already done'); return; }
  } catch (e) {
    await log('ERROR checking v2 flag', { error: String(e) });
  }

  // STEP A: Import PushNotifications
  await log('STEP A: importing PushNotifications');
  let PushNotifications: any = null;
  try {
    const mod = await import('@capacitor/push-notifications');
    PushNotifications = mod.PushNotifications;
    await log('STEP A: import success');
  } catch (e) {
    await log('STEP A: import FAILED', { error: String(e), ctx });
    PushNotifications = null;
  }

  // STEP B: Add listeners
  if (PushNotifications) {
    try {
      await PushNotifications.addListener('registration', (token: any) => {
        void log('FCM token received', { token: token?.value?.slice(0, 20) });
      });
      await log('STEP B: registration listener added');
    } catch (e) {
      await log('STEP B: addListener registration FAILED', { error: String(e), ctx });
    }
    try {
      await PushNotifications.addListener('registrationError', (error: any) => {
        void log('FCM registration error', { error: String(error) });
      });
      await log('STEP B: registrationError listener added');
    } catch (e) {
      await log('STEP B: addListener registrationError FAILED', { error: String(e), ctx });
    }
  }

  // STEP C: checkPermissions
  await log('STEP C: checkPermissions');
  let permStatus: any = null;
  try {
    permStatus = await PushNotifications?.checkPermissions();
    await log('STEP C: status', { receive: permStatus?.receive });
  } catch (e) {
    await log('STEP C: checkPermissions FAILED', { error: String(e), ctx });
  }

  // STEP D: requestPermissions + register
  await log('STEP D: requestPermissions', { currentStatus: permStatus?.receive });
  try {
    if (permStatus?.receive === 'prompt' || permStatus?.receive === 'prompt-with-rationale') {
      await log('STEP D: showing permission dialog');
      const result = await PushNotifications?.requestPermissions();
      await log('STEP D: result', { receive: result?.receive });
      if (result?.receive === 'granted') {
        await log('STEP D: calling register()');
        await PushNotifications?.register();
        await log('STEP D: register() success');
      }
    } else if (permStatus?.receive === 'granted') {
      await log('STEP D: already granted, calling register()');
      try {
        await PushNotifications?.register();
        await log('STEP D: register() success');
      } catch (e) {
        await log('STEP D: register() FAILED', { error: String(e), ctx });
      }
    } else {
      await log('STEP D: skipping', { status: permStatus?.receive });
    }
  } catch (e) {
    await log('STEP D: CRASHED', { error: String(e), stack: (e as any)?.stack, ctx });
  }

  // STEP E: Microphone (iOS only)
  await log('STEP E: microphone check', { platform });
  if (platform === 'ios') {
    try {
      await log('STEP E: calling getUserMedia');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      await log('STEP E: microphone granted');
    } catch (e) {
      await log('STEP E: microphone FAILED', { error: String(e), ctx });
    }
  } else {
    await log('STEP E: skipping microphone on Android');
  }

  // STEP F: Contacts (iOS only)
  await log('STEP F: contacts check', { platform });
  if (platform === 'ios') {
    try {
      await log('STEP F: importing Contacts');
      const { Contacts } = await import('@capacitor-community/contacts');
      await log('STEP F: requesting contacts permission');
      await (Contacts as any).requestPermissions();
      await log('STEP F: contacts done');
    } catch (e) {
      await log('STEP F: contacts FAILED', { error: String(e), ctx });
    }
  } else {
    await log('STEP F: skipping contacts on Android');
  }

  // Save flag
  await log('SAVING flag v2');
  try {
    await Preferences.set({ key: 'permissions_requested_v2', value: 'true' });
    await log('FLAG SAVED - all done');
  } catch (e) {
    await log('FLAG SAVE FAILED', { error: String(e), ctx });
  }
}

export async function getPermissionLogs(): Promise<string> {
  try {
    const [ctxRes, logsRes, navRes] = await Promise.all([
      Preferences.get({ key: 'perm_ctx' }),
      Preferences.get({ key: 'perm_log' }),
      Preferences.get({ key: 'nav_log' }),
    ]);
    const parts: string[] = [];
    parts.push('=== CONTEXT ===');
    parts.push(ctxRes.value || '(none)');
    parts.push('\n=== PERMISSION LOG ===');
    parts.push(logsRes.value || '(empty)');
    parts.push('\n=== NAV/MOUNT LOG ===');
    parts.push(navRes.value || '(empty)');
    return parts.join('\n');
  } catch (e) {
    return 'Error reading logs: ' + String(e);
  }
}

export async function clearPermissionLogs(): Promise<void> {
  try {
    await Promise.all([
      Preferences.remove({ key: 'perm_log' }),
      Preferences.remove({ key: 'nav_log' }),
      Preferences.remove({ key: 'perm_ctx' }),
    ]);
  } catch {}
}

// Lightweight nav logger reused by MobileApp.tsx
export async function navLog(step: string, data?: any) {
  const msg = `[Nav][${new Date().toISOString()}] ${step}${data !== undefined ? ' ' + safeStringify(data) : ''}`;
  // eslint-disable-next-line no-console
  console.log(msg);
  try {
    const { value } = await Preferences.get({ key: 'nav_log' });
    const logs = value ? value + '\n' + msg : msg;
    await Preferences.set({ key: 'nav_log', value: logs.slice(-8000) });
  } catch {}
}
