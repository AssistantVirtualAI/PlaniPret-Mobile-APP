import { useEffect, useState, useCallback } from 'react';
import { Preferences } from '@capacitor/preferences';

export type Creds = {
  portalUrl?: string;
  email: string;
  extension: string;
  displayName?: string;
  sipDomain?: string;
  wssUrl?: string;
  wssUrls?: string[];
  sipPassword?: string;
  authUsername?: string;
  passwordSource?: string;
  accessToken?: string;
  refreshToken?: string;
  userId?: string;
  organizationId?: string;
  organizationName?: string;
  fusionpbxDomainUuid?: string;
  domainUuid?: string;
  role?: 'super_admin' | 'org_admin' | 'manager' | 'agent' | 'viewer';
  dataScope?: 'domain_admin' | 'extension_user';
  permissions?: { admin: boolean; canManageNumbers?: boolean; canManageAgents?: boolean; canManageUsers?: boolean; canManageRouting?: boolean; canViewDomainReports?: boolean };
};


const KEY = 'lemtel.creds.v1';

// Lightweight Preferences shim — uses Capacitor when native, localStorage on web preview.
export const Store = {
  async get(): Promise<Creds | null> {
    try {
      if ((Preferences as any)?.get) {
        const { value } = await Preferences.get({ key: KEY });
        if (value) return JSON.parse(value);
      }
    } catch {}
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    return v ? JSON.parse(v) : null;
  },
  async set(c: Creds) {
    const v = JSON.stringify(c);
    try {
      if ((Preferences as any)?.set) {
        await Preferences.set({ key: KEY, value: v });
        return;
      }
    } catch {}
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, v);
  },
  async clear() {
    try {
      if ((Preferences as any)?.remove) {
        await Preferences.remove({ key: KEY });
        return;
      }
    } catch {}
    if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY);
  },
};

export const saveCredentials = (c: Creds) => Store.set(c);
export const getCredentials = () => Store.get();
export const clearCredentials = () => Store.clear();

export function useStoredCreds() {
  const [creds, setCredsState] = useState<Creds | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Store.get().then((c) => { setCredsState(c); setLoading(false); });
  }, []);

  const setCreds = useCallback((c: Creds | ((prev: Creds | null) => Creds)) => {
    setCredsState((prev) => {
      const next = typeof c === 'function' ? (c as any)(prev) : c;
      Store.set(next).catch(() => {});
      return next;
    });
  }, []);

  const clearCreds = useCallback(() => {
    setCredsState(null);
    Store.clear().catch(() => {});
  }, []);

  return { creds, setCreds, clearCreds, loading };
}

/**
 * Best-effort resolver for the user's organizationId. Falls back to user_roles
 * via the Supabase REST API when stored credentials are missing the field
 * (e.g. legacy sessions or email-only sign-in before this fix).
 * Persists the resolved value back into Store so subsequent calls are instant.
 */
const SUPABASE_URL_DEF = 'https://gejxisrqtvxavbrfcoxz.supabase.co';
const SUPABASE_ANON_DEF = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdlanhpc3JxdHZ4YXZicmZjb3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1MDMxNzQsImV4cCI6MjA3NzA3OTE3NH0.kaO-GslE99OCNrZ4_AMnbzGqya2azqz_UMZR34zZvvo';

export async function fetchOrganizationIdForUser(accessToken: string, userId: string): Promise<string | null> {
  if (!accessToken || !userId) return null;
  try {
    const url = `${SUPABASE_URL_DEF}/rest/v1/user_roles?user_id=eq.${userId}&select=organization_id&limit=1`;
    const res = await fetch(url, {
      headers: { apikey: SUPABASE_ANON_DEF, Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const rows = await res.json().catch(() => []);
    return rows?.[0]?.organization_id || null;
  } catch { return null; }
}

/** Resolve + persist organizationId for the currently stored creds. Returns the resolved id. */
export async function ensureStoredOrganizationId(): Promise<string | null> {
  const c = await Store.get();
  if (!c) return null;
  if (c.organizationId) return c.organizationId;
  if (!c.accessToken || !c.userId) return null;
  const orgId = await fetchOrganizationIdForUser(c.accessToken, c.userId);
  if (orgId) await Store.set({ ...c, organizationId: orgId });
  return orgId;
}

/**
 * Hydrate full SIP credentials from softphone-credentials edge function.
 * Used after email-only login (no extension) and on boot for legacy sessions
 * missing extension/sipDomain/wssUrl/sipPassword. Returns the updated creds
 * (or null if hydration failed / user has no softphone account).
 */
export async function hydrateSoftphoneCredentials(platform: 'mobile' | 'desktop' = 'mobile'): Promise<Creds | null> {
  const c = await Store.get();
  if (!c?.accessToken) return null;
  try {
    const res = await fetch(`${SUPABASE_URL_DEF}/functions/v1/softphone-credentials?platform=${platform}`, {
      headers: { apikey: SUPABASE_ANON_DEF, Authorization: `Bearer ${c.accessToken}` },
    });
    if (!res.ok) return null;
    const d = await res.json().catch(() => null) as any;
    if (!d || d.error || !d.extension) return null;
    const next: Creds = {
      ...c,
      extension: d.extension || c.extension || '',
      displayName: d.display_name || d.displayName || c.displayName,
      sipDomain: d.sip_domain || d.sipDomain || c.sipDomain,
      wssUrl: d.wss_url || d.wssUrl || c.wssUrl,
      wssUrls: d.wss_urls || d.wssUrls || c.wssUrls,
      sipPassword: d.sip_password || d.password || c.sipPassword,
      authUsername: d.auth_username || d.authUsername || d.extension || c.authUsername,
      passwordSource: d.password_source || d.passwordSource || c.passwordSource,
      organizationId: d.organization_id || c.organizationId,
      organizationName: d.organization_name || c.organizationName,
      fusionpbxDomainUuid: d.fusionpbx_domain_uuid || c.fusionpbxDomainUuid,
      domainUuid: d.fusionpbx_domain_uuid || c.domainUuid,
      role: d.role || c.role,
      dataScope: d.data_scope || c.dataScope,
      portalUrl: d.portal_url || c.portalUrl,
    };
    await Store.set(next);
    return next;
  } catch { return null; }
}


