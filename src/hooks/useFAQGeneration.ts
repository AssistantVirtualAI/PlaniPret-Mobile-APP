import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { toast } from 'sonner';

export interface FAQItem {
  question: string;
  answer: string;
  frequency: number;
  category: string;
}

export interface MisunderstoodQuery {
  transcript_excerpt: string;
  keywords: string[];
  sentiment: string;
}

export function useFAQGeneration(agentId?: string) {
  const { selectedOrg } = useOrganization();
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['faq-generation', selectedOrg?.id, agentId],
    queryFn: async () => {
      if (!selectedOrg?.id) return null;

      const { data, error } = await supabase.functions.invoke('generate-faq', {
        body: {
          organization_id: selectedOrg.id,
          agent_id: agentId
        }
      });

      if (error) throw error;
      return data as {
        faqs: FAQItem[];
        misunderstood_queries: MisunderstoodQuery[];
        conversations_analyzed: number;
      };
    },
    enabled: !!selectedOrg?.id,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const regenerateFAQs = async () => {
    setIsGenerating(true);
    try {
      await refetch();
      toast.success('FAQs régénérées avec succès');
    } catch (error) {
      toast.error('Erreur lors de la génération des FAQs');
    } finally {
      setIsGenerating(false);
    }
  };

  return {
    faqs: data?.faqs || [],
    misunderstoodQueries: data?.misunderstood_queries || [],
    conversationsAnalyzed: data?.conversations_analyzed || 0,
    isLoading,
    isGenerating,
    regenerateFAQs
  };
}
