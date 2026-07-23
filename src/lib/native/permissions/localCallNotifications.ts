// Local notification helper for incoming-call heads-up (Answer / Decline).
// Best-effort; falls back to a silent no-op on web.
import { isNative } from "./platform";

let actionTypeRegistered = false;

export async function ensureIncomingCallActionType() {
  if (actionTypeRegistered) return;
  if (!(await isNative())) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.registerActionTypes({
      types: [{
        id: "INCOMING_CALL",
        actions: [
          { id: "answer", title: "Answer" },
          { id: "decline", title: "Decline", destructive: true },
        ],
      }],
    });
    actionTypeRegistered = true;
  } catch { /* ignore */ }
}

export async function showIncomingCallNotification(args: { callId: string; from: string }) {
  if (!(await isNative())) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await ensureIncomingCallActionType();
    await LocalNotifications.schedule({
      notifications: [{
        id: Math.floor(Math.random() * 2_000_000_000),
        title: "Incoming call",
        body: args.from || "Unknown caller",
        actionTypeId: "INCOMING_CALL",
        extra: { callId: args.callId, type: "incoming_call" },
        smallIcon: "ic_stat_icon_config_sample",
        sound: "beep.wav",
        ongoing: true,
      }],
    });
  } catch { /* ignore */ }
}
