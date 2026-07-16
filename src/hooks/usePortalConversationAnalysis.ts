import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useLanguage } from '@/context/LanguageContext';

export interface SentimentPoint {
  time_percent: number;
  sentiment: 'positive' | 'negative' | 'neutral';
  reason: string;
}

export interface Improvement {
  category: 'tone' | 'response_speed' | 'knowledge' | 'clarity' | 'problem_solving' | 'handoff';
  priority: 'high' | 'medium' | 'low';
  suggestion: string;
  example?: string;
  recommended_action?: string;
}

export interface PortalConversationAnalysis {
  satisfaction_score: number;
  sentiment: 'positive' | 'negative' | 'neutral';
  confidence: number;
  sentiment_timeline: SentimentPoint[];
  topics: string[];
  intentions: string[];
  summary: string;
  improvements: Improvement[];
}

interface AnalyzeParams {
  platformAgentId: string;
  transcript?: string;
}

export const usePortalConversationAnalysis = (conversationId: string | null) => {
  const queryClient = useQueryClient();
  const { language } = useLanguage();

  const mutation = useMutation({
    mutationFn: async (params: AnalyzeParams) => {
      if (!conversationId) throw new Error('No conversation ID');

      const { data, error } = await supabase.functions.invoke('analyze-conversation', {
        body: {
          externalConversationId: conversationId,
          platformAgentId: params.platformAgentId,
          transcript: params.transcript,
          language,
        },
      });

      if (error) {
        console.error('analyze-conversation error:', error);
        throw error;
      }
      
      if (data?.error) {
        console.error('analyze-conversation response error:', data.error);
        throw new Error(data.error);
      }
      
      return data.analysis as PortalConversationAnalysis;
    },
    onSuccess: () => {
      toast.success('Analysis generated successfully');
      queryClient.invalidateQueries({ queryKey: ['portal-conversation-analysis', conversationId] });
    },
    onError: (error: any) => {
      console.error('Analysis error:', error);
      const errorMessage = error.message || String(error);
      
      if (errorMessage.includes('429')) {
        toast.error('Rate limit reached, please try again later');
      } else if (errorMessage.includes('402')) {
        toast.error('AI credits exhausted');
      } else {
        toast.error(`Analysis error: ${errorMessage}`);
      }
    }
  });

  return {
    analysis: mutation.data || null,
    isAnalyzing: mutation.isPending,
    generateAnalysis: (params: AnalyzeParams) => mutation.mutate(params),
    error: mutation.error,
  };
};
