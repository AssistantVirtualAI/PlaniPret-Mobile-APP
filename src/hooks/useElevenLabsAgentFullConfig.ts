import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/useTranslation';

export interface LLMSettings {
  temperature?: number;
  max_tokens?: number;
  model?: string;
}

export interface VoiceSettings {
  voice_id?: string;
  stability?: number;
  similarity_boost?: number;
  style?: number;
  use_speaker_boost?: boolean;
}

export interface AgentFullConfig {
  agent_id: string;
  name?: string;
  conversation_config?: {
    agent?: {
      prompt?: {
        prompt?: string;
        llm?: LLMSettings;
      };
      first_message?: string;
      language?: string;
    };
    tts?: VoiceSettings;
    stt?: {
      provider?: string;
    };
  };
  platform_settings?: any;
  knowledge_base?: any[];
  tools?: any[];
  metadata?: any;
}

// Fetch complete agent configuration
export const useElevenLabsAgentFullConfig = (agentId: string | null, apiKey: string | null) => {
  const { t } = useTranslation();
  
  return useQuery({
    queryKey: ['elevenlabs-agent-full-config', agentId],
    queryFn: async (): Promise<AgentFullConfig | null> => {
      if (!agentId) throw new Error('Agent ID required');

      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
        body: { 
          action: 'get',
          agentId,
          apiKey: apiKey || undefined
        }
      });

      if (error) throw error;
      if (data.requiresSetup) {
        throw new Error(data.message || t('integrations.messages.fillRequired'));
      }
      
      return data.agent as AgentFullConfig;
    },
    enabled: !!agentId,
    staleTime: 30000, // Cache for 30 seconds
  });
};

// Update prompt (system prompt + optional first message)
export const useUpdateAgentPrompt = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({ 
      agentId, 
      apiKey, 
      prompt, 
      firstMessage 
    }: { 
      agentId: string; 
      apiKey?: string; 
      prompt: string; 
      firstMessage?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
        body: { 
          action: 'update_prompt',
          agentId,
          apiKey: apiKey || undefined,
          prompt,
          firstMessage
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || t('messages.updateError'));
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['elevenlabs-agent-full-config', variables.agentId] });
      toast.success(t('messages.promptUpdated'));
    },
    onError: (error: any) => {
      toast.error(error.message || t('messages.updateError'));
    },
  });
};

// Update first message only
export const useUpdateAgentFirstMessage = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({ 
      agentId, 
      apiKey, 
      firstMessage 
    }: { 
      agentId: string; 
      apiKey?: string; 
      firstMessage: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
        body: { 
          action: 'update_first_message',
          agentId,
          apiKey: apiKey || undefined,
          firstMessage
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || t('messages.updateError'));
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['elevenlabs-agent-full-config', variables.agentId] });
      toast.success(t('messages.firstMessageUpdated'));
    },
    onError: (error: any) => {
      toast.error(error.message || t('messages.updateError'));
    },
  });
};

// Update voice settings
export const useUpdateAgentVoice = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({ 
      agentId, 
      apiKey, 
      voiceSettings 
    }: { 
      agentId: string; 
      apiKey?: string; 
      voiceSettings: VoiceSettings;
    }) => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
        body: { 
          action: 'update_voice',
          agentId,
          apiKey: apiKey || undefined,
          voiceSettings
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || t('messages.updateError'));
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['elevenlabs-agent-full-config', variables.agentId] });
      toast.success(t('messages.voiceSettingsUpdated'));
    },
    onError: (error: any) => {
      toast.error(error.message || t('messages.updateError'));
    },
  });
};

// Update LLM settings (temperature, max_tokens, model)
export const useUpdateAgentLLM = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({ 
      agentId, 
      apiKey, 
      llmSettings 
    }: { 
      agentId: string; 
      apiKey?: string; 
      llmSettings: LLMSettings;
    }) => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
        body: { 
          action: 'update_llm',
          agentId,
          apiKey: apiKey || undefined,
          llmSettings
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || t('messages.updateError'));
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['elevenlabs-agent-full-config', variables.agentId] });
      toast.success(t('messages.llmSettingsUpdated'));
    },
    onError: (error: any) => {
      toast.error(error.message || t('messages.updateError'));
    },
  });
};

// Full config update (for advanced users)
export const useUpdateAgentFullConfig = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({ 
      agentId, 
      apiKey, 
      fullConfig 
    }: { 
      agentId: string; 
      apiKey?: string; 
      fullConfig: Partial<AgentFullConfig>;
    }) => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
        body: { 
          action: 'update_full',
          agentId,
          apiKey: apiKey || undefined,
          fullConfig
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || t('messages.updateError'));
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['elevenlabs-agent-full-config', variables.agentId] });
      toast.success(t('messages.agentConfigUpdated'));
    },
    onError: (error: any) => {
      toast.error(error.message || t('messages.updateError'));
    },
  });
};
