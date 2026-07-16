import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AgentMetrics {
  id: string;
  name: string;
  agentId: string;
  metrics: {
    total_conversations: number;
    avg_duration: number;
    satisfaction_score: number;
    success_rate: number;
  };
}

export interface AllAgentsAnalyticsData {
  metrics: {
    total_conversations: number;
    successful_conversations: number;
    failed_conversations: number;
    avg_conversation_duration: number;
    total_voice_minutes: number;
    satisfaction_score: number;
    success_rate: number;
  };
  trends: {
    conversations_change: number;
    duration_change: number;
    satisfaction_change: number;
    success_rate_change: number;
  };
  perAgent: AgentMetrics[];
  charts?: {
    conversations_over_time: Array<{ day: string; date: string; conversations: number }>;
    satisfaction_trend: Array<{ day: string; date: string; positive: number; neutral: number; negative: number }>;
    per_agent: Array<{ name: string; conversations: number; satisfaction: number }>;
  };
  agents: Array<{ id: string; name: string; agentId: string }>;
  requiresSetup?: boolean;
  message?: string;
}

export const useAllAgentsAnalytics = (
  timeframe: string = '7days',
  agentId?: string
) => {
  return useQuery({
    queryKey: ['all-agents-analytics', timeframe, agentId],
    queryFn: async (): Promise<AllAgentsAnalyticsData> => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-all-agents-analytics', {
        body: { 
          timeframe,
          agentId,
          includeCharts: true
        }
      });

      if (error) {
        console.error('Error fetching all agents analytics:', error);
        throw error;
      }

      return data as AllAgentsAnalyticsData;
    },
    refetchInterval: 60000, // Refetch every minute
  });
};
