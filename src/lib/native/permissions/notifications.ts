import { isNative, getPlatform, setPref, type PermStatus } from "./platform";
import { supabase } from "@/integrations/supabase/client";
import { ensureIncomingCallActionType, showIncomingCallNotification } from "./localCallNotifications";

let listenersRegistered = false;
let apnsTokenUploaded = false;
let listenersPromise: Promise<void> | null = null;
let registerPromise: Promise<void> | null = null;
let currentExtension = "";
const PENDING_INCOMING_KEY = "pp.pending-incoming-action.v1";

/** True once the OS push token has been accepted by the backend. Used by the
 *  bootstrap to retry: without this token the backend cannot wake the app to
 *  re-REGISTER its `<ext>M` line. */
export function hasUploadedPushToken() {
  return apnsTokenUploaded;
}

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

function notificationRoute(data: Record<string, string>): string {
  const byType: Record<string, string> = {
    sms: "/mplanipret/messages",
    message: "/mplanipret/messages",
    voicemail: "/mplanipret/voicemail",
    missed_call: "/mplanipret/calls",
    call: "/mplanipret/calls",
    task: "/mplanipret/tasks",
  };
  const raw = String(data.deep_link ?? data.route ?? data.path ?? data.url ?? "").trim();
  if (raw) {
    try {
      const path = raw.startsWith("/") ? raw : new URL(raw).pathname;
      if (/^\/mplanipret(?:\/|$)/.test(path)) return path;
    } catch { /* malformed/external route ignored */ }
  }
  return byType[String(data.type ?? data.category ?? "").toLowerCase()] ?? "/mplanipret/notifications";
}

function openInternalRoute(data: Record<string, string>) {
  const route = notificationRoute(data);
  if (window.location.pathname === route) return;
  window.history.pushState(window.history.state, "", route);
  window.dispatchEvent(new PopStateEvent("popstate"));
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
        if (!registerPromise) {
          registerPromise = PushNotifications.register()
            .then(() => undefined)
            .finally(() => { registerPromise = null; });
        }
        await registerPromise;
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
  currentExtension = extension || currentExtension;
  if (listenersRegistered) return;
  if (listenersPromise) return listenersPromise;
  if (!(await isNative())) return;
  listenersPromise = (async () => {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const platform = await getPlatform();

    PushNotifications.addListener("registration", async (token) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const { error } = await supabase.functions.invoke("mobile-register-push", {
            body: { token: token.value, platform, extension: currentExtension },
          });
          if (!error) { apnsTokenUploaded = true; return; }
          console.warn("[push] register rejected", error);
        } catch (e) {
          console.warn("[push] register failed", e);
        }
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
    });

    PushNotifications.addListener("registrationError", (err) => {
      console.warn("[push] registrationError", err);
    });

    PushNotifications.addListener("pushNotificationReceived", async (notif) => {
      const data = (notif.data ?? {}) as Record<string, string>;
      if (data.type === "sip_register") {
        // Silent wake sent by the backend when `<ext>M` is not registered:
        // redo exactly what login does — re-REGISTER our own AOR.
        if (platform === "android") {
          try {
            const { wakePlanipretNativeSipForIncomingCall } = await import(
              "@/lib/planipret/sip/nativePpSipService"
            );
            await wakePlanipretNativeSipForIncomingCall("sip_register_push");
          } catch { /* ignore */ }
        }
        try {
          window.dispatchEvent(new CustomEvent("pp:sip-ready", { detail: { force: true } }));
        } catch { /* ignore */ }
        return;
      }
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
      } else {
        openInternalRoute(data);
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
        } else {
          openInternalRoute(data);
        }
      });
    } catch { /* ignore */ }

    listenersRegistered = true;
  })().catch((e) => {
    listenersPromise = null;
    console.warn("[push] listener setup failed", e);
  });
  return listenersPromise;
}
