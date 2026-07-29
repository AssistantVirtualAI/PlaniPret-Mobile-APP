// Sequential VoIP-standard permission flow: notifications → mic → contacts.
// Waits ~400ms between prompts so iOS 17+ doesn't drop the next sheet.
import { ensureNotifications } from "./notifications";
import { ensureMic } from "./microphone";
import { ensureContacts } from "./contacts";
import { setPref, getPref, isNative, type PermStatus } from "./platform";

export type PermissionsResult = {
  notifications: PermStatus;
  microphone: PermStatus;
  contacts: PermStatus;
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runPermissionFlow(extension?: string): Promise<PermissionsResult> {
  const notifications = await ensureNotifications(extension);
  await wait(400);
  const microphone = await ensureMic();
  await wait(400);
  const contacts = await ensureContacts();
  await setPref("permissions_primer_seen_v1", "true");
  return { notifications, microphone, contacts };
}

/**
 * Lit l'état réel des permissions depuis l'API système (pas le cache Preferences).
 *
 * Correctif : l'ancienne version lisait uniquement le cache Preferences, ce qui
 * faisait que les bannières restaient affichées même après que l'utilisateur
 * avait accordé la permission depuis les réglages iOS/Android.
 */
export async function getPermissionStatuses(): Promise<PermissionsResult> {
  if (!(await isNative())) {
    return { notifications: "granted", microphone: "granted", contacts: "granted" };
  }

  // Notifications — interroger PushNotifications.checkPermissions() directement
  let notifications: PermStatus = "prompt";
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const check = await PushNotifications.checkPermissions();
    if (check.receive === "granted") notifications = "granted";
    else if (check.receive === "denied") notifications = "denied";
    else notifications = "prompt";
    await setPref("perm_notif_v1", notifications);
  } catch {
    const cached = await getPref("perm_notif_v1");
    notifications = (cached as PermStatus) ?? "prompt";
  }

  // Microphone — interroger navigator.permissions.query
  let microphone: PermStatus = "prompt";
  try {
    if (typeof navigator !== "undefined" && (navigator as any).permissions?.query) {
      const r = await (navigator as any).permissions.query({ name: "microphone" as PermissionName });
      if (r?.state === "granted") microphone = "granted";
      else if (r?.state === "denied") microphone = "denied";
      else microphone = "prompt";
      await setPref("perm_mic_v1", microphone);
    } else {
      const cached = await getPref("perm_mic_v1");
      microphone = (cached as PermStatus) ?? "prompt";
    }
  } catch {
    const cached = await getPref("perm_mic_v1");
    microphone = (cached as PermStatus) ?? "prompt";
  }

  // Contacts — interroger @capacitor-community/contacts directement
  let contacts: PermStatus = "prompt";
  try {
    const { Contacts } = await import("@capacitor-community/contacts");
    const check = await Contacts.checkPermissions();
    const state = (check as any).contacts ?? (check as any).readContacts ?? "prompt";
    if (state === "granted") contacts = "granted";
    else if (state === "denied") contacts = "denied";
    else contacts = "prompt";
    await setPref("perm_contacts_v1", contacts);
  } catch {
    const cached = await getPref("perm_contacts_v1");
    contacts = (cached as PermStatus) ?? "prompt";
  }

  return { notifications, microphone, contacts };
}

export async function hasSeenPrimer(): Promise<boolean> {
  if (!(await isNative())) return true; // web: never show primer
  return (await getPref("permissions_primer_seen_v1")) === "true";
}

export async function markPrimerSkipped() {
  await setPref("permissions_primer_seen_v1", "true");
}
