/**
 * Client Supabase pour Planiprêt Mobile (app native Capacitor)
 * Partage le même projet Supabase que le portail web AVA.
 * Les clés sont identiques — la séparation est assurée par RLS et les Edge Functions.
 */
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://gejxisrqtvxavbrfcoxz.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdlanhpc3JxdHZ4YXZicmZjb3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1MDMxNzQsImV4cCI6MjA3NzA3OTE3NH0.kaO-GslE99OCNrZ4_AMnbzGqya2azqz_UMZR34zZvvo';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // Désactivé en mode natif Capacitor
    storage: {
      // Utiliser Capacitor Preferences pour le stockage persistant natif
      getItem: async (key: string) => {
        try {
          const { Preferences } = await import('@capacitor/preferences');
          const { value } = await Preferences.get({ key });
          return value;
        } catch {
          return localStorage.getItem(key);
        }
      },
      setItem: async (key: string, value: string) => {
        try {
          const { Preferences } = await import('@capacitor/preferences');
          await Preferences.set({ key, value });
        } catch {
          localStorage.setItem(key, value);
        }
      },
      removeItem: async (key: string) => {
        try {
          const { Preferences } = await import('@capacitor/preferences');
          await Preferences.remove({ key });
        } catch {
          localStorage.removeItem(key);
        }
      },
    },
  },
});

/**
 * Appel d'une Edge Function Supabase avec le token JWT de l'utilisateur connecté.
 * Toutes les Edge Functions Planiprêt utilisent requirePlanipretBroker() qui
 * vérifie automatiquement l'appartenance à l'organisation Planiprêt.
 */
export async function callEdgeFunction<T = unknown>(
  functionName: string,
  options: { method?: string; body?: unknown; params?: Record<string, string> } = {}
): Promise<T> {
  const { method = 'GET', body, params } = options;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Non authentifié');

  const url = new URL(`${SUPABASE_URL}/functions/v1/${functionName}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Edge Function ${functionName} failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}
