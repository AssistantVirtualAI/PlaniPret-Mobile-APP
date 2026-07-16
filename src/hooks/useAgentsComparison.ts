import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';

export interface AgentComparisonData {
  id: string;
  name: string;
  platform: string;
  totalConversations: number;
  avgDuration: number;
  successRate: number;
  satisfactionScore: number;
  sentimentPositive: number;
  sentimentNegative: number;
  sentimentNeutral: number;
}

export const useAgentsComparison = () => {
  const { selectedOrg } = useOrganization();

  return useQuery({
    queryKey: ['agents-comparison', selectedOrg?.id],
    queryFn: async () => {
      if (!selectedOrg?.id) return [];

      // Get all agents using safe view (excludes platform_api_key)
      const { data: agents, error: agentsError } = await supabase
        .from('agents_safe')
        .select('id, name, platform, platform_agent_id')
        .eq('organization_id', selectedOrg.id);

      if (agentsError) throw agentsError;

      const comparisonData: AgentComparisonData[] = [];

      for (const agent of agents || []) {
        let analyticsData: AgentComparisonData = {
          id: agent.id,
          name: agent.name,
          platform: agent.platform,
          totalConversations: 0,
          avgDuration: 0,
          successRate: 0,
          satisfactionScore: 0,
          sentimentPositive: 0,
          sentimentNegative: 0,
          sentimentNeutral: 0,
        };

        // For ElevenLabs agents, fetch real analytics (API key fetched server-side)
        if (agent.platform === 'elevenlabs' && agent.platform_agent_id) {
          try {
            const { data, error } = await supabase.functions.invoke('elevenlabs-convai-analytics', {
              body: {
                agent_id: agent.platform_agent_id,
                timeframe: '30d',
              }
            });

            if (!error && data) {
              analyticsData = {
                ...analyticsData,
                totalConversations: data.total_conversations || 0,
                avgDuration: data.avg_duration || 0,
                successRate: data.success_rate || 0,
                satisfactionScore: data.avg_satisfaction || 0,
                sentimentPositive: data.positive_sentiments || 0,
                sentimentNegative: data.negative_sentiments || 0,
                sentimentNeutral: data.neutral_sentiments || 0,
              };
            }
          } catch (err) {
            console.error(`Error fetching analytics for agent ${agent.id}:`, err);
          }
        }

        // Also check local database for health scores
        const { data: healthScore } = await supabase
          .from('agent_health_scores')
          .select('*')
          .eq('agent_id', agent.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (healthScore) {
          analyticsData.totalConversations = analyticsData.totalConversations || healthScore.total_conversations || 0;
          analyticsData.satisfactionScore = analyticsData.satisfactionScore || healthScore.satisfaction_score || 0;
          analyticsData.successRate = analyticsData.successRate || healthScore.resolution_rate || 0;
        }

        comparisonData.push(analyticsData);
      }

      // Sort by total conversations
      comparisonData.sort((a, b) => b.totalConversations - a.totalConversations);

      return comparisonData;
    },
    enabled: !!selectedOrg?.id,
  });
};
