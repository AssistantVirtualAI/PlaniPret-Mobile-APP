import { useMemo } from 'react';
import { useOrganization } from '@/context/OrganizationContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ALL_PERMISSIONS, DEFAULT_PERMISSIONS_MATRIX, type Permission, type Role } from '@/lib/permissions';


export const usePermissions = () => {
  const { userRole, isSuperAdmin, selectedOrgId } = useOrganization();

  const overridesQuery = useQuery({
    queryKey: ['org-role-permissions', selectedOrgId, userRole?.role],
    queryFn: async () => {
      if (!selectedOrgId || !userRole?.role) return [] as Array<{ permission: string; allowed: boolean }>;
      const { data, error } = await supabase
        .from('org_role_permissions')
        .select('permission, allowed')
        .eq('organization_id', selectedOrgId)
        .eq('role', userRole.role);
      if (error) throw error;
      return (data || []) as Array<{ permission: string; allowed: boolean }>;
    },
    enabled: !!selectedOrgId && !!userRole?.role && !isSuperAdmin,
    staleTime: 30_000,
  });

  const permissions = useMemo(() => {
    if (isSuperAdmin) {
      return new Set(DEFAULT_PERMISSIONS_MATRIX.super_admin);
    }
    
    if (!userRole) {
      return new Set<Permission>();
    }

    const base = new Set(DEFAULT_PERMISSIONS_MATRIX[userRole.role] || []);
    for (const o of overridesQuery.data || []) {
      // Only apply overrides for known permissions
      if (!ALL_PERMISSIONS.includes(o.permission as Permission)) continue;
      if (o.allowed) base.add(o.permission as Permission);
      else base.delete(o.permission as Permission);
    }
    return base;
  }, [userRole, isSuperAdmin, overridesQuery.data]);

  const can = (permission: Permission): boolean => {
    return permissions.has(permission);
  };

  const canAny = (...perms: Permission[]): boolean => {
    return perms.some(p => permissions.has(p));
  };

  const canAll = (...perms: Permission[]): boolean => {
    return perms.every(p => permissions.has(p));
  };

  const isRole = (...roles: Role[]): boolean => {
    if (isSuperAdmin && roles.includes('super_admin')) return true;
    if (!userRole) return false;
    return roles.includes(userRole.role);
  };

  return {
    can,
    canAny,
    canAll,
    isRole,
    role: userRole?.role,
    isSuperAdmin,
    permissions: Array.from(permissions),
  };
};

