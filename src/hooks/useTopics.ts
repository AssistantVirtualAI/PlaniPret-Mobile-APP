import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';

export interface TopicAggregate {
  id: string;
  topic: string;
  category: string | null;
  total_mentions: number;
  avg_sentiment: number | null;
  last_mentioned_at: string;
}

export interface ConversationTopic {
  id: string;
  topic: string;
  category: string | null;
  sentiment: string | null;
  frequency: number;
  confidence: number;
  analyzed_at: string;
}

export const useTopics = () => {
  const { selectedOrgId } = useOrganization();

  const aggregatesQuery = useQuery({
    queryKey: ['topic-aggregates', selectedOrgId],
    queryFn: async (): Promise<TopicAggregate[]> => {
      if (!selectedOrgId) return [];

      const { data, error } = await supabase
        .from('topic_aggregates')
        .select('*')
        .eq('organization_id', selectedOrgId)
        .order('total_mentions', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedOrgId,
  });

  const recentTopicsQuery = useQuery({
    queryKey: ['recent-topics', selectedOrgId],
    queryFn: async (): Promise<ConversationTopic[]> => {
      if (!selectedOrgId) return [];

      const { data, error } = await supabase
        .from('conversation_topics')
        .select('*')
        .eq('organization_id', selectedOrgId)
        .order('analyzed_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedOrgId,
  });

  const analyzeTopics = async () => {
    if (!selectedOrgId) throw new Error('No organization selected');

    const { data, error } = await supabase.functions.invoke('analyze-topics', {
      body: { organization_id: selectedOrgId, analyze_all: true }
    });

    if (error) throw error;
    return data;
  };

  return {
    aggregates: aggregatesQuery.data || [],
    recentTopics: recentTopicsQuery.data || [],
    isLoading: aggregatesQuery.isLoading || recentTopicsQuery.isLoading,
    error: aggregatesQuery.error || recentTopicsQuery.error,
    analyzeTopics,
    refetch: () => {
      aggregatesQuery.refetch();
      recentTopicsQuery.refetch();
    }
  };
};
