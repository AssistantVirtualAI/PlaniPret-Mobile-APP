import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AnalyticsData {
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
  realtime?: {
    active_conversations: number;
    queue_size: number;
    system_status: string;
  };
  charts?: {
    conversations_over_time: any[];
    satisfaction_trend: any[];
    peak_hours: any[];
  };
  requiresSetup?: boolean;
  message?: string;
}

export const useElevenLabsAnalytics = (timeframe: string = '7days', enabled: boolean = true) => {
  return useQuery({
    queryKey: ['elevenlabs-analytics', timeframe],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-analytics', {
        body: { 
          timeframe, 
          includeRealtime: true,
          includeCharts: true 
        }
      });

      if (error) {
        console.error('Analytics fetch error:', error);
        throw error;
      }
      
      // Return data even if requiresSetup is true
      // This allows the component to display the setup message
      return data as AnalyticsData;
    },
    refetchInterval: (query) => {
      // Don't refetch if setup is required
      return query.state.data?.requiresSetup ? false : 30000;
    },
    enabled,
    retry: (failureCount) => {
      // Retry max 2 times for transient errors
      return failureCount < 2;
    }
  });
};