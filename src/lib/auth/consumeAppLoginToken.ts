// Auto-login consumer. Detects ?ava_token=<token> in the URL on app boot,
// exchanges it for a real Supabase session, pins the active domain, then
// strips the token from the URL.
//
// Triggered for: web preview, Electron desktop shell (loads the same web app),
// and reused by apps/ava-softphone-mobile via a deep-link handler.
import { supabase } from '@/integrations/supabase/client';
import { setActiveDomain } from '@/hooks/useActiveDomain';

const SUPABASE_URL = (import.meta as any).env.VITE_SUPABASE_URL as string;
const ANON_KEY = (import.meta as any).env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export async function consumeAppLoginToken(): Promise<boolean> {
  try {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('ava_token');
    if (!token) return false;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/consume-app-login-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
      body: JSON.stringify({ token }),
    });
    const out = await res.json();
    if (!res.ok || !out?.token_hash || !out?.email) {
      console.warn('[ava-token] consume failed', out);
      return false;
    }

    // Establish a real session via magiclink verification
    const { error } = await supabase.auth.verifyOtp({
      type: 'magiclink',
      token_hash: out.token_hash,
      email: out.email,
    } as any);
    if (error) {
      console.warn('[ava-token] verifyOtp failed', error);
      return false;
    }

    if (out.domain?.org_id) {
      setActiveDomain({
        uuid: out.domain.uuid || '',
        name: out.domain.name || '',
        org_id: out.domain.org_id,
      });
    }

    // Strip token from URL
    params.delete('ava_token');
    const qs = params.toString();
    const clean = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash;
    window.history.replaceState({}, '', clean);
    return true;
  } catch (e) {
    console.warn('[ava-token] error', e);
    return false;
  }
}
