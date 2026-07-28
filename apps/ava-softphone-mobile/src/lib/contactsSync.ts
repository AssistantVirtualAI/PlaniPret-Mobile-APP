/**
 * Orchestrates device contact sync into Supabase.
 *
 * - Full sync on first launch (no lastSync timestamp)
 * - Delta sync every 24h afterwards (mobile contact APIs don't expose
 *   per-record updated_at on iOS, so we re-upsert the full set; the unique
 *   index on (user_id, source, phone_normalized) keeps it idempotent)
 * - Manual trigger from More → Contacts
 */
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import { syncDeviceContacts } from './contacts';
import { normalizePhone, formatDisplay } from './phoneNormalize';
import { supabase } from './mobileSupabase';

const LAST_SYNC_KEY = 'planipret.contactsSync.lastAt';
const LAST_COUNT_KEY = 'planipret.contactsSync.lastCount';
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface SyncReport {
  ok: boolean;
  inserted: number;
  total: number;
  skipped?: number;
  error?: string;
  ranAt: number;
}

export async function getLastSync(): Promise<{ at: number | null; count: number | null }> {
  try {
    const [{ value: at }, { value: count }] = await Promise.all([
      Preferences.get({ key: LAST_SYNC_KEY }),
      Preferences.get({ key: LAST_COUNT_KEY }),
    ]);
    return { at: at ? Number(at) : null, count: count ? Number(count) : null };
  } catch {
    return { at: null, count: null };
  }
}

async function persistLastSync(count: number) {
  try {
    await Preferences.set({ key: LAST_SYNC_KEY, value: String(Date.now()) });
    await Preferences.set({ key: LAST_COUNT_KEY, value: String(count) });
  } catch {}
}

export async function runContactsSync(opts: { force?: boolean } = {}): Promise<SyncReport> {
  const ranAt = Date.now();
  if (!Capacitor.isNativePlatform()) {
    return { ok: false, inserted: 0, total: 0, error: 'native-only', ranAt };
  }
  // App Store 5.1.2: refuse to upload any contact to the server unless the
  // user has given explicit in-app consent.
  const { hasConsent } = await import('./contactsConsent');
  if (!(await hasConsent())) {
    return { ok: false, inserted: 0, total: 0, error: 'no-consent', ranAt };
  }


  const device = await syncDeviceContacts();
  if (!device.length) {
    return { ok: false, inserted: 0, total: 0, error: 'no-permission-or-empty', ranAt };
  }

  // Flatten each phone entry into a contact row
  const contacts: Array<{
    external_id: string;
    full_name: string;
    phone: string;
    phone_label?: string;
    email?: string;
  }> = [];
  for (const c of device) {
    for (const p of c.phones) {
      const norm = normalizePhone(p.number);
      if (!norm) continue;
      contacts.push({
        external_id: `${c.id}:${norm}`,
        full_name: c.name,
        phone: formatDisplay(norm),
        phone_label: p.label,
        email: c.emails?.[0],
      });
    }
  }

  if (!contacts.length) {
    await persistLastSync(0);
    return { ok: true, inserted: 0, total: 0, ranAt };
  }

  try {
    const { data, error } = await supabase.functions.invoke('pp-contacts-upsert', {
      body: { source: 'device', contacts },
    });
    if (error || !data?.ok) {
      const msg = error?.message || data?.error || 'unknown';
      console.warn('[contactsSync] upsert failed', msg);
      return { ok: false, inserted: 0, total: contacts.length, error: msg, ranAt };
    }
    await persistLastSync(data.inserted ?? contacts.length);
    return { ok: true, inserted: data.inserted ?? 0, total: contacts.length, ranAt };
  } catch (e: any) {
    console.warn('[contactsSync] threw', e?.message);
    return { ok: false, inserted: 0, total: contacts.length, error: e?.message, ranAt };
  }
}

/** Runs a sync only if the last successful one is older than 24h. */
export async function maybeRunDeltaSync(): Promise<SyncReport | null> {
  const { at } = await getLastSync();
  if (at && Date.now() - at < SYNC_INTERVAL_MS) return null;
  return runContactsSync();
}
