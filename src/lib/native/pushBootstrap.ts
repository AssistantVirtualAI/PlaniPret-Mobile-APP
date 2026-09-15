// Registers push + local-notification listeners on app start (native only)
// so notifications delivered to a previously-granted device keep working
// without needing the primer to run again.
import { isNative } from "./permissions/platform";
import { registerPushListeners } from "./permissions/notifications";
import { ensureIncomingCallActionType } from "./permissions/localCallNotifications";


async function ensureAndroidChannels() {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.getPlatform() !== "android") return;
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await Promise.all([
      LocalNotifications.createChannel({ id: "planipret_default", name: "Notifications", importance: 5, visibility: 1 }),
      LocalNotifications.createChannel({ id: "sms", name: "Messages", importance: 5, visibility: 1 }),
      LocalNotifications.createChannel({ id: "voicemail", name: "Messagerie vocale", importance: 5, visibility: 1 }),
    ]);
  } catch { /* ignore */ }
}

let booted = false;

export async function bootstrapPushIfNative(extension?: string) {
  if (booted) return;
  booted = true;
  try {
    if (!(await isNative())) return;
    await ensureIncomingCallActionType();
    await ensureAndroidChannels();
    // Only wires listeners; does not prompt. Register call is a no-op if
    // permission is not granted yet.
    await registerPushListeners(extension);
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const check = await PushNotifications.checkPermissions();
      if (check.receive === "granted") await PushNotifications.register();
      // Without an OS push token the backend cannot wake the app to re-REGISTER
      // its SIP line. Retry (and prompt once) when nothing came back.
      setTimeout(async () => {
        try {
          const { hasUploadedPushToken, ensureNotifications } = await import("./permissions/notifications");
          if (hasUploadedPushToken()) return;
          const again = await PushNotifications.checkPermissions();
          if (again.receive === "granted") await PushNotifications.register();
          else await ensureNotifications(extension);
        } catch { /* ignore */ }
      }, 8000);
    } catch { /* ignore */ }
  } catch (e) {
    console.warn("[push] bootstrap failed", e);
  }
}
