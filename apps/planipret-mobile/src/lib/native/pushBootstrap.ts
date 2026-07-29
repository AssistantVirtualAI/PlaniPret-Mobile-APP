// Registers push + local-notification listeners on app start (native only)
// so notifications delivered to a previously-granted device keep working
// without needing the primer to run again.
import { isNative } from "./permissions/platform";
import { registerPushListeners } from "./permissions/notifications";
import { ensureIncomingCallActionType } from "./permissions/localCallNotifications";

let booted = false;

export async function bootstrapPushIfNative(extension?: string) {
  if (booted) return;
  booted = true;
  try {
    if (!(await isNative())) return;
    await ensureIncomingCallActionType();
    // Only wires listeners; does not prompt. Register call is a no-op if
    // permission is not granted yet.
    await registerPushListeners(extension);
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const check = await PushNotifications.checkPermissions();
      if (check.receive === "granted") await PushNotifications.register();
    } catch { /* ignore */ }
  } catch (e) {
    console.warn("[push] bootstrap failed", e);
  }
}
