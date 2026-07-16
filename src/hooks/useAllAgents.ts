import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';

export interface AgentWithPlatform {
  id: string;
  name: string;
  platform: string;
  platform_agent_id: string | null;
  description: string | null;
  config: Record<string, any> | null;
  organization_id: string;
}

export const useAllAgents = () => {
  const { selectedOrgId } = useOrganization();

  return useQuery({
    queryKey: ['all-agents', selectedOrgId],
    queryFn: async () => {
      if (!selectedOrgId) {
        return { agents: [], fallbackApiKey: null };
      }

      // Get ALL agents for the organization using safe view (excludes platform_api_key)
      const { data: agents, error } = await supabase
        .from('agents_safe')
        .select('id, name, platform, platform_agent_id, description, config, organization_id')
        .eq('organization_id', selectedOrgId)
        .not('platform_agent_id', 'is', null);

      if (error) throw error;

      return {
        agents: (agents || []) as AgentWithPlatform[],
      };
    },
    enabled: !!selectedOrgId,
  });
};

// Helper to get platform display name
export const getPlatformDisplayName = (platform: string): string => {
  switch (platform.toLowerCase()) {
    case 'elevenlabs':
      return 'ElevenLabs';
    case 'retell':
      return 'Retell';
    case 'vapi':
      return 'Vapi';
    default:
      return platform;
  }
};

// Helper to check if platform supports knowledge base
export const platformSupportsKnowledgeBase = (platform: string): boolean => {
  const p = platform.toLowerCase();
  return p === 'elevenlabs' || p === 'retell';
};

