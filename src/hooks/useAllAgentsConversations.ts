import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';

export interface ElevenLabsConversation {
  conversation_id: string;
  agent_id: string;
  agent_name: string;
  platform_agent_id: string;
  start_time?: string;
  end_time?: string;
  call_duration_secs?: number;
  duration?: number;
  status?: string;
  caller_number?: string;
  metadata?: any;
  analysis?: {
    summary?: string;
    satisfaction_score?: number;
    sentiment?: string;
    keywords?: string[];
  };
  transcript?: string;
}

export interface AgentInfo {
  id: string;
  name: string;
  agentId: string;
  conversationCount: number;
}

export interface ConversationFilters {
  agentId?: string;
  sentiment?: string;
  dateFrom?: string;
  dateTo?: string;
  minDuration?: number;
  maxDuration?: number;
  search?: string;
}

export interface AllAgentsConversationsResponse {
  conversations: ElevenLabsConversation[];
  agents: AgentInfo[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
  requiresSetup?: boolean;
  message?: string;
}

export const useAllAgentsConversations = (
  page: number = 1,
  limit: number = 20,
  filters: ConversationFilters = {}
) => {
  const { selectedOrgId } = useOrganization();

  return useQuery({
    queryKey: ['all-agents-conversations', selectedOrgId, page, limit, filters],
    queryFn: async (): Promise<AllAgentsConversationsResponse> => {
      if (!selectedOrgId) {
        return { conversations: [], agents: [], total: 0, page, limit, totalPages: 0, hasMore: false };
      }

      const { data, error } = await supabase.functions.invoke('elevenlabs-all-agents-conversations', {
        body: { 
          organizationId: selectedOrgId,
          page, 
          limit, 
          filters,
          action: 'list'
        }
      });

      if (error) {
        console.error('Error fetching all agents conversations:', error);
        // Check for auth errors - session may be expired
        const errorMsg = (error as any)?.message || String(error);
        if (errorMsg.includes('401') || errorMsg.includes('Unauthorized')) {
          console.warn('Session expired, user should re-login');
        }
        throw error;
      }

      return data as AllAgentsConversationsResponse;
    },
    refetchInterval: 60000, // Refetch every minute
    enabled: !!selectedOrgId,
    retry: (failureCount, error) => {
      // Don't retry on auth errors
      const errorMsg = (error as any)?.message || String(error);
      if (errorMsg.includes('401') || errorMsg.includes('Unauthorized')) {
        return false;
      }
      return failureCount < 3;
    },
  });
};

export const useConversationDetails = (
  conversationId: string | null,
  options?: { platformAgentId?: string | null }
) => {
  const { selectedOrgId } = useOrganization();
  const platformAgentId = options?.platformAgentId ?? null;

  return useQuery({
    queryKey: ['conversation-details', selectedOrgId, conversationId, platformAgentId],
    queryFn: async () => {
      if (!conversationId) return null;

      const { data, error } = await supabase.functions.invoke('elevenlabs-all-agents-conversations', {
        body: {
          action: 'details',
          organizationId: selectedOrgId,
          conversationId,
          platformAgentId,
        },
      });

      if (error) {
        console.error('Error fetching conversation details:', error);
        throw error;
      }

      // Edge function returns {notFound:true} with 200
      if ((data as any)?.notFound) return null;

      return data;
    },
    enabled: !!selectedOrgId && !!conversationId,
  });
};

export const useConversationAudio = (
  conversationId: string | null,
  format: string = 'mp3',
  options?: { platformAgentId?: string | null }
) => {
  const { selectedOrgId } = useOrganization();
  const platformAgentId = options?.platformAgentId ?? null;

  return useQuery({
    queryKey: ['conversation-audio', selectedOrgId, conversationId, format, platformAgentId],
    queryFn: async () => {
      if (!conversationId) return null;

      const { data, error } = await supabase.functions.invoke('elevenlabs-all-agents-conversations', {
        body: {
          action: 'audio',
          organizationId: selectedOrgId,
          conversationId,
          format,
          platformAgentId,
        },
      });

      // If audio isn't available yet, don't crash the UI
      if (error) {
        const msg = (error as any)?.message || String(error);
        if (msg.includes('404') || msg.toLowerCase().includes('audio not found')) {
          return { audio_url: null, audio_base64: null, notFound: true };
        }
        console.error('Error fetching conversation audio:', error);
        throw error;
      }

      if ((data as any)?.notFound) {
        return { audio_url: null, audio_base64: null, notFound: true };
      }

      return data;
    },
    enabled: !!selectedOrgId && !!conversationId,
  });
};
