import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useOrganization } from '@/context/OrganizationContext';

export interface AgentSettings {
  id: string;
  name: string;
  description: string | null;
  platform: string;
  platform_agent_id: string | null;
  organization_id: string;
  client_id: string | null;
  avatar_url: string | null;
  widget_layout: string | null;
  branding_url: string | null;
  theme_config: Record<string, any> | null;
  config: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface ElevenLabsAnalytics {
  totalConversations: number;
  avgDuration: number;
  avgSatisfaction: string;
  sentimentBreakdown: {
    positive: number;
    neutral: number;
    negative: number;
  };
  source: 'elevenlabs' | 'local';
  successRate?: number;
}

export const useAgentSettings = (agentId: string | undefined) => {
  const queryClient = useQueryClient();
  const { selectedOrgId } = useOrganization();

  const { data: agent, isLoading } = useQuery({
    queryKey: ['agent-settings', selectedOrgId, agentId],
    queryFn: async () => {
      if (!agentId) return null;
      
      // Use agents_safe view to avoid exposing platform_api_key
      const { data, error } = await supabase
        .from('agents_safe')
        .select('*')
        .eq('organization_id', selectedOrgId)
        .eq('id', agentId)
        .single();

      if (error) throw error;
      return data as AgentSettings;
    },
    enabled: !!selectedOrgId && !!agentId,
  });

  const { data: client } = useQuery({
    queryKey: ['agent-client', agent?.client_id],
    queryFn: async () => {
      if (!agent?.client_id) return null;
      
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, email')
        .eq('organization_id', selectedOrgId)
        .eq('id', agent.client_id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!selectedOrgId && !!agent?.client_id,
  });

  const { data: conversations } = useQuery({
    queryKey: ['agent-conversations', agentId],
    queryFn: async () => {
      if (!agentId) return [];
      
      const { data, error } = await supabase
        .from('conversations')
        .select('id, created_at, duration, sentiment, satisfaction_score')
        .eq('organization_id', selectedOrgId)
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data;
    },
    enabled: !!selectedOrgId && !!agentId,
  });

  // Fetch linked integration for API key and agent ID
  const integrationId = (agent?.config as Record<string, any>)?.integration_id;
  const { data: integration } = useQuery({
    queryKey: ['agent-integration', integrationId],
    queryFn: async () => {
      if (!integrationId) return null;
      
      const { data, error } = await supabase
        .from('organization_integrations')
        .select('id, platform, api_key, agent_id')
        .eq('organization_id', selectedOrgId)
        .eq('id', integrationId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!selectedOrgId && !!integrationId,
  });

  // Fetch ElevenLabs real-time analytics
  const platformAgentId = (agent?.config as Record<string, any>)?.agent_id || agent?.platform_agent_id;
  const { data: elevenLabsAnalytics, isLoading: isLoadingElevenLabs } = useQuery({
    queryKey: ['elevenlabs-agent-analytics', agentId, platformAgentId],
    queryFn: async () => {
      if (!platformAgentId || agent?.platform !== 'elevenlabs') return null;

      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-analytics', {
        body: { 
          agentId: platformAgentId,
          timeframe: '30days',
          includeCharts: false
        }
      });

      if (error) {
        console.error('[useAgentSettings] ElevenLabs analytics error:', error);
        return null;
      }

      if (data?.requiresSetup) {
        return null;
      }

      return data;
    },
    enabled: !!platformAgentId && agent?.platform === 'elevenlabs',
    retry: 1,
    staleTime: 30000,
  });

  const updateAgentMutation = useMutation({
    mutationFn: async (updates: Partial<AgentSettings>) => {
      if (!agentId) throw new Error('No agent ID');
      if (!selectedOrgId) throw new Error('No organization selected');
      
      const { error } = await supabase
        .from('agents')
        .update(updates)
        .eq('organization_id', selectedOrgId)
        .eq('id', agentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-settings', selectedOrgId, agentId] });
      toast.success('Agent mis à jour');
    },
    onError: () => {
      toast.error('Erreur lors de la mise à jour');
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      // API key is no longer available client-side - rely on integration or server-side fetch
      if (!integration?.api_key) throw new Error('Aucune clé API configurée');
      
      const { data, error } = await supabase.functions.invoke('test-integration', {
        body: { platform: agent?.platform }
      });
      
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Test échoué');
      
      return { success: true };
    },
    onSuccess: () => {
      toast.success('Connexion réussie !');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Erreur de connexion');
    },
  });

  // Calculate analytics - prefer ElevenLabs data if available
  const analytics: ElevenLabsAnalytics = elevenLabsAnalytics?.metrics ? {
    totalConversations: elevenLabsAnalytics.metrics.total_conversations || 0,
    avgDuration: Math.round(elevenLabsAnalytics.metrics.avg_duration || 0),
    avgSatisfaction: (elevenLabsAnalytics.metrics.avg_satisfaction || 0).toFixed(1),
    sentimentBreakdown: {
      positive: elevenLabsAnalytics.metrics.successful_conversations || 0,
      neutral: 0,
      negative: elevenLabsAnalytics.metrics.failed_conversations || 0,
    },
    successRate: elevenLabsAnalytics.metrics.success_rate,
    source: 'elevenlabs',
  } : {
    totalConversations: conversations?.length || 0,
    avgDuration: conversations?.length 
      ? Math.round(conversations.reduce((acc, c) => acc + (c.duration || 0), 0) / conversations.length)
      : 0,
    avgSatisfaction: conversations?.length
      ? (conversations.reduce((acc, c) => acc + (c.satisfaction_score || 0), 0) / conversations.length).toFixed(1)
      : '0',
    sentimentBreakdown: {
      positive: conversations?.filter(c => c.sentiment === 'positive').length || 0,
      neutral: conversations?.filter(c => c.sentiment === 'neutral').length || 0,
      negative: conversations?.filter(c => c.sentiment === 'negative').length || 0,
    },
    source: 'local',
  };

  return {
    agent,
    client,
    conversations,
    analytics,
    integration,
    isLoading,
    isLoadingAnalytics: isLoadingElevenLabs,
    updateAgent: updateAgentMutation.mutate,
    testConnection: testConnectionMutation.mutate,
    isUpdating: updateAgentMutation.isPending,
    isTesting: testConnectionMutation.isPending,
  };
};
