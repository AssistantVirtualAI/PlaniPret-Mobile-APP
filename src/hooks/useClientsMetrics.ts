import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';

export interface ClientsMetrics {
  totalClients: number;
  activeClients: number;
  inactiveClients: number;
  assignedAgents: number;
  clientsWithoutAgent: number;
  totalConversations: number;
  resolvedConversations: number;
  avgDuration: number;
}

export function useClientsMetrics() {
  const { selectedOrgId } = useOrganization();

  return useQuery({
    queryKey: ['clients-metrics', selectedOrgId],
    queryFn: async (): Promise<ClientsMetrics> => {
      if (!selectedOrgId) {
        return {
          totalClients: 0,
          activeClients: 0,
          inactiveClients: 0,
          assignedAgents: 0,
          clientsWithoutAgent: 0,
          totalConversations: 0,
          resolvedConversations: 0,
          avgDuration: 0,
        };
      }

      // Fetch clients data
      const { data: clients, error: clientsError } = await supabase
        .from('clients')
        .select('id, status, assigned_agent_id')
        .eq('organization_id', selectedOrgId);

      if (clientsError) throw clientsError;

      // Fetch conversations data for clients
      const { data: conversations, error: convsError } = await supabase
        .from('conversations')
        .select('id, resolution_status, duration, client_id')
        .eq('organization_id', selectedOrgId)
        .not('client_id', 'is', null);

      if (convsError) throw convsError;

      // Calculate metrics
      const totalClients = clients?.length || 0;
      const activeClients = clients?.filter(c => c.status === 'active').length || 0;
      const inactiveClients = clients?.filter(c => c.status === 'inactive').length || 0;
      
      // Count unique assigned agents
      const uniqueAgentIds = new Set(
        clients?.filter(c => c.assigned_agent_id).map(c => c.assigned_agent_id)
      );
      const assignedAgents = uniqueAgentIds.size;
      
      const clientsWithoutAgent = clients?.filter(c => !c.assigned_agent_id).length || 0;
      
      const totalConversations = conversations?.length || 0;
      const resolvedConversations = conversations?.filter(c => c.resolution_status === 'resolved').length || 0;
      
      // Calculate average duration (in seconds, convert to minutes)
      const conversationsWithDuration = conversations?.filter(c => c.duration) || [];
      const avgDuration = conversationsWithDuration.length > 0
        ? conversationsWithDuration.reduce((sum, c) => sum + (c.duration || 0), 0) / conversationsWithDuration.length / 60
        : 0;

      return {
        totalClients,
        activeClients,
        inactiveClients,
        assignedAgents,
        clientsWithoutAgent,
        totalConversations,
        resolvedConversations,
        avgDuration,
      };
    },
    enabled: !!selectedOrgId,
  });
}
