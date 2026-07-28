/**
 * Caller-ID lookup helper. Calls `pp-caller-lookup` edge function and
 * caches results client-side for the duration of the session.
 */
import { supabase } from '../mobileSupabase';
import { normalizePhone, formatDisplay } from '../phoneNormalize';
import { txStatic } from '../i18n';

export interface CallerLookup {
  found: boolean;
  source: 'device' | 'maestro' | 'broker' | 'microsoft' | null;
  name: string;
  display_number: string;
  raw_number: string;
  phone_normalized: string | null;
  company?: string | null;
  photo_url?: string | null;
  email?: string | null;
  crm_meta?: { stage?: string; score?: number; tags?: any } | null;
  ms_meta?: { mobile?: string; business?: string[]; email?: string } | null;
}

const cache = new Map<string, { at: number; v: CallerLookup }>();
const TTL = 5 * 60 * 1000;

export async function lookupCaller(rawNumber: string): Promise<CallerLookup> {
  const normalized = normalizePhone(rawNumber);
  const fallback: CallerLookup = {
    found: false,
    source: null,
    name: formatDisplay(normalized) || rawNumber || txStatic('Inconnu', 'Unknown'),
    display_number: formatDisplay(normalized) || rawNumber,
    raw_number: rawNumber,
    phone_normalized: normalized,
  };
  if (!normalized) return fallback;

  const hit = cache.get(normalized);
  if (hit && Date.now() - hit.at < TTL) return hit.v;

  try {
    const { data, error } = await supabase.functions.invoke('pp-caller-lookup', {
      body: { phone: rawNumber },
    });
    if (error || !data) return fallback;
    const v = data as CallerLookup;
    cache.set(normalized, { at: Date.now(), v });
    return v;
  } catch (e) {
    console.warn('[callerLookup] failed', (e as any)?.message);
    return fallback;
  }
}
