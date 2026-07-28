/**
 * Push notification registration for Lemtel AI Phone.
 * Registers APNs / FCM token with the backend so missed calls,
 * voicemails and SMS can wake the device.
 */
import { Capacitor } from '@capacitor/core';

export type PushHandler = (payload: { title?: string; body?: string; data?: any }) => void;

let registered = false;

export async function registerPush(opts: {
  onToken?: (token: string, platform: 'ios' | 'android') => void;
  onMessage?: PushHandler;
  onAction?: PushHandler;
}): Promise<void> {
  if (!Capacitor.isNativePlatform() || registered) return;
  registered = true;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const perm = await PushNotifications.checkPermissions();
    if (perm.receive !== 'granted') {
      const r = await PushNotifications.requestPermissions();
      if (r.receive !== 'granted') { registered = false; return; }
    }

    await PushNotifications.register();

    PushNotifications.addListener('registration', (t) => {
      opts.onToken?.(t.value, Capacitor.getPlatform() as 'ios' | 'android');
    });
    PushNotifications.addListener('registrationError', (err) => {
      console.warn('[push] registration error', err);
    });
    PushNotifications.addListener('pushNotificationReceived', (n) => {
      opts.onMessage?.({ title: n.title, body: n.body, data: n.data });
    });
    PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
      opts.onAction?.({
        title: a.notification.title,
        body: a.notification.body,
        data: a.notification.data,
      });
    });
  } catch (e) {
    console.warn('[push] init failed', e);
    registered = false;
  }
}

/** Best-effort: register the push token against the AVA backend. */
export async function sendPushTokenToBackend(args: {
  token: string;
  platform: 'ios' | 'android';
  portalUrl: string;
  accessToken: string;
  extension: string;
}): Promise<void> {
  try {
    await fetch(`${args.portalUrl.replace(/\/$/, '')}/functions/v1/mobile-register-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${args.accessToken}`,
      },
      body: JSON.stringify({
        token: args.token,
        platform: args.platform,
        extension: args.extension,
      }),
    });
  } catch (e) {
    console.warn('[push] backend register failed', e);
  }
}
