import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type Platform = 'elevenlabs' | 'vapi' | 'retell';

interface ClientAgentAccess {
  hasAccess: boolean;
  role: 'admin' | 'viewer' | null;
  canEdit: boolean;
  apiKey: string | null; // TODO: Remove once all client hooks use organizationId
  agentId: string | null;
  platformAgentId: string | null;
  agentName: string | null;
  platform: Platform | null;
  organizationId: string | null;
  isLoading: boolean;
}

export const useClientAgentAccess = (clientId: string | undefined, agentId: string | undefined): ClientAgentAccess => {
  const { data, isLoading } = useQuery({
    queryKey: ['client-agent-access', clientId, agentId],
    queryFn: async () => {
      if (!clientId || !agentId) return null;

      // Check if client has access to this agent
      const { data: assignment, error: assignmentError } = await supabase
        .from('client_agent_assignments')
        .select('role')
        .eq('client_id', clientId)
        .eq('agent_id', agentId)
        .maybeSingle();

      if (assignmentError) {
        console.error('Error checking client agent access:', assignmentError);
        return null;
      }

      if (!assignment) return null;

      // Get agent details using safe view (excludes platform_api_key)
      const { data: agent, error: agentError } = await supabase
        .from('agents_safe')
        .select('id, name, platform, platform_agent_id, organization_id, config')
        .eq('id', agentId)
        .single();

      if (agentError || !agent) {
        console.error('Error fetching agent:', agentError);
        return null;
      }

      const config = agent.config as Record<string, any> | null;
      const platform = (agent.platform as Platform) || 'elevenlabs';
      
      // Priority: platform_agent_id > config.agent_id
      const platformAgentId = agent.platform_agent_id || config?.agent_id || null;
      
      return {
        role: assignment.role as 'admin' | 'viewer',
        apiKey: null, // API keys now fetched server-side via organizationId
        agentId: agentId,
        platformAgentId: platformAgentId,
        agentName: agent.name,
        platform,
        organizationId: agent.organization_id,
      };
    },
    enabled: !!clientId && !!agentId,
  });

  return {
    hasAccess: !!data,
    role: data?.role || null,
    canEdit: data?.role === 'admin',
    apiKey: data?.apiKey || null,
    agentId: data?.agentId || null,
    platformAgentId: data?.platformAgentId || null,
    agentName: data?.agentName || null,
    platform: data?.platform || null,
    organizationId: data?.organizationId || null,
    isLoading,
  };
};

// Hook to get all agents assigned to a client
export const useClientAssignedAgents = (clientId: string | undefined) => {
  return useQuery({
    queryKey: ['client-assigned-agents', clientId],
    queryFn: async () => {
      if (!clientId) return [];

      const { data, error } = await supabase
        .from('client_agent_assignments')
        .select(`
          id,
          role,
          agent_id,
          agents:agent_id (
            id,
            name,
            platform,
            avatar_url,
            config
          )
        `)
        .eq('client_id', clientId);

      if (error) {
        console.error('Error fetching client assigned agents:', error);
        return [];
      }

      return data.map(item => ({
        assignmentId: item.id,
        role: item.role as 'admin' | 'viewer',
        agent: item.agents as any,
      }));
    },
    enabled: !!clientId,
  });
};
