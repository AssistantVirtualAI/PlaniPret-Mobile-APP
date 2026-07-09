import { isNative, setPref, type PermStatus } from "./platform";

export async function ensureContacts(): Promise<PermStatus> {
  let status: PermStatus = "unavailable";
  try {
    if (!(await isNative())) return "unavailable";
    const { Contacts } = await import("@capacitor-community/contacts");
    try {
      const check = await Contacts.checkPermissions();
      if (check.contacts === "granted") status = "granted";
      else {
        const req = await Contacts.requestPermissions();
        status = req.contacts === "granted" ? "granted" : "denied";
      }
    } catch {
      status = "denied";
    }
  } finally {
    await setPref("perm_contacts_v1", status);
  }
  return status;
}
