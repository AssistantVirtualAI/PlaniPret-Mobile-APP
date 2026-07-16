import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Conversation {
  id: string;
  title: string;
  duration: number;
  platform: string;
  status: string;
  sentiment: string;
  satisfaction_score: number;
  created_at: string;
  transcript?: string;
  audio_url?: string;
}

export interface ConversationsResponse {
  conversations: Conversation[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    has_more: boolean;
  };
  requiresSetup?: boolean;
  message?: string;
}

export const useElevenLabsConversations = (page: number = 1, limit: number = 50, enabled: boolean = true) => {
  return useQuery({
    queryKey: ['elevenlabs-conversations', page, limit],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-conversations', {
        body: { 
          action: 'list',
          page,
          limit
        }
      });

      if (error) throw error;
      return data as ConversationsResponse;
    },
    enabled,
  });
};

export const useElevenLabsConversationDetails = (conversationId: string | undefined, enabled: boolean = true) => {
  return useQuery({
    queryKey: ['elevenlabs-conversation-details', conversationId],
    queryFn: async () => {
      if (!conversationId) throw new Error('Conversation ID is required');
      
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-conversations', {
        body: { 
          action: 'details',
          conversationId
        }
      });

      if (error) throw error;
      return data;
    },
    enabled: enabled && !!conversationId,
  });
};

export const useElevenLabsConversationAudio = () => {
  return useMutation({
    mutationFn: async ({ conversationId, format = 'mp3' }: { conversationId: string; format?: string }) => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-conversations', {
        body: { 
          action: 'audio',
          conversationId,
          format
        }
      });

      if (error) throw error;
      return data;
    },
  });
};