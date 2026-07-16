import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';

export interface ElevenLabsAgent {
  id: string;
  name: string;
  platform_agent_id: string;
  description: string | null;
  config: Record<string, any> | null;
}

export const useElevenLabsAgents = () => {
  const { selectedOrgId } = useOrganization();

  return useQuery({
    queryKey: ['elevenlabs-agents', selectedOrgId],
    enabled: !!selectedOrgId,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      if (!selectedOrgId) return { agents: [] as ElevenLabsAgent[], fallbackAgentId: null };

      // Strict tenant isolation: only agents that belong to the selected org
      const { data: agents, error } = await supabase
        .from('agents_safe')
        .select('id, name, platform_agent_id, description, config, organization_id')
        .eq('platform', 'elevenlabs')
        .eq('organization_id', selectedOrgId)
        .not('platform_agent_id', 'is', null);

      if (error) throw error;

      const { data: integration } = await supabase
        .from('organization_integrations_safe')
        .select('agent_id')
        .eq('organization_id', selectedOrgId)
        .eq('platform', 'elevenlabs')
        .eq('is_active', true)
        .maybeSingle();

      return {
        agents: (agents || []) as ElevenLabsAgent[],
        fallbackAgentId: integration?.agent_id || null,
      };
    },
  });
};
