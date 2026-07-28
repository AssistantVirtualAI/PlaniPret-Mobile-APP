import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

export const SUPABASE_URL =
  (import.meta as any).env?.VITE_SUPABASE_URL ||
  'https://gejxisrqtvxavbrfcoxz.supabase.co';

export const SUPABASE_ANON =
  (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdlanhpc3JxdHZ4YXZicmZjb3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1MDMxNzQsImV4cCI6MjA3NzA3OTE3NH0.kaO-GslE99OCNrZ4_AMnbzGqya2azqz_UMZR34zZvvo';

// Capacitor Preferences-backed storage so the SDK can persist and refresh
// sessions across native app restarts (where localStorage is unreliable).
const nativeStorage = {
  getItem: async (key: string) => {
    try {
      const { value } = await Preferences.get({ key });
      return value ?? null;
    } catch { return null; }
  },
  setItem: async (key: string, value: string) => {
    try { await Preferences.set({ key, value }); } catch {}
  },
  removeItem: async (key: string) => {
    try { await Preferences.remove({ key }); } catch {}
  },
};

const webStorage = typeof window !== 'undefined' && window.localStorage
  ? window.localStorage
  : undefined;

let _mobileClient: SupabaseClient | null = null;
export function getMobileSupabaseClient(): SupabaseClient {
  if (_mobileClient) return _mobileClient;
  _mobileClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'lemtel-mobile-auth',
      storage: (Capacitor.isNativePlatform() ? nativeStorage : webStorage) as any,
    },
    realtime: { params: { eventsPerSecond: 2 } },
  });
  return _mobileClient;
}

export const supabase = getMobileSupabaseClient();

export function authedRealtime(token?: string | null) {
  const sb = getMobileSupabaseClient();
  if (token) sb.realtime.setAuth(token);
  return sb;
}

export async function restGet<T = any>(path: string, token?: string | null): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: {
      apikey: SUPABASE_ANON,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json().catch(() => null) as Promise<T>;
}

export async function restPost<T = any>(path: string, token: string | null | undefined, body: any): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      apikey: SUPABASE_ANON,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json().catch(() => null) as Promise<T>;
}

export async function edgeCall<T = any>(functionName: string, token: string | null | undefined, body: any): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    try {
      const parsed = JSON.parse(text);
      throw new Error(parsed?.error || parsed?.message || `HTTP ${res.status}`);
    } catch (err) {
      if (err instanceof Error && err.message !== text) throw err;
      throw new Error(text || `HTTP ${res.status}`);
    }
  }
  return res.json().catch(() => null) as Promise<T>;
}

type RecordingMeta = {
  id?: string | null;
  pbx_uuid?: string | null;
  xml_cdr_uuid?: string | null;
  recording_path?: string | null;
  recording_name?: string | null;
  record_path?: string | null;
  record_name?: string | null;
  domain_uuid?: string | null;
  domain_name?: string | null;
  organization_id?: string | null;
  start_at?: string | null;
  recorded_at?: string | null;
  recording_url?: string | null;
};

const clean = (value: unknown) => {
  const text = String(value ?? '').trim();
  return text && text !== 'null' && text !== 'undefined' ? text : '';
};

// Module-level cache so blob: URLs survive tab switches within the session.
const audioBlobCache = new Map<string, string>();

export function getCachedRecordingAudio(key: string): string | undefined {
  return audioBlobCache.get(key);
}

export function getCachedRecordingAudioEntries(): Array<[string, string]> {
  return Array.from(audioBlobCache.entries());
}

/**
 * Get a fresh JWT token from the Supabase session.
 * Refreshes proactively if the token is expired or close to expiry (< 60s).
 * Falls back to the provided token if session refresh fails.
 */
async function getFreshToken(fallbackToken?: string | null): Promise<string | null> {
  try {
    const sb = getMobileSupabaseClient();
    let { data: { session } } = await sb.auth.getSession();
    const nowSec = Math.floor(Date.now() / 1000);
    // Refresh if expired or close to expiry
    if (!session || (session.expires_at && session.expires_at - nowSec < 60)) {
      const { data: refreshed } = await sb.auth.refreshSession();
      if (refreshed?.session) session = refreshed.session;
    }
    return session?.access_token || fallbackToken || null;
  } catch {
    return fallbackToken || null;
  }
}

export async function loadPbxRecordingAudioMobile(
  recording: RecordingMeta,
  token?: string | null,
  organizationId?: string | null,
  fallbackDomainUuid?: string | null,
  opts?: { skipCache?: boolean },
) {
  const xml_cdr_uuid = clean(recording.xml_cdr_uuid || recording.pbx_uuid || recording.id);
  const record_path = clean(recording.record_path || recording.recording_path);
  const record_name = clean(recording.record_name || recording.recording_name);
  if (!xml_cdr_uuid && (!record_path || !record_name)) throw new Error('Missing recording metadata');

  const cacheKey = xml_cdr_uuid || `${record_path}/${record_name}`;
  if (!opts?.skipCache) {
    const cached = audioBlobCache.get(cacheKey);
    // Only return cached HTTP(S) signed URLs — never cached blob: URLs,
    // because a fetch() of a blob: URL whose source is gone will fail silently.
    if (cached && /^https?:\/\//i.test(cached)) return cached;
    if (cached) audioBlobCache.delete(cacheKey);
  } else {
    audioBlobCache.delete(cacheKey);
  }

  // Get a fresh token — refresh proactively if close to expiry (mirrors desktop behavior)
  let freshToken = await getFreshToken(token);

  const payload = {
    organization_id: clean(recording.organization_id) || organizationId || undefined,
    params: {
      xml_cdr_uuid,
      record_path,
      record_name,
      domain_uuid: clean(recording.domain_uuid) || clean(fallbackDomainUuid),
      domain_name: clean(recording.domain_name),
      recorded_at: clean(recording.recorded_at || recording.start_at),
      local_recording_url: clean(recording.recording_url),
      expires_in: 300,
    },
  };

  // Per-attempt correlation id
  const requestId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? (crypto as any).randomUUID()
    : `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const doFetch = (tok: string | null, action: string) => fetch(`${SUPABASE_URL}/functions/v1/fusionpbx-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Request-Id': requestId,
      apikey: SUPABASE_ANON,
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
    },
    body: JSON.stringify({ action, ...payload }),
  });

  // Try signed URL first (faster, no session cookie needed)
  const signed = await doFetch(freshToken, 'get-recording-signed-url');
  if (signed.ok) {
    const json = await signed.json().catch(() => null);
    if (json?.ok && json?.url) {
      audioBlobCache.set(cacheKey, json.url as string);
      return json.url as string;
    }
  }

  // Fall back to direct streaming
  let res = await doFetch(freshToken, 'get-recording');

  // On 401: force-refresh once and retry — mirrors desktop behavior
  if (res.status === 401) {
    try {
      const sb = getMobileSupabaseClient();
      const { data: refreshed } = await sb.auth.refreshSession();
      if (refreshed?.session?.access_token) {
        freshToken = refreshed.session.access_token;
        res = await doFetch(freshToken, 'get-recording');
      }
    } catch {}
    if (res.status === 401) {
      throw new Error('Session expirée. Déconnectez-vous et reconnectez-vous pour écouter les enregistrements.');
    }
  }

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (!res.ok || isJson) {
    const text = await res.text().catch(() => '');
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { /* not json */ }
    const code = parsed?.error || '';
    const cid = parsed?.correlation_id || res.headers.get('x-request-id') || '';
    const cidSuffix = cid ? ` [ref: ${cid}]` : '';
    const statusList = Array.isArray(parsed?.http_statuses) && parsed.http_statuses.length
      ? ` (PBX HTTP ${parsed.http_statuses.join('/')})` : '';
    const buildErr = (msg: string, kind?: string) => {
      const e: any = new Error(msg + cidSuffix);
      e.code = code; e.failure_kind = kind || parsed?.failure_kind || code; e.correlation_id = cid;
      e.http_statuses = parsed?.http_statuses || []; e.http_status = res.status;
      return e;
    };
    if (code === 'MISSING_SECRET') throw buildErr(`Configuration manquante dans Supabase Vault : ${parsed?.secret || 'secret inconnu'}. Contactez votre administrateur.`, 'missing_secret');
    if (code === 'RECORDING_NOT_FOUND') {
      const kind = parsed?.failure_kind || (parsed?.session_login_failed ? 'login_failed' : parsed?.file_missing ? 'file_missing' : 'unknown');
      const detail = kind === 'login_failed'
        ? `Connexion au PBX échouée${parsed?.login_error ? ` (${parsed.login_error})` : ''} — vérifiez FUSIONPBX_USERNAME et FUSIONPBX_PASSWORD dans le Vault Supabase.`
        : kind === 'file_missing'
        ? 'Fichier audio introuvable sur le PBX (supprimé ou hors période de rétention).'
        : kind === 'http_error'
        ? `Le PBX a refusé toutes les tentatives${statusList}.`
        : 'Enregistrement non accessible sur le PBX.';
      throw buildErr(detail, kind);
    }
    if (code === 'Forbidden') throw buildErr('Accès refusé à cet enregistrement.', 'forbidden');
    if (code === 'INTERNAL') throw buildErr(`Erreur interne du proxy PBX : ${parsed?.message || 'inconnue'}`, 'internal');
    throw buildErr(parsed?.message || parsed?.error || text.slice(0, 200) || `Enregistrement non disponible (HTTP ${res.status})`, 'http_error');
  }

  const blob = await res.blob();
  if (!blob.size) throw new Error('Empty recording');
  const url = URL.createObjectURL(blob);
  // Do NOT cache blob: URLs — they are short-lived and break fetch() in
  // downloadRecording. Only HTTP(S) signed URLs are cached (above).
  return url;
}
