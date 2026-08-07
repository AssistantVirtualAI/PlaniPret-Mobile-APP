import { isNative, getPlatform, setPref, type PermStatus } from "./platform";
import { supabase } from "@/integrations/supabase/client";
import { ensureIncomingCallActionType, showIncomingCallNotification } from "./localCallNotifications";

let listenersRegistered = false;
const PENDING_INCOMING_KEY = "pp.pending-incoming-action.v1";

type IncomingNotificationAction = "open" | "answer" | "decline";

function publishIncomingAction(callId: string, action: IncomingNotificationAction, from?: string) {
  if (!callId) return;
  const detail = { callId, action, from: from ?? "", ts: Date.now() };
  try { sessionStorage.setItem(PENDING_INCOMING_KEY, JSON.stringify(detail)); } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent("pp:incoming-notification-action", { detail })); } catch { /* ignore */ }
  // Keep the mounted shell alive. A full location.assign() reload used to lose
  // the native INVITE and leave the user on the calls/home page with no controls.
  try {
    if (!window.location.pathname.startsWith("/mplanipret")) {
      window.location.assign("/mplanipret/calls");
    } else if (window.location.pathname !== "/mplanipret/calls") {
      window.history.replaceState(window.history.state, "", "/mplanipret/calls");
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  } catch { /* ignore */ }
}

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
        // Android counterpart of the iOS PushKit wake: the FCM data message is
        // the only reliable way to get the app running again, so ask the native
        // keep-alive service to re-REGISTER before the INVITE arrives.
        if (platform === "android") {
          try {
            const { wakePlanipretNativeSipForIncomingCall } = await import(
              "@/lib/planipret/sip/nativePpSipService"
            );
            await wakePlanipretNativeSipForIncomingCall("fcm_push");
          } catch (e) {
            console.warn("[push] native SIP wake failed", e);
          }
        }
        await showIncomingCallNotification({
          callId: data.call_id ?? data.ns_callid ?? "",
          from: data.from ?? data.callerName ?? notif.title ?? "Unknown caller",
        });
      }
      else if (notif.title) {
        // Foreground pushes are not surfaced by the OS — mirror them locally so
        // SMS / voicemail / AI alerts always appear on the device.
        try {
          const { LocalNotifications } = await import("@capacitor/local-notifications");
          await LocalNotifications.schedule({
            notifications: [{
              id: Math.floor(Math.random() * 1_000_000_000),
              title: notif.title,
              body: notif.body ?? "",
              channelId: data.category === "sms" ? "sms" : data.category === "voicemail" ? "voicemail" : "planipret_default",
              extra: data,
            }],
          });
        } catch { /* ignore */ }
      }
    });

    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const data = (action.notification?.data ?? {}) as Record<string, string>;
      const callId = data.call_id ?? data.ns_callid ?? "";
      if (callId) {
        const act: IncomingNotificationAction = action.actionId === "decline"
          ? "decline"
          : action.actionId === "answer" ? "answer" : "open";
        publishIncomingAction(callId, act, data.from ?? action.notification?.body);
      }
    });

    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await ensureIncomingCallActionType();
      LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
        const data = (event.notification?.extra ?? {}) as Record<string, string>;
        // Native PpSipKeepAlive uses pp_call_id; JS-scheduled notifications use
        // callId. Accept both so a banner tap always restores the ringing UI.
        const callId = data.callId ?? data.pp_call_id ?? "";
        if (callId) {
          const act: IncomingNotificationAction = event.actionId === "decline"
            ? "decline"
            : event.actionId === "answer" ? "answer" : "open";
          publishIncomingAction(callId, act, event.notification?.body);
        }
      });
    } catch { /* ignore */ }

    listenersRegistered = true;
  } catch (e) {
    console.warn("[push] listener setup failed", e);
  }
}
