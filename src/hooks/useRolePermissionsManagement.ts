import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Permission, Role } from '@/lib/permissions';

export interface RolePermissionOverride {
  role: Role;
  permission: Permission;
  allowed: boolean;
}

export const useOrgRolePermissions = (organizationId?: string) => {
  return useQuery({
    queryKey: ['org-role-permissions-matrix', organizationId],
    queryFn: async () => {
      if (!organizationId) return [] as RolePermissionOverride[];
      const { data, error } = await supabase.functions.invoke('manage-role-permissions', {
        body: { action: 'list', organization_id: organizationId },
      });
      if (error) throw error;
      return (data?.overrides || []) as RolePermissionOverride[];
    },
    enabled: !!organizationId,
  });
};

export const useUpsertOrgRolePermission = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { organizationId: string; role: Role; permission: Permission; allowed: boolean }) => {
      const { data, error } = await supabase.functions.invoke('manage-role-permissions', {
        body: {
          action: 'upsert',
          organization_id: args.organizationId,
          role: args.role,
          permission: args.permission,
          allowed: args.allowed,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['org-role-permissions-matrix', vars.organizationId] });
      qc.invalidateQueries({ queryKey: ['org-role-permissions', vars.organizationId, vars.role] });
    },
  });
};
