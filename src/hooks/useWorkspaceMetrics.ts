import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';

export interface WorkspaceMetrics {
  activeClients: number;
  activeAgents: number;
  totalConversations: number;
  totalMinutes: number;
  avgInteractions: number;
  resolutionRate: number;
  resolvedConversations: number;
  unresolvedConversations: number;
}

export const useWorkspaceMetrics = (dateRange?: { start: Date; end: Date }) => {
  const { selectedOrgId } = useOrganization();

  return useQuery({
    queryKey: ['workspace-metrics', selectedOrgId, dateRange?.start, dateRange?.end],
    queryFn: async (): Promise<WorkspaceMetrics> => {
      if (!selectedOrgId) {
        return {
          activeClients: 0,
          activeAgents: 0,
          totalConversations: 0,
          totalMinutes: 0,
          avgInteractions: 0,
          resolutionRate: 0,
          resolvedConversations: 0,
          unresolvedConversations: 0,
        };
      }

      let conversationsQuery = supabase
        .from('conversations')
        .select('id, duration, user_messages, resolution_status')
        .eq('organization_id', selectedOrgId);

      if (dateRange?.start) {
        conversationsQuery = conversationsQuery.gte('created_at', dateRange.start.toISOString());
      }
      if (dateRange?.end) {
        conversationsQuery = conversationsQuery.lte('created_at', dateRange.end.toISOString());
      }

      const [clientsRes, agentsRes, conversationsRes] = await Promise.all([
        supabase
          .from('clients')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', selectedOrgId)
          .eq('status', 'active'),
        supabase
          .from('agents_safe')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', selectedOrgId),
        conversationsQuery,
      ]);

      const conversations = conversationsRes.data || [];
      const totalConversations = conversations.length;
      
      // Calculate total minutes
      const totalSeconds = conversations.reduce((acc, c) => acc + (c.duration || 0), 0);
      const totalMinutes = Math.round(totalSeconds / 60);

      // Calculate average interactions
      const totalInteractions = conversations.reduce((acc, c) => {
        const messages = c.user_messages as any[] || [];
        return acc + messages.length;
      }, 0);
      const avgInteractions = totalConversations > 0 
        ? Math.round((totalInteractions / totalConversations) * 10) / 10 
        : 0;

      // Calculate resolution rate
      const resolvedConversations = conversations.filter(c => c.resolution_status === 'resolved').length;
      const unresolvedConversations = conversations.filter(c => c.resolution_status === 'unresolved').length;
      const resolutionRate = totalConversations > 0 
        ? Math.round((resolvedConversations / totalConversations) * 100) 
        : 0;

      return {
        activeClients: clientsRes.count || 0,
        activeAgents: agentsRes.count || 0,
        totalConversations,
        totalMinutes,
        avgInteractions,
        resolutionRate,
        resolvedConversations,
        unresolvedConversations,
      };
    },
    enabled: !!selectedOrgId,
    refetchInterval: 30000,
  });
};
