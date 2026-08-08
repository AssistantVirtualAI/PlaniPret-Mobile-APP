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
    if (status === "granted") void syncDeviceContactsToServer();
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
    if (status === "granted") void syncDeviceContactsToServer();
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

/**
 * Uploads the device address book to `planipret_contacts` so AVA (chatbot and
 * ElevenLabs voice agent) can find people by first name, last name or number.
 * Runs at most once every 12h, silently, and only when the user granted the
 * Contacts permission. Can be disabled from Settings.
 */
const SYNC_KEY = "pp:contacts:lastDeviceSync";
const SYNC_TTL_MS = 12 * 60 * 60 * 1000;
const OPT_OUT_KEY = "pp:contacts:avaSyncDisabled";

export function isDeviceContactSyncEnabled(): boolean {
  try { return localStorage.getItem(OPT_OUT_KEY) !== "1"; } catch { return true; }
}

export function setDeviceContactSyncEnabled(enabled: boolean) {
  try {
    if (enabled) localStorage.removeItem(OPT_OUT_KEY);
    else localStorage.setItem(OPT_OUT_KEY, "1");
  } catch { /* ignore */ }
}

export async function syncDeviceContactsToServer(force = false): Promise<number> {
  try {
    if (!isDeviceContactSyncEnabled()) return 0;
    if (!force) {
      const last = Number(localStorage.getItem(SYNC_KEY) ?? 0);
      if (last && Date.now() - last < SYNC_TTL_MS) return 0;
    }
    const entries = await listDeviceContacts();
    const contacts = entries
      .filter((c) => c.phone)
      .map((c) => ({
        external_id: c.id,
        full_name: c.display_name || `${c.first_name} ${c.last_name}`.trim(),
        phone: c.phone,
        email: c.email || null,
        company: c.company || null,
      }));
    if (!contacts.length) return 0;
    const { supabase } = await import("@/integrations/supabase/client");
    const { error } = await supabase.functions.invoke("pp-contacts-upsert", {
      body: { contacts, source: "device" },
    });
    if (error) return 0;
    try { localStorage.setItem(SYNC_KEY, String(Date.now())); } catch { /* ignore */ }
    return contacts.length;
  } catch {
    return 0;
  }
}
