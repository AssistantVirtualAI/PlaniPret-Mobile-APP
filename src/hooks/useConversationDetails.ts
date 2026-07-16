import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';

export interface ConversationDetails {
  id: string;
  external_id: string;
  title: string;
  duration: number;
  platform: string;
  sentiment: string;
  satisfaction_score: number;
  status: string;
  created_at: string;
  transcript: string;
  audio_url: string;
  user_messages: any[];
  agent_messages: any[];
  metadata: any;
  keywords: string[];
}

export const useConversationDetails = (conversationId: string) => {
  const { selectedOrgId } = useOrganization();

  return useQuery({
    queryKey: ['conversation-details', selectedOrgId, conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('organization_id', selectedOrgId)
        .eq('id', conversationId)
        .single();

      if (error) throw error;
      
      return data as ConversationDetails;
    },
    enabled: !!selectedOrgId && !!conversationId,
  });
};
