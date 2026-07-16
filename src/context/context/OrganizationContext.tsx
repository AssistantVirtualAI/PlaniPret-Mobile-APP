import React, { createContext, useContext, useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  primary_color?: string;
  domain?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  gdpr_enabled?: boolean;
  hipaa_enabled?: boolean;
}

interface UserRole {
  id: string;
  user_id: string;
  organization_id: string;
  role: 'super_admin' | 'org_admin' | 'manager' | 'agent' | 'viewer' | 'planipret_admin' | 'planipret_broker';
  created_at: string;
}

export interface OrganizationMembershipStatus {
  organization: Organization;
  role: UserRole['role'] | null;
  accepted_at: string | null;
  isSelected: boolean;
}

interface OrganizationContextType {
  selectedOrg: Organization | null;
  selectedOrgId: string | null;
  organizations: Organization[];
  organizationMemberships: OrganizationMembershipStatus[];
  userRole: UserRole | null;
  isLoading: boolean;
  refreshOrganization: () => Promise<void>;
  setSelectedOrgId: (id: string) => void;
  isSuperAdmin: boolean;
}

const SELECTED_ORG_KEY = 'selected_organization_id';

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

export const OrganizationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationMemberships, setOrganizationMemberships] = useState<OrganizationMembershipStatus[]>([]);
  const [selectedOrgId, setSelectedOrgIdState] = useState<string | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    if (user) {
      loadOrganizations();
      checkSuperAdmin();
    } else {
      setOrganizations([]);
      setOrganizationMemberships([]);
      setSelectedOrg(null);
      setSelectedOrgIdState(null);
      setUserRole(null);
      setIsSuperAdmin(false);
      setIsLoading(false);
    }
  }, [user]);

  const checkSuperAdmin = async () => {
    if (!user) return;
    try {
      // Use security-definer RPC to bypass RLS recursion edge cases
      const { data: viaRpc } = await supabase.rpc('is_super_admin', { _user_id: user.id });
      if (viaRpc === true) { setIsSuperAdmin(true); return; }
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'super_admin')
        .limit(1);
      setIsSuperAdmin(Array.isArray(data) && data.length > 0);
    } catch {
      setIsSuperAdmin(false);
    }
  };

  const loadOrganizations = async () => {
    if (!user) return;
    try {
      setIsLoading(true);

      // Use get_accessible_org_ids RPC: super_admins see all orgs, others see their memberships.
      let orgIds: string[] = [];
      const { data: accessibleIds, error: accErr } = await supabase.rpc('get_accessible_org_ids', { _user_id: user.id });
      if (!accErr && Array.isArray(accessibleIds)) {
        orgIds = (accessibleIds as any[]).map((r: any) => (typeof r === 'string' ? r : r?.get_accessible_org_ids)).filter(Boolean);
      }
      if (orgIds.length === 0) {
        const { data: memberships, error: mErr } = await supabase
          .from('organization_members')
          .select('organization_id, accepted_at')
          .eq('user_id', user.id);
        if (mErr) throw mErr;
        orgIds = (memberships || []).map((m) => m.organization_id).filter(Boolean);
      }
      // Always pull memberships for the accepted_at field
      const { data: memberships } = await supabase
        .from('organization_members')
        .select('organization_id, accepted_at')
        .eq('user_id', user.id);
      if (orgIds.length === 0) {
        setOrganizations([]);
        setOrganizationMemberships([]);
        setSelectedOrg(null);
        setSelectedOrgIdState(null);
        setUserRole(null);
        return;
      }

      const [{ data: orgs, error: oErr }, { data: roles, error: rErr }] = await Promise.all([
        supabase
        .from('organizations')
        .select('*')
        .in('id', orgIds)
        .eq('is_active', true)
          .order('name'),
        supabase
          .from('user_roles')
          .select('*')
          .eq('user_id', user.id)
          .in('organization_id', orgIds),
      ]);

      if (oErr) throw oErr;
      if (rErr) throw rErr;
      // Show the organizations the user is explicitly linked to.
      // Important: the historical AVA Main Dashboard UUID is now the Planipret
      // organization, so it must never be filtered out here.
      const list = (orgs || []) as Organization[];
      const rolesList = (roles || []) as UserRole[];
      setOrganizations(list);
      setOrganizationMemberships(
        list.map((org) => ({
          organization: org,
          role: rolesList.find((role) => role.organization_id === org.id)?.role || null,
          accepted_at: (memberships || []).find((membership) => membership.organization_id === org.id)?.accepted_at || null,
          isSelected: org.id === selectedOrgId,
        }))
      );

      // Pick selected: localStorage > current > first
      const stored = (() => { try { return localStorage.getItem(SELECTED_ORG_KEY); } catch { return null; } })();
      const next =
        (stored && list.find((o) => o.id === stored)) ||
        (selectedOrgId && list.find((o) => o.id === selectedOrgId)) ||
        list[0];
      if (next) {
        setSelectedOrgIdState(next.id);
        setSelectedOrg(next);
      }
    } catch (error: any) {
      console.error('Error loading organizations:', error);
      toast({
        title: 'Erreur',
        description: "Impossible de charger les organisations",
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadUserRole = async (orgId: string) => {
    if (!user || !orgId) return;
    try {
      const { data } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', user.id)
        .eq('organization_id', orgId)
        .maybeSingle();
      setUserRole(data);
    } catch {
      setUserRole(null);
    }
  };

  const setSelectedOrgId = (id: string) => {
    setSelectedOrgIdState(id);
  };

  const refreshOrganization = async () => {
    await loadOrganizations();
  };

  useEffect(() => {
    if (selectedOrgId) {
      const org = organizations.find((o) => o.id === selectedOrgId) || null;
      setSelectedOrg(org);
      loadUserRole(selectedOrgId);
      setOrganizationMemberships((current) => current.map((membership) => ({
        ...membership,
        isSelected: membership.organization.id === selectedOrgId,
      })));
      try { localStorage.setItem(SELECTED_ORG_KEY, selectedOrgId); } catch {}
      queryClient.invalidateQueries({ refetchType: 'active' });
    } else {
      setSelectedOrg(null);
      setUserRole(null);
    }
  }, [selectedOrgId, organizations, queryClient]);

  return (
    <OrganizationContext.Provider
      value={{
        selectedOrg,
        selectedOrgId,
        organizations,
        organizationMemberships,
        userRole,
        isLoading,
        refreshOrganization,
        setSelectedOrgId,
        isSuperAdmin,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
};

export const useOrganization = () => {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
};
