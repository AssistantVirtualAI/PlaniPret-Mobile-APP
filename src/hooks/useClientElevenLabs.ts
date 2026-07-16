import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface UseClientElevenLabsParams {
  apiKey: string | null;
  agentId: string | null;
  organizationId?: string | null;
  enabled?: boolean;
}

// Hook for fetching conversations via ElevenLabs API
export const useClientElevenLabsConversations = ({ apiKey, agentId, organizationId, enabled = true }: UseClientElevenLabsParams, page = 1, limit = 50) => {
  return useQuery({
    queryKey: ['client-elevenlabs-conversations', agentId, page, limit],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-conversations', {
        body: { 
          action: 'list',
          apiKey: apiKey || undefined,
          agentId,
          organizationId: organizationId || undefined,
          page,
          limit
        }
      });

      if (error) throw error;
      return data;
    },
    enabled: enabled && (!!apiKey || !!organizationId) && !!agentId,
  });
};

// Hook for fetching conversation details
export const useClientElevenLabsConversationDetails = ({ apiKey, agentId, organizationId, enabled = true }: UseClientElevenLabsParams, conversationId: string | undefined) => {
  return useQuery({
    queryKey: ['client-elevenlabs-conversation-details', conversationId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-conversations', {
        body: { 
          action: 'details',
          apiKey: apiKey || undefined,
          agentId,
          organizationId: organizationId || undefined,
          conversationId
        }
      });

      if (error) throw error;
      return data;
    },
    enabled: enabled && (!!apiKey || !!organizationId) && !!agentId && !!conversationId,
  });
};

// Hook for fetching analytics
export const useClientElevenLabsAnalytics = ({ apiKey, agentId, organizationId, enabled = true }: UseClientElevenLabsParams, timeframe = '7d') => {
  return useQuery({
    queryKey: ['client-elevenlabs-analytics', agentId, timeframe],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-analytics', {
        body: { 
          apiKey: apiKey || undefined,
          agentId,
          organizationId: organizationId || undefined,
          timeframe,
          includeRealtime: true,
          includeCharts: true
        }
      });

      if (error) throw error;
      return data;
    },
    enabled: enabled && (!!apiKey || !!organizationId) && !!agentId,
  });
};

// Hook for fetching knowledge base
export const useClientElevenLabsKnowledgeBase = ({ apiKey, agentId, organizationId, enabled = true }: UseClientElevenLabsParams) => {
  return useQuery({
    queryKey: ['client-elevenlabs-knowledge-base', agentId],
    queryFn: async () => {
      console.log('[Client KB] Fetching knowledge base for agent:', agentId);
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-knowledge-base', {
        body: { 
          action: 'list',
          apiKey: apiKey || undefined,
          agentId,
          organizationId: organizationId || undefined,
          pageSize: 100
        }
      });

      if (error) {
        console.error('[Client KB] Error:', error);
        throw error;
      }
      console.log('[Client KB] Response:', data);
      return data;
    },
    enabled: enabled && (!!apiKey || !!organizationId) && !!agentId,
  });
};

// Hook for fetching a single document's full content
export const useClientElevenLabsKnowledgeBaseDocument = (
  { apiKey, agentId, organizationId, enabled = true }: UseClientElevenLabsParams, 
  documentId: string | null
) => {
  return useQuery({
    queryKey: ['client-elevenlabs-kb-document', documentId],
    queryFn: async () => {
      console.log('[Client KB] Fetching document:', documentId);
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-knowledge-base', {
        body: { 
          action: 'get_document',
          apiKey: apiKey || undefined,
          agentId,
          organizationId: organizationId || undefined,
          documentId
        }
      });

      if (error) {
        console.error('[Client KB] Document fetch error:', error);
        throw error;
      }
      return data;
    },
    enabled: enabled && (!!apiKey || !!organizationId) && !!agentId && !!documentId,
  });
};

// Hook for adding text content to knowledge base (correct action)
export const useClientAddKnowledgeBaseText = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ apiKey, agentId, title, content, category, organizationId }: { 
      apiKey?: string | null; 
      agentId: string; 
      title: string; 
      content: string; 
      category?: string;
      organizationId?: string | null;
    }) => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-knowledge-base', {
        body: { 
          action: 'create_text',
          apiKey: apiKey || undefined,
          agentId,
          organizationId: organizationId || undefined,
          title,
          content,
          category
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['client-elevenlabs-knowledge-base', variables.agentId] });
      toast.success('Document ajouté à la base de connaissances');
    },
    onError: (error: any) => {
      if (error.message?.includes('403') || error.message?.includes('Accès refusé')) {
        toast.error('Access denied. Only administrators can add documents.');
      } else {
        toast.error(error.message || 'Erreur lors de l\'ajout');
      }
    },
  });
};

// Hook for deleting knowledge base item
export const useClientDeleteKnowledgeBaseItem = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ apiKey, agentId, documentId, organizationId }: { 
      apiKey?: string | null; 
      agentId: string; 
      documentId: string;
      organizationId?: string | null;
    }) => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-knowledge-base', {
        body: { 
          action: 'delete',
          apiKey: apiKey || undefined,
          agentId,
          organizationId: organizationId || undefined,
          documentId
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['client-elevenlabs-knowledge-base', variables.agentId] });
      toast.success('Document supprimé');
    },
    onError: (error: any) => {
      if (error.message?.includes('403') || error.message?.includes('Accès refusé')) {
        toast.error('Access denied. Only administrators can delete documents.');
      } else {
        toast.error(error.message || 'Erreur lors de la suppression');
      }
    },
  });
};

// Legacy hook - kept for compatibility, now uses correct action
export const useClientUpdateKnowledgeBase = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ apiKey, agentId, title, content, category }: { 
      apiKey: string; 
      agentId: string; 
      title: string; 
      content: string; 
      category: string; 
    }) => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-knowledge-base', {
        body: { 
          action: 'create_text',
          apiKey,
          agentId,
          title,
          content,
          category
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['client-elevenlabs-knowledge-base', variables.agentId] });
      toast.success('Base de connaissances mise à jour');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erreur lors de la mise à jour');
    },
  });
};

// Hook for fetching agent config (prompt, voice settings)
export const useClientElevenLabsAgentConfig = ({ apiKey, agentId, organizationId, enabled = true }: UseClientElevenLabsParams) => {
  return useQuery({
    queryKey: ['client-elevenlabs-agent-config', agentId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
        body: { 
          action: 'get',
          apiKey: apiKey || undefined,
          agentId,
          organizationId: organizationId || undefined,
        }
      });

      if (error) throw error;
      return data;
    },
    enabled: enabled && (!!apiKey || !!organizationId) && !!agentId,
  });
};

// Hook for updating agent prompt (with optional first message)
export const useClientUpdateAgentPrompt = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ apiKey, agentId, organizationId, prompt, firstMessage }: { 
      apiKey?: string | null; 
      agentId: string; 
      organizationId?: string | null;
      prompt: string;
      firstMessage?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
        body: { 
          action: 'update_prompt',
          apiKey: apiKey || undefined,
          agentId,
          organizationId: organizationId || undefined,
          prompt,
          firstMessage
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['client-elevenlabs-agent-config', variables.agentId] });
      toast.success('Configuration mise à jour avec succès');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erreur lors de la mise à jour');
    },
  });
};

// Hook for updating voice settings
export const useClientUpdateAgentVoice = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ apiKey, agentId, organizationId, voiceSettings }: { 
      apiKey?: string | null; 
      agentId: string; 
      organizationId?: string | null;
      voiceSettings: {
        voice_id?: string;
        stability?: number;
        similarity_boost?: number;
        style?: number;
        speed?: number;
      };
    }) => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
        body: { 
          action: 'update_voice',
          apiKey: apiKey || undefined,
          agentId,
          organizationId: organizationId || undefined,
          voiceSettings
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['client-elevenlabs-agent-config', variables.agentId] });
      toast.success('Voice settings updated');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Error updating voice settings');
    },
  });
};

// Hook for generating conversation audio
export const useClientElevenLabsAudio = () => {
  return useMutation({
    mutationFn: async ({ apiKey, agentId, organizationId, conversationId, format = 'mp3' }: { 
      apiKey?: string | null; 
      agentId: string; 
      organizationId?: string | null;
      conversationId: string; 
      format?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-conversations', {
        body: { 
          action: 'audio',
          apiKey: apiKey || undefined,
          agentId,
          organizationId: organizationId || undefined,
          conversationId,
          format
        }
      });

      if (error) throw error;
      return data;
    },
  });
};

// Hook for fetching available ElevenLabs voices
export const useClientElevenLabsVoices = (apiKey: string | null, organizationId?: string | null) => {
  return useQuery({
    queryKey: ['client-elevenlabs-voices', apiKey, organizationId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
        body: { 
          action: 'get_voices',
          apiKey: apiKey || undefined,
          organizationId: organizationId || undefined,
        }
      });

      if (error) throw error;
      return data?.voices || [];
    },
    enabled: !!apiKey || !!organizationId,
    staleTime: 300000, // Cache 5 minutes
  });
};
