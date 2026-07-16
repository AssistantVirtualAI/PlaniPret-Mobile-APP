import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface OrgRetentionSettings {
  organization_id: string;
  exports_retention_days: number;
  notifications_retention_days: number;
  updated_at: string;
}

export const useRetentionSettings = (organizationId?: string) => {
  return useQuery({
    queryKey: ['org-retention-settings', organizationId],
    queryFn: async () => {
      if (!organizationId) return null as OrgRetentionSettings | null;
      const { data, error } = await supabase
        .from('org_retention_settings')
        .select('organization_id, exports_retention_days, notifications_retention_days, updated_at')
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (error) throw error;
      return (data || null) as OrgRetentionSettings | null;
    },
    enabled: !!organizationId,
  });
};

export const useUpsertRetentionSettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      organizationId: string;
      exportsRetentionDays: number;
      notificationsRetentionDays: number;
    }) => {
      const { error } = await supabase
        .from('org_retention_settings')
        .upsert({
          organization_id: args.organizationId,
          exports_retention_days: args.exportsRetentionDays,
          notifications_retention_days: args.notificationsRetentionDays,
          updated_by: (await supabase.auth.getUser()).data.user?.id ?? null,
        });
      if (error) throw error;
      return true;
    },
    onSuccess: (_ok, vars) => {
      qc.invalidateQueries({ queryKey: ['org-retention-settings', vars.organizationId] });
    },
  });
};
