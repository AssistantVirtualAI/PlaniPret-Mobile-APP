import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/context/LanguageContext';

export interface ConversationAnalysis {
  sentiment: 'positive' | 'negative' | 'neutral';
  confidence: number;
  topics: string[];
  intentions: string[];
  actionItems: string[];
  callMetrics: {
    talkTime: number;
    silenceTime: number;
    interruptionCount: number;
    wordsPerMinute: number;
  };
  summary: string;
}

export const useConversationAnalysis = (conversationId: string) => {
  const queryClient = useQueryClient();
  const { language } = useLanguage();

  // Vérifier si l'analyse existe déjà dans les métadonnées
  const { data: conversation } = useQuery({
    queryKey: ['conversation-details', conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select('metadata')
        .eq('id', conversationId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!conversationId,
  });

  const existingAnalysis = (conversation?.metadata as any)?.aiAnalysis as ConversationAnalysis | undefined;

  // Mutation pour générer l'analyse
  const generateAnalysis = useMutation({
    mutationFn: async (conversationId: string) => {
      const { data, error } = await supabase.functions.invoke('analyze-conversation', {
        body: { conversationId, language }
      });

      if (error) throw error;
      return data.analysis as ConversationAnalysis;
    },
    onSuccess: (data) => {
      // Invalider le cache de la conversation pour recharger avec la nouvelle analyse
      queryClient.invalidateQueries({ queryKey: ['conversation-details', conversationId] });
    }
  });

  return {
    analysis: existingAnalysis,
    isAnalyzing: generateAnalysis.isPending,
    generateAnalysis: () => generateAnalysis.mutate(conversationId),
    error: generateAnalysis.error,
  };
};
