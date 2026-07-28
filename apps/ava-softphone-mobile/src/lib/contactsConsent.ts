/**
 * Contacts consent gate (App Store Guideline 5.1.2).
 *
 * The App Store review requires an explicit in-app consent screen BEFORE the
 * app reads the device address book or uploads any of it to our servers.
 * The iOS `NSContactsUsageDescription` prompt alone is not enough because it
 * doesn't tell the user that the data is uploaded to Supabase.
 *
 * We persist consent in Capacitor Preferences so it survives reinstall of the
 * web bundle, and mirror it into a synchronous in-memory cache so gating code
 * paths (dialer autocomplete, contacts screen) can decide without awaiting.
 */
import { Preferences } from '@capacitor/preferences';
import { supabase } from './mobileSupabase';

const KEY = 'contacts_consent_v1';

export interface ConsentRecord {
  given: boolean;
  timestamp: string;
  version: '1.0';
}

let cached: ConsentRecord | null | undefined;

export async function loadConsent(): Promise<ConsentRecord | null> {
  if (cached !== undefined) return cached;
  try {
    const { value } = await Preferences.get({ key: KEY });
    cached = value ? (JSON.parse(value) as ConsentRecord) : null;
  } catch {
    cached = null;
  }
  return cached;
}

export function getConsentSync(): ConsentRecord | null {
  return cached ?? null;
}

export function hasConsentSync(): boolean {
  return !!cached?.given;
}

export async function hasConsent(): Promise<boolean> {
  const c = await loadConsent();
  return !!c?.given;
}

export async function setConsent(given: boolean): Promise<void> {
  const rec: ConsentRecord = { given, timestamp: new Date().toISOString(), version: '1.0' };
  cached = rec;
  try {
    await Preferences.set({ key: KEY, value: JSON.stringify(rec) });
  } catch {}
}

export async function revokeConsent(): Promise<void> {
  cached = null;
  try {
    await Preferences.remove({ key: KEY });
  } catch {}
  // Best-effort local cache clear
  try { sessionStorage.removeItem('lemtel-device-contacts'); } catch {}
}

/**
 * Delete every contact row this user uploaded from the device.
 * Called from "Delete my contacts from our servers" in Settings.
 */
export async function deleteServerContacts(userId?: string | null): Promise<{ ok: boolean; error?: string }> {
  try {
    let q = supabase.from('org_contacts' as any).delete().eq('source', 'device');
    if (userId) q = q.eq('owner_user_id', userId);
    const { error } = await q;
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'unknown' };
  }
}
