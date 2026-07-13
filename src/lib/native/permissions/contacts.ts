import { isNative, setPref, type PermStatus } from "./platform";

function mapContactsStatus(value: string | undefined | null): PermStatus {
  if (value === "granted") return "granted";
  if (value === "prompt" || value === "prompt-with-rationale") return "prompt";
  if (value === "denied") return "denied";
  return "prompt";
}

export async function getContactsPermissionStatus(): Promise<PermStatus> {
  let status: PermStatus = "unavailable";
  try {
    if (!(await isNative())) return "unavailable";
    const { Contacts } = await import("@capacitor-community/contacts");
    const check = await Contacts.checkPermissions();
    status = mapContactsStatus(check.contacts);
  } catch {
    status = "denied";
  } finally {
    await setPref("perm_contacts_v1", status);
  }
  return status;
}

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
        status = mapContactsStatus(req.contacts);
        if (status !== "granted") status = "denied";
      }
    } catch {
      status = "denied";
    }
  } finally {
    await setPref("perm_contacts_v1", status);
  }
  return status;
}
