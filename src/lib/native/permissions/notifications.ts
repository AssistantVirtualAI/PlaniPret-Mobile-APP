import { isNative, getPlatform, setPref, type PermStatus } from "./platform";
import { supabase } from "@/integrations/supabase/client";
import { ensureIncomingCallActionType, showIncomingCallNotification } from "./localCallNotifications";

let listenersRegistered = false;

export async function ensureNotifications(extension?: string): Promise<PermStatus> {
  let status: PermStatus = "unavailable";
  try {
    if (!(await isNative())) return "unavailable";
    const { PushNotifications } = await import("@capacitor/push-notifications");
    try {
      const check = await PushNotifications.checkPermissions();
      if (check.receive === "granted") status = "granted";
      else {
        const req = await PushNotifications.requestPermissions();
        status = req.receive === "granted" ? "granted" : "denied";
      }
      if (status === "granted") {
        await registerPushListeners(extension);
        await PushNotifications.register();
      }
    } catch {
      status = "denied";
    }
  } finally {
    await setPref("perm_notif_v1", status);
  }
  return status;
}

export async function registerPushListeners(extension?: string) {
  if (listenersRegistered) return;
  if (!(await isNative())) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const platform = await getPlatform();

    PushNotifications.addListener("registration", async (token) => {
      try {
        await supabase.functions.invoke("mobile-register-push", {
          body: { token: token.value, platform, extension: extension ?? "" },
        });
      } catch (e) {
        console.warn("[push] register failed", e);
      }
    });

    PushNotifications.addListener("registrationError", (err) => {
      console.warn("[push] registrationError", err);
    });

    PushNotifications.addListener("pushNotificationReceived", async (notif) => {
      const data = (notif.data ?? {}) as Record<string, string>;
      if (data.type === "incoming_call") {
        await showIncomingCallNotification({
          callId: data.call_id ?? data.ns_callid ?? "",
          from: data.from ?? notif.title ?? "Unknown caller",
        });
      }
    });

    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const data = (action.notification?.data ?? {}) as Record<string, string>;
      const callId = data.call_id ?? data.ns_callid ?? "";
      if (callId) {
        const act = action.actionId === "decline" ? "decline" : "answer";
        try { window.location.assign(`/mplanipret/calls?incoming=${encodeURIComponent(callId)}&action=${act}`); } catch { /* ignore */ }
      }
    });

    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await ensureIncomingCallActionType();
      LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
        const data = (event.notification?.extra ?? {}) as Record<string, string>;
        const callId = data.callId ?? "";
        if (callId) {
          const act = event.actionId === "decline" ? "decline" : "answer";
          try { window.location.assign(`/mplanipret/calls?incoming=${encodeURIComponent(callId)}&action=${act}`); } catch { /* ignore */ }
        }
      });
    } catch { /* ignore */ }

    listenersRegistered = true;
  } catch (e) {
    console.warn("[push] listener setup failed", e);
  }
}
