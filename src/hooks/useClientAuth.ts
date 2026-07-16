import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { t } from '@/lib/i18n';

export interface ClientSession {
  clientId: string;
  clientName: string;
  organizationId: string;
  theme: string;
  language: string;
}

const CLIENT_SESSION_KEY = 'ava_client_session';
// Short-lived portal session to reduce risk from persistent browser storage.
// NOTE: sessionStorage is still accessible to injected JS (XSS), but avoids long-lived persistence.
const CLIENT_SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12h

type StoredClientSession = ClientSession & {
  issuedAt: number;
  expiresAt: number;
};

function now() {
  return Date.now();
}

function safeParseSession(raw: string): StoredClientSession | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    // Backward compat: older sessions had no expiry.
    const issuedAt = typeof parsed.issuedAt === 'number' ? parsed.issuedAt : now();
    const expiresAt = typeof parsed.expiresAt === 'number' ? parsed.expiresAt : issuedAt + CLIENT_SESSION_TTL_MS;

    if (typeof parsed.clientId !== 'string') return null;
    if (typeof parsed.clientName !== 'string') return null;
    if (typeof parsed.organizationId !== 'string') return null;

    return {
      clientId: parsed.clientId,
      clientName: parsed.clientName,
      organizationId: parsed.organizationId,
      theme: typeof parsed.theme === 'string' ? parsed.theme : 'light',
      language: typeof parsed.language === 'string' ? parsed.language : 'fr',
      issuedAt,
      expiresAt,
    };
  } catch {
    return null;
  }
}

function readStoredSession(): StoredClientSession | null {
  // Primary: sessionStorage
  const fromSession = sessionStorage.getItem(CLIENT_SESSION_KEY);
  if (fromSession) {
    const parsed = safeParseSession(fromSession);
    if (!parsed) {
      sessionStorage.removeItem(CLIENT_SESSION_KEY);
      return null;
    }
    return parsed;
  }

  // Legacy migration: localStorage -> sessionStorage, then delete.
  const legacy = localStorage.getItem(CLIENT_SESSION_KEY);
  if (!legacy) return null;
  const parsed = safeParseSession(legacy);
  localStorage.removeItem(CLIENT_SESSION_KEY);
  if (!parsed) return null;
  sessionStorage.setItem(CLIENT_SESSION_KEY, JSON.stringify(parsed));
  return parsed;
}

function writeStoredSession(session: ClientSession) {
  const issuedAt = now();
  const stored: StoredClientSession = {
    ...session,
    issuedAt,
    expiresAt: issuedAt + CLIENT_SESSION_TTL_MS,
  };
  sessionStorage.setItem(CLIENT_SESSION_KEY, JSON.stringify(stored));
}

function clearStoredSession() {
  sessionStorage.removeItem(CLIENT_SESSION_KEY);
  // Also clear legacy key if any remains
  localStorage.removeItem(CLIENT_SESSION_KEY);
}

export const useClientAuth = () => {
  const [session, setSession] = useState<ClientSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = readStoredSession();
    if (stored) {
      // Enforce expiry
      if (stored.expiresAt <= now()) {
        clearStoredSession();
        setSession(null);
      } else {
        setSession({
          clientId: stored.clientId,
          clientName: stored.clientName,
          organizationId: stored.organizationId,
          theme: stored.theme,
          language: stored.language,
        });
      }
    }
    setIsLoading(false);
  }, []);

  // Auto-logout on expiry
  useEffect(() => {
    if (!session) return;
    const stored = sessionStorage.getItem(CLIENT_SESSION_KEY);
    if (!stored) return;
    const parsed = safeParseSession(stored);
    if (!parsed) return;

    const msUntilExpiry = Math.max(0, parsed.expiresAt - now());
    const timer = window.setTimeout(() => {
      clearStoredSession();
      setSession(null);
    }, msUntilExpiry);

    return () => window.clearTimeout(timer);
  }, [session]);

  const login = useCallback(async (loginId: string, password: string) => {
    setIsLoading(true);
    try {
      // Call backend function for secure password verification
      const { data, error } = await supabase.functions.invoke('client-auth', {
        body: {
          action: 'login',
          login_id: loginId,
          password,
        },
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      if (!data?.session) {
        throw new Error(t('messages.connectionError'));
      }

      const clientSession: ClientSession = data.session;

      writeStoredSession(clientSession);
      setSession(clientSession);

      return clientSession;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loginAsAdmin = useCallback(async (clientId: string) => {
    setIsLoading(true);
    try {
      // Get the current Supabase session to include auth token
      const { data: authData } = await supabase.auth.getSession();
      const accessToken = authData?.session?.access_token;

      if (!accessToken) {
        console.log('No admin session found, cannot login as admin');
        return null;
      }

      const { data, error } = await supabase.functions.invoke('client-auth', {
        body: {
          action: 'admin-login',
          client_id: clientId,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.session) return null;

      const clientSession: ClientSession = data.session;
      writeStoredSession(clientSession);
      setSession(clientSession);
      return clientSession;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearStoredSession();
    setSession(null);
  }, []);

  return {
    session,
    isLoading,
    isAuthenticated: !!session,
    login,
    loginAsAdmin,
    logout,
  };
};
