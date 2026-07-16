import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AgentHealthScore {
  id: string;
  agent_id: string;
  organization_id: string;
  satisfaction_score: number;
  sentiment_score: number;
  resolution_rate: number;
  overall_health_score: number;
  total_conversations: number;
  positive_sentiments: number;
  negative_sentiments: number;
  resolved_conversations: number;
  period_start: string;
  period_end: string;
}

export interface AgentHealthData {
  currentScore: AgentHealthScore | null;
  history: AgentHealthScore[];
  insights: {
    avgSatisfaction: number;
    avgSentiment: number;
    avgResolution: number;
    overallHealth: number;
    trend: 'up' | 'down' | 'stable';
    totalConversations: number;
  };
}

export const useAgentHealthScore = (agentId: string | null) => {
  return useQuery({
    queryKey: ['agent-health-score', agentId],
    queryFn: async (): Promise<AgentHealthData> => {
      if (!agentId) {
        return {
          currentScore: null,
          history: [],
          insights: {
            avgSatisfaction: 0,
            avgSentiment: 0,
            avgResolution: 0,
            overallHealth: 0,
            trend: 'stable',
            totalConversations: 0
          }
        };
      }

      // Récupérer les health scores historiques
      const { data: healthScores, error: healthError } = await supabase
        .from('agent_health_scores')
        .select('*')
        .eq('agent_id', agentId)
        .order('period_end', { ascending: false })
        .limit(30);

      if (healthError) {
        console.error('Error fetching health scores:', healthError);
        throw healthError;
      }

      // Récupérer les insights de l'agent pour calculer le score actuel
      const { data: insights, error: insightsError } = await supabase
        .from('agent_insights')
        .select('*')
        .eq('agent_id', agentId)
        .order('analyzed_at', { ascending: false })
        .limit(100);

      if (insightsError) {
        console.error('Error fetching insights:', insightsError);
      }

      const insightsData = insights || [];
      const totalConversations = insightsData.length;

      if (totalConversations === 0) {
        return {
          currentScore: null,
          history: (healthScores as AgentHealthScore[]) || [],
          insights: {
            avgSatisfaction: 0,
            avgSentiment: 0,
            avgResolution: 0,
            overallHealth: 0,
            trend: 'stable',
            totalConversations: 0
          }
        };
      }

      // Calculer les moyennes
      const avgSatisfaction = insightsData.reduce((sum, i) => 
        sum + (Number(i.satisfaction_score) || 0), 0) / totalConversations;

      const sentimentScores = insightsData.map(i => {
        switch (i.overall_sentiment) {
          case 'positive': return 10;
          case 'neutral': return 5;
          case 'negative': return 0;
          default: return 5;
        }
      });
      const avgSentiment = sentimentScores.reduce((a, b) => a + b, 0) / totalConversations;

      // Calculer le taux de résolution (basé sur les tags ou le sentiment final positif)
      const positiveCount = insightsData.filter(i => i.overall_sentiment === 'positive').length;
      const avgResolution = (positiveCount / totalConversations) * 100;

      // Score de santé global (moyenne pondérée)
      const overallHealth = (
        (avgSatisfaction * 0.5) + // 50% satisfaction
        (avgSentiment * 0.1 * 0.3) + // 30% sentiment (normalisé sur 10)
        (avgResolution * 0.1 * 0.2) // 20% résolution (normalisé sur 10)
      );

      // Déterminer la tendance
      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (healthScores && healthScores.length >= 2) {
        const latest = Number((healthScores as any[])[0]?.overall_health_score) || 0;
        const previous = Number((healthScores as any[])[1]?.overall_health_score) || 0;
        if (latest > previous + 0.5) trend = 'up';
        else if (latest < previous - 0.5) trend = 'down';
      }

      return {
        currentScore: (healthScores as AgentHealthScore[])?.[0] || null,
        history: (healthScores as AgentHealthScore[]) || [],
        insights: {
          avgSatisfaction,
          avgSentiment,
          avgResolution,
          overallHealth,
          trend,
          totalConversations
        }
      };
    },
    enabled: !!agentId,
  });
};

// Hook pour récupérer les health scores de tous les agents
export const useAllAgentsHealthScores = (organizationId: string | null) => {
  return useQuery({
    queryKey: ['all-agents-health-scores', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];

      const { data: agents, error: agentsError } = await supabase
        .from('agents_safe')
        .select('id, name, platform')
        .eq('organization_id', organizationId);

      if (agentsError) throw agentsError;

      // Pour chaque agent, récupérer les insights et calculer le score
      const agentScores = await Promise.all(
        (agents || []).map(async (agent) => {
          const { data: insights } = await supabase
            .from('agent_insights')
            .select('satisfaction_score, overall_sentiment')
            .eq('agent_id', agent.id)
            .limit(50);

          const insightsData = insights || [];
          const total = insightsData.length;

          if (total === 0) {
            return {
              ...agent,
              healthScore: 0,
              avgSatisfaction: 0,
              totalConversations: 0,
              trend: 'stable' as const
            };
          }

          const avgSatisfaction = insightsData.reduce((sum, i) => 
            sum + (Number(i.satisfaction_score) || 0), 0) / total;

          const positiveCount = insightsData.filter(i => i.overall_sentiment === 'positive').length;
          const sentimentScore = (positiveCount / total) * 10;

          const healthScore = (avgSatisfaction * 0.6) + (sentimentScore * 0.4);

          return {
            ...agent,
            healthScore,
            avgSatisfaction,
            totalConversations: total,
            trend: 'stable' as const
          };
        })
      );

      return agentScores.sort((a, b) => b.healthScore - a.healthScore);
    },
    enabled: !!organizationId,
  });
};
