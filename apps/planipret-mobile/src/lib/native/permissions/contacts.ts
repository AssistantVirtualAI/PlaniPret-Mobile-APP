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

function firstValue<T extends Record<string, any>>(items: T[] | undefined, key: keyof T): string {
  const primary = items?.find((x) => x?.isPrimary && x?.[key]);
  const any = primary ?? items?.find((x) => x?.[key]);
  return String(any?.[key] ?? "").trim();
}

export type NativeContactEntry = {
  id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  phone: string;
  email: string;
  company: string;
  source: "native";
};

export async function listDeviceContacts(): Promise<NativeContactEntry[]> {
  try {
    if ((await getContactsPermissionStatus()) !== "granted") return [];
    const { Contacts } = await import("@capacitor-community/contacts");
    const res = await Contacts.getContacts({
      projection: { name: true, phones: true, emails: true, organization: true },
    });
    return (res.contacts ?? []).map((c: any) => {
      const first = String(c.name?.given ?? "").trim();
      const last = String(c.name?.family ?? "").trim();
      const display = String(c.name?.display ?? [first, last].filter(Boolean).join(" ") ?? "").trim();
      return {
        id: c.contactId ?? crypto.randomUUID(),
        first_name: first,
        last_name: last,
        display_name: display,
        phone: firstValue(c.phones, "number"),
        email: firstValue(c.emails, "address"),
        company: String(c.organization?.company ?? "").trim(),
        source: "native" as const,
      };
    }).filter((c) => c.display_name || c.phone || c.email);
  } catch {
    return [];
  }
}
