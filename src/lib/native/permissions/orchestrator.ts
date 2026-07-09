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

export async function getPermissionStatuses(): Promise<PermissionsResult> {
  const [n, m, c] = await Promise.all([
    getPref("perm_notif_v1"),
    getPref("perm_mic_v1"),
    getPref("perm_contacts_v1"),
  ]);
  return {
    notifications: (n as PermStatus) ?? "prompt",
    microphone: (m as PermStatus) ?? "prompt",
    contacts: (c as PermStatus) ?? "prompt",
  };
}

export async function hasSeenPrimer(): Promise<boolean> {
  if (!(await isNative())) return true; // web: never show primer
  return (await getPref("permissions_primer_seen_v1")) === "true";
}

export async function markPrimerSkipped() {
  await setPref("permissions_primer_seen_v1", "true");
}
