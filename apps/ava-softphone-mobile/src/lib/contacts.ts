/**
 * Device contacts sync for the dialer autocomplete.
 * Reads contacts via @capacitor-community/contacts and caches a slim version
 * in sessionStorage so the dialer stays fast.
 */
import { Capacitor } from '@capacitor/core';
import { hasConsent, hasConsentSync } from './contactsConsent';

export interface PhoneEntry { number: string; label?: string }
export interface DeviceContact {
  id: string;
  name: string;
  /** numéros (avec libellé : mobile, work, home…). */
  phones: PhoneEntry[];
  /** alias plat conservé pour compat ascendante. */
  numbers: string[];
  emails?: string[];
}

const CACHE_KEY = 'lemtel-device-contacts';

export async function syncDeviceContacts(): Promise<DeviceContact[]> {
  if (!Capacitor.isNativePlatform()) return [];
  // App Store 5.1.2: never read the device address book unless the user has
  // given explicit in-app consent via the ContactsConsentSheet.
  if (!(await hasConsent())) return loadCachedContacts();
  try {
    const { Contacts } = await import('@capacitor-community/contacts');
    const perm = await Contacts.checkPermissions();
    if (perm.contacts !== 'granted') {
      const req = await Contacts.requestPermissions();
      if (req.contacts !== 'granted') return [];
    }

    const result = await Contacts.getContacts({
      projection: { name: true, phones: true, emails: true },
    });
    const contacts: DeviceContact[] = (result.contacts || [])
      .map((c: any) => {
        const phones: PhoneEntry[] = (c.phones || [])
          .map((p: any) => ({ number: String(p.number || '').trim(), label: p.type || p.label || undefined }))
          .filter((p: PhoneEntry) => p.number);
        return {
          id: c.contactId,
          name: c.name?.display || [c.name?.given, c.name?.family].filter(Boolean).join(' ') || 'Unknown',
          phones,
          numbers: phones.map((p) => p.number),
          emails: (c.emails || []).map((e: any) => e.address).filter(Boolean),
        } as DeviceContact;
      })
      .filter((c) => c.phones.length > 0);

    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(contacts)); } catch {}
    return contacts;
  } catch (e) {
    console.warn('[contacts] sync failed', e);
    return [];
  }
}

export function loadCachedContacts(): DeviceContact[] {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    const list: any[] = raw ? JSON.parse(raw) : [];
    // Migration : anciennes entrées sans `phones`.
    return list.map((c) => ({
      ...c,
      phones: Array.isArray(c.phones) && c.phones.length
        ? c.phones
        : (Array.isArray(c.numbers) ? c.numbers.map((n: string) => ({ number: n })) : []),
    })) as DeviceContact[];
  } catch { return []; }
}

export function searchContacts(query: string, contacts?: DeviceContact[]): DeviceContact[] {
  const pool = contacts || loadCachedContacts();
  if (!query) return pool.slice(0, 50);
  const q = query.toLowerCase().replace(/\s+/g, '');
  return pool
    .filter((c) =>
      c.name.toLowerCase().includes(q) ||
      c.numbers.some((n) => n.replace(/\D/g, '').includes(q.replace(/\D/g, '')))
    )
    .slice(0, 50);
}
