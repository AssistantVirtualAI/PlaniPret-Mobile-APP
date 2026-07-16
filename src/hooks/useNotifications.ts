import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface OrgNotification {
  id: string;
  organization_id: string;
  level: string;
  title: string;
  body: string | null;
  metadata: any;
  read_at: string | null;
  created_at: string;
}

export const useOrgNotifications = (organizationId?: string) => {
  return useQuery({
    queryKey: ['org-notifications', organizationId],
    queryFn: async () => {
      if (!organizationId) return [] as OrgNotification[];
      const { data, error } = await supabase
        .from('org_notifications')
        .select('id, organization_id, level, title, body, metadata, read_at, created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as OrgNotification[];
    },
    enabled: !!organizationId,
    refetchInterval: 30_000,
  });
};

export const useMarkNotificationRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase.from('org_notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      return true;
    },
    onSuccess: (_ok, vars) => {
      qc.invalidateQueries({ queryKey: ['org-notifications'] });
      qc.invalidateQueries({ queryKey: ['org-notification', vars.id] });
    },
  });
};
