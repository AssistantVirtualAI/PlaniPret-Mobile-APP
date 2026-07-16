import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PortalSession {
  clientId: string;
  clientName: string;
  organizationId: string;
  agentId: string;
  agentName: string;
  agentSlug: string;
  platformAgentId?: string;
  // SECURITY: platformApiKey removed - API keys are fetched server-side via dedicated edge functions
  platform?: string;
  role: 'viewer' | 'admin' | 'super_admin';
  canEditKnowledge: boolean;
  canEditPrompt: boolean;
  theme: string;
  language: string;
  isSuperAdmin?: boolean;
  // Member-specific fields
  memberType?: 'client' | 'member';
  memberId?: string;
  memberName?: string;
  memberEmail?: string;
  memberRole?: string;
}

const PORTAL_SESSION_KEY = 'ava_portal_session';

// Check super admin status server-side using database function
async function checkIsSuperAdmin(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('is_super_admin', { _user_id: userId });
    if (error) {
      console.warn('[PortalAuth] is_super_admin RPC error:', error);
      return false;
    }
    return data === true;
  } catch (err) {
    console.warn('[PortalAuth] is_super_admin RPC exception:', err);
    return false;
  }
}

export const usePortalAuth = () => {
  const [session, setSession] = useState<PortalSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // undefined = still checking, null = not logged in, user = logged in
  const [supabaseUser, setSupabaseUser] = useState<any | undefined>(undefined);
  const [isSuperAdminUser, setIsSuperAdminUser] = useState(false);
  const [isSuperAdminChecked, setIsSuperAdminChecked] = useState(false);

  // Check Supabase auth on mount
  useEffect(() => {
    let initialCheckDone = false;

    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setSupabaseUser(user);

      // Check super admin status server-side
      if (user?.id) {
        const superAdmin = await checkIsSuperAdmin(user.id);
        setIsSuperAdminUser(superAdmin);
      } else {
        setIsSuperAdminUser(false);
      }
      setIsSuperAdminChecked(true);
      initialCheckDone = true;
    };
    checkAuth();

    // IMPORTANT: keep this callback synchronous to avoid auth deadlocks
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user || null;
      setSupabaseUser(user);

      // For INITIAL_SESSION, let checkAuth handle the super admin check
      // to avoid a race condition where the duplicate check overwrites the result
      if (event === 'INITIAL_SESSION') {
        if (!user?.id) {
          setIsSuperAdminUser(false);
          setIsSuperAdminChecked(true);
        }
        return;
      }

      if (!user?.id) {
        setIsSuperAdminUser(false);
        setIsSuperAdminChecked(true);
        return;
      }

      // For subsequent auth changes (SIGNED_IN, TOKEN_REFRESHED, etc.), re-check
      if (initialCheckDone) {
        setIsSuperAdminChecked(false);
      }
      setTimeout(async () => {
        const superAdmin = await checkIsSuperAdmin(user.id);
        setIsSuperAdminUser(superAdmin);
        setIsSuperAdminChecked(true);
      }, 0);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const storedSession = localStorage.getItem(PORTAL_SESSION_KEY);
    if (storedSession) {
      try {
        const parsed = JSON.parse(storedSession);
        setSession(parsed);
      } catch {
        localStorage.removeItem(PORTAL_SESSION_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  // Check if current Supabase user is a super admin (server-side validated)
  const isSuperAdmin = useCallback(() => {
    return isSuperAdminUser;
  }, [isSuperAdminUser]);

  // Auto-login for super admins
  const loginAsSuperAdmin = useCallback(async (agentSlug: string): Promise<PortalSession | null> => {
    console.log('[PortalAuth] loginAsSuperAdmin called', { 
      userId: supabaseUser?.id, 
      isSuperAdminUser, 
      agentSlug 
    });

    if (!supabaseUser?.id || !isSuperAdminUser) {
      console.log('[PortalAuth] loginAsSuperAdmin guard failed', { 
        hasUserId: !!supabaseUser?.id, 
        isSuperAdminUser 
      });
      return null;
    }

    try {
      // Fetch agent details (no API key - use proxy instead)
      const { data: agent, error: agentError } = await supabase
        .from('agents_safe')
        .select('id, name, organization_id, platform_agent_id, platform, slug')
        .eq('slug', agentSlug)
        .maybeSingle();

      console.log('[PortalAuth] Agent query result', { 
        agentFound: !!agent, 
        error: agentError?.message,
        agentName: agent?.name 
      });

      if (agentError || !agent) {
        return null;
      }

      // SECURITY: Do NOT fetch API keys client-side - use dedicated edge functions with proper auth
      const portalSession: PortalSession = {
        clientId: 'super-admin',
        clientName: 'Super Admin',
        organizationId: agent.organization_id,
        agentId: agent.id,
        agentName: agent.name,
        agentSlug: agent.slug || agentSlug,
        platformAgentId: agent.platform_agent_id || undefined,
        platform: agent.platform || undefined,
        role: 'super_admin',
        canEditKnowledge: true,
        canEditPrompt: true,
        theme: 'dark',
        language: 'fr',
        isSuperAdmin: true,
      };

      localStorage.setItem(PORTAL_SESSION_KEY, JSON.stringify(portalSession));
      setSession(portalSession);
      return portalSession;
    } catch (err) {
      console.error('[PortalAuth] loginAsSuperAdmin exception:', err);
      return null;
    }
  }, [supabaseUser, isSuperAdminUser]);

  // Auto-login for authenticated admin users (from main portal)
  const loginAsOrgAdmin = useCallback(async (agentSlug: string): Promise<PortalSession | null> => {
    if (!supabaseUser?.id) return null;

    try {
      const { data: agent, error: agentError } = await supabase
        .from('agents_safe')
        .select('id, name, organization_id, platform_agent_id, platform, slug')
        .eq('slug', agentSlug)
        .maybeSingle();

      if (agentError || !agent) return null;

      // Verify this user belongs to the agent's organization
      const { data: membership, error: membershipError } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', agent.organization_id)
        .eq('user_id', supabaseUser.id)
        .maybeSingle();

      if (membershipError || !membership) {
        console.warn('[PortalAuth] User is not a member of this organization');
        return null;
      }

      // SECURITY: Do NOT fetch API keys client-side - use dedicated edge functions with proper auth
      const portalSession: PortalSession = {
        clientId: 'admin',
        clientName: 'Admin',
        organizationId: agent.organization_id,
        agentId: agent.id,
        agentName: agent.name,
        agentSlug: agent.slug || agentSlug,
        platformAgentId: agent.platform_agent_id || undefined,
        platform: agent.platform || undefined,
        role: 'admin',
        canEditKnowledge: true,
        canEditPrompt: true,
        theme: 'dark',
        language: 'fr',
        isSuperAdmin: false,
      };

      localStorage.setItem(PORTAL_SESSION_KEY, JSON.stringify(portalSession));
      setSession(portalSession);
      return portalSession;
    } catch {
      return null;
    }
  }, [supabaseUser]);

  const login = useCallback(async (agentSlug: string, loginId: string, password: string) => {
    setIsLoading(true);
    try {
      // Try client login first
      const { data, error } = await supabase.functions.invoke('client-auth', {
        body: {
          action: 'login-by-agent-slug',
          agent_slug: agentSlug,
          login_id: loginId,
          password,
        },
      });

      if (error) throw error;

      // If client login failed, try member login
      if (data?.error) {
        const { data: memberData, error: memberError } = await supabase.functions.invoke('client-auth', {
          body: {
            action: 'login-member',
            agent_slug: agentSlug,
            login_id: loginId,
            password,
          },
        });

        if (memberError) throw memberError;
        if (memberData?.error) throw new Error(memberData.error);
        if (!memberData?.session) throw new Error('Erreur de connexion');

        const portalSession: PortalSession = {
          ...memberData.session,
          isSuperAdmin: false,
        };
        localStorage.setItem(PORTAL_SESSION_KEY, JSON.stringify(portalSession));
        setSession(portalSession);
        return portalSession;
      }

      if (!data?.session) throw new Error('Erreur de connexion');

      const portalSession: PortalSession = {
        ...data.session,
        isSuperAdmin: false,
        memberType: 'client',
      };
      localStorage.setItem(PORTAL_SESSION_KEY, JSON.stringify(portalSession));
      setSession(portalSession);
      return portalSession;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Universal login - finds the client's agent automatically
  const loginUniversal = useCallback(async (loginId: string, password: string): Promise<PortalSession> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('client-auth', {
        body: { 
          action: 'login-universal', 
          login_id: loginId,
          password
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.session) throw new Error('Erreur de connexion');

      const portalSession: PortalSession = {
        ...data.session,
        isSuperAdmin: false,
        memberType: data.session.memberType || 'client',
      };
      localStorage.setItem(PORTAL_SESSION_KEY, JSON.stringify(portalSession));
      setSession(portalSession);
      return portalSession;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(PORTAL_SESSION_KEY);
    setSession(null);
  }, []);

  return {
    session,
    isLoading,
    isAuthenticated: !!session,
    login,
    loginUniversal,
    loginAsSuperAdmin,
    loginAsOrgAdmin,
    logout,
    isSuperAdmin,
    isSuperAdminChecked,
    supabaseUser,
    hasEditAccess: () => session?.role === 'admin' || session?.role === 'super_admin',
    canEditKnowledge: () => session?.canEditKnowledge === true,
    canEditPrompt: () => session?.canEditPrompt === true,
  };
};

interface PortalContextType {
  session: PortalSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (agentSlug: string, loginId: string, password: string) => Promise<PortalSession>;
  loginUniversal: (loginId: string, password: string) => Promise<PortalSession>;
  loginAsSuperAdmin: (agentSlug: string) => Promise<PortalSession | null>;
  loginAsOrgAdmin: (agentSlug: string) => Promise<PortalSession | null>;
  logout: () => void;
  isSuperAdmin: () => boolean;
  isSuperAdminChecked: boolean;
  supabaseUser: any;
  hasEditAccess: () => boolean;
  canEditKnowledge: () => boolean;
  canEditPrompt: () => boolean;
}

const PortalContext = createContext<PortalContextType | undefined>(undefined);

export const PortalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const auth = usePortalAuth();
  return <PortalContext.Provider value={auth}>{children}</PortalContext.Provider>;
};

export const usePortal = () => {
  const context = useContext(PortalContext);
  if (!context) throw new Error('usePortal must be used within a PortalProvider');
  return context;
};
