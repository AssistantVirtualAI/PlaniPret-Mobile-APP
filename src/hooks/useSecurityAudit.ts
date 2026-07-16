import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SecurityAuditRun {
  id: string;
  organization_id: string;
  run_by: string;
  results: any;
  created_at: string;
}

export const useSecurityAuditRuns = (organizationId?: string) => {
  return useQuery({
    queryKey: ['security-audit-runs', organizationId],
    queryFn: async () => {
      if (!organizationId) return [] as SecurityAuditRun[];
      const { data, error } = await supabase
        .from('security_audit_runs')
        .select('id, organization_id, run_by, results, created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data || []) as SecurityAuditRun[];
    },
    enabled: !!organizationId,
  });
};

export const useRunSecurityAudit = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ organizationId, dryRun }: { organizationId: string; dryRun?: boolean }) => {
      const { data, error } = await supabase.functions.invoke('security-audit-run', {
        body: { organization_id: organizationId, dry_run: !!dryRun },
      });

      if (error) throw error;
      return data as { run?: SecurityAuditRun; results?: any; dry_run?: boolean };
    },
    onSuccess: (_run, vars) => {
      queryClient.invalidateQueries({ queryKey: ['security-audit-runs', vars.organizationId] });
    },
  });
};

