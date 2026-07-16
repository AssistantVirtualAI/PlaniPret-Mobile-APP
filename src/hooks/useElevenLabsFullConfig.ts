import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type {
  TTSSettings,
  ASRSettings,
  TurnSettings,
  ConversationSettings,
  AgentAdvancedSettings,
  PlatformSettings,
  AgentTool,
  WebhookConfig,
  LLMSettings,
  ElevenLabsVoice,
  ElevenLabsModel,
  ElevenLabsFullAgentConfig,
} from '@/types/elevenlabs-full';

interface UseElevenLabsParams {
  agentId: string | null;
  apiKey?: string | null;
  organizationId?: string | null;
  enabled?: boolean;
}

// Helper to build body with optional organizationId
const buildBody = (base: Record<string, any>, apiKey?: string | null, organizationId?: string | null) => ({
  ...base,
  ...(apiKey ? { apiKey } : {}),
  ...(organizationId ? { organizationId } : {}),
});

// ============= Fetch Hooks =============

// Fetch complete agent configuration
export const useElevenLabsFullAgentConfig = ({ agentId, apiKey, organizationId, enabled = true }: UseElevenLabsParams) => {
  return useQuery({
    queryKey: ['elevenlabs-full-config', agentId],
    queryFn: async (): Promise<ElevenLabsFullAgentConfig | null> => {
      if (!agentId) throw new Error('Agent ID required');

      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
        body: buildBody({ action: 'get', agentId }, apiKey, organizationId)
      });

      if (error) throw error;
      if (data.requiresSetup) {
        throw new Error(data.message || 'Configuration ElevenLabs requise');
      }
      
      return data.agent as ElevenLabsFullAgentConfig;
    },
    enabled: enabled && !!agentId,
    staleTime: 30000,
  });
};

// Fetch available voices - supports both apiKey and organizationId
export const useElevenLabsVoices = (apiKeyOrOrgId?: string | null, isOrganizationId = false) => {
  return useQuery({
    queryKey: ['elevenlabs-voices', apiKeyOrOrgId ? (isOrganizationId ? 'org' : 'key') : 'none', apiKeyOrOrgId],
    queryFn: async (): Promise<ElevenLabsVoice[]> => {
      const body: any = { action: 'get_voices' };
      
      if (isOrganizationId) {
        body.organizationId = apiKeyOrOrgId;
      } else {
        body.apiKey = apiKeyOrOrgId || undefined;
      }
      
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', { body });

      if (error) throw error;
      if (data?.requiresSetup) {
        console.warn('ElevenLabs setup required for voices');
        return [];
      }
      return data?.voices || [];
    },
    enabled: !!apiKeyOrOrgId,
    staleTime: 300000,
  });
};

// Fetch available models
export const useElevenLabsModels = (apiKey?: string | null) => {
  return useQuery({
    queryKey: ['elevenlabs-models'],
    queryFn: async (): Promise<ElevenLabsModel[]> => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
        body: { action: 'get_models', apiKey: apiKey || undefined }
      });

      if (error) throw error;
      return data.models || [];
    },
    staleTime: 300000,
  });
};

// ============= Mutation Hooks =============

interface MutationBaseParams {
  agentId: string;
  apiKey?: string;
  organizationId?: string;
}

// Update TTS settings (full)
export const useUpdateTTSSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ agentId, apiKey, organizationId, ttsSettings }: MutationBaseParams & { ttsSettings: TTSSettings }) => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
        body: buildBody({ action: 'update_tts_full', agentId, ttsSettings }, apiKey, organizationId)
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Échec de la mise à jour');
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['elevenlabs-full-config', variables.agentId] });
      toast.success('Paramètres TTS mis à jour');
    },
    onError: (error: any) => toast.error(error.message || 'Erreur lors de la mise à jour TTS'),
  });
};

// Update ASR settings
export const useUpdateASRSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ agentId, apiKey, organizationId, asrSettings }: MutationBaseParams & { asrSettings: ASRSettings }) => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
        body: buildBody({ action: 'update_asr', agentId, asrSettings }, apiKey, organizationId)
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Échec de la mise à jour');
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['elevenlabs-full-config', variables.agentId] });
      toast.success('Paramètres ASR mis à jour');
    },
    onError: (error: any) => toast.error(error.message || 'Erreur lors de la mise à jour ASR'),
  });
};

// Update Turn settings
export const useUpdateTurnSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ agentId, apiKey, organizationId, turnSettings }: MutationBaseParams & { turnSettings: TurnSettings }) => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
        body: buildBody({ action: 'update_turn', agentId, turnSettings }, apiKey, organizationId)
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Échec de la mise à jour');
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['elevenlabs-full-config', variables.agentId] });
      toast.success('Paramètres de tour mis à jour');
    },
    onError: (error: any) => toast.error(error.message || 'Erreur lors de la mise à jour des tours'),
  });
};

// Update Conversation settings
export const useUpdateConversationSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ agentId, apiKey, organizationId, conversationSettings }: MutationBaseParams & { conversationSettings: ConversationSettings }) => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
        body: buildBody({ action: 'update_conversation', agentId, conversationSettings }, apiKey, organizationId)
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Échec de la mise à jour');
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['elevenlabs-full-config', variables.agentId] });
      toast.success('Paramètres de conversation mis à jour');
    },
    onError: (error: any) => toast.error(error.message || 'Erreur lors de la mise à jour'),
  });
};

// Update Agent Advanced settings
export const useUpdateAgentAdvancedSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ agentId, apiKey, organizationId, agentAdvancedSettings }: MutationBaseParams & { agentAdvancedSettings: AgentAdvancedSettings }) => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
        body: buildBody({ action: 'update_agent_advanced', agentId, agentAdvancedSettings }, apiKey, organizationId)
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Échec de la mise à jour');
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['elevenlabs-full-config', variables.agentId] });
      toast.success('Paramètres agent avancés mis à jour');
    },
    onError: (error: any) => toast.error(error.message || 'Erreur lors de la mise à jour'),
  });
};

// Update Platform settings
export const useUpdatePlatformSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ agentId, apiKey, organizationId, platformSettings }: MutationBaseParams & { platformSettings: PlatformSettings }) => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
        body: buildBody({ action: 'update_platform_settings', agentId, platformSettings }, apiKey, organizationId)
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Échec de la mise à jour');
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['elevenlabs-full-config', variables.agentId] });
      toast.success('Paramètres plateforme mis à jour');
    },
    onError: (error: any) => toast.error(error.message || 'Erreur lors de la mise à jour'),
  });
};

// Update Tools
export const useUpdateAgentTools = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ agentId, apiKey, organizationId, tools }: MutationBaseParams & { tools: AgentTool[] }) => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
        body: buildBody({ action: 'update_tools', agentId, tools }, apiKey, organizationId)
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Échec de la mise à jour');
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['elevenlabs-full-config', variables.agentId] });
      toast.success('Outils mis à jour');
    },
    onError: (error: any) => toast.error(error.message || 'Erreur lors de la mise à jour des outils'),
  });
};

// Update Webhooks
export const useUpdateWebhooks = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ agentId, apiKey, organizationId, webhookConfig }: MutationBaseParams & { webhookConfig: WebhookConfig }) => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
        body: buildBody({ action: 'update_webhooks', agentId, webhookConfig }, apiKey, organizationId)
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Échec de la mise à jour');
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['elevenlabs-full-config', variables.agentId] });
      toast.success('Webhooks mis à jour');
    },
    onError: (error: any) => toast.error(error.message || 'Erreur lors de la mise à jour des webhooks'),
  });
};

// Update LLM settings
export const useUpdateLLMSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ agentId, apiKey, organizationId, llmSettings }: MutationBaseParams & { llmSettings: LLMSettings }) => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
        body: buildBody({ action: 'update_llm', agentId, llmSettings }, apiKey, organizationId)
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Échec de la mise à jour');
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['elevenlabs-full-config', variables.agentId] });
      toast.success('Paramètres LLM mis à jour');
    },
    onError: (error: any) => toast.error(error.message || 'Erreur lors de la mise à jour LLM'),
  });
};

// Update Prompt
export const useUpdatePrompt = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ agentId, apiKey, organizationId, prompt, firstMessage }: MutationBaseParams & { prompt: string; firstMessage?: string }) => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
        body: buildBody({ action: 'update_prompt', agentId, prompt, firstMessage }, apiKey, organizationId)
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Échec de la mise à jour');
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['elevenlabs-full-config', variables.agentId] });
      toast.success('Prompt mis à jour');
    },
    onError: (error: any) => toast.error(error.message || 'Erreur lors de la mise à jour du prompt'),
  });
};

// Full config update
export const useUpdateFullConfig = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ agentId, apiKey, organizationId, fullConfig }: MutationBaseParams & { fullConfig: Partial<ElevenLabsFullAgentConfig> }) => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
        body: buildBody({ action: 'update_full', agentId, fullConfig }, apiKey, organizationId)
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Échec de la mise à jour');
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['elevenlabs-full-config', variables.agentId] });
      toast.success('Configuration complète mise à jour');
    },
    onError: (error: any) => toast.error(error.message || 'Erreur lors de la mise à jour'),
  });
};
