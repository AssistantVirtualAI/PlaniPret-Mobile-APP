import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/useTranslation';

export interface RetellAgentConfig {
  agent_id: string;
  agent_name: string;
  voice_id: string;
  voice_temperature?: number;
  voice_speed?: number;
  language?: string;
  responsiveness?: number;
  interruption_sensitivity?: number;
  enable_backchannel?: boolean;
  ambient_sound?: string;
  ambient_sound_volume?: number;
  response_engine?: {
    type: string;
    llm_id?: string;
  };
  webhook_url?: string;
  boosted_keywords?: string[];
  enable_voicemail_detection?: boolean;
  fallback_voice_ids?: string[];
  pronunciation_dictionary?: any[];
  end_call_after_silence_ms?: number;
  max_call_duration_ms?: number;
  post_call_analysis_data?: any[];
  opt_out_sensitive_data_storage?: boolean;
  enable_post_call_analysis?: boolean;
}

export interface RetellLLMConfig {
  llm_id: string;
  model?: string;
  general_prompt?: string;
  begin_message?: string;
  general_tools?: any[];
  states?: any[];
  starting_state?: string;
  model_temperature?: number;
  knowledge_base_ids?: string[];
}

export interface RetellVoice {
  voice_id: string;
  voice_name: string;
  provider: string;
  accent?: string;
  gender?: string;
  age?: string;
  preview_audio_url?: string;
}

export interface RetellKnowledgeBase {
  knowledge_base_id: string;
  knowledge_base_name: string;
  status?: string;
  knowledge_base_sources?: any[];
}

interface UseRetellConfigParams {
  agentId: string | null;
  organizationId: string | null;
  apiKey?: string | null;
  enabled?: boolean;
}

// ─── Fetch full agent + LLM config ───
export function useRetellFullAgentConfig({ agentId, organizationId, apiKey, enabled = true }: UseRetellConfigParams) {
  return useQuery({
    queryKey: ['retell-full-config', agentId, organizationId],
    queryFn: async () => {
      if (!agentId) return null;

      const { data, error } = await supabase.functions.invoke('retell-proxy', {
        body: { action: 'getAgent', retellAgentId: agentId, organizationId, apiKey },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to fetch agent config');

      const agentConfig: RetellAgentConfig = data.data;
      let llmConfig: RetellLLMConfig | null = null;

      if (agentConfig.response_engine?.llm_id) {
        const { data: llmData, error: llmError } = await supabase.functions.invoke('retell-proxy', {
          body: { action: 'getLlm', llmId: agentConfig.response_engine.llm_id, organizationId, apiKey },
        });
        if (!llmError && llmData?.success) {
          llmConfig = llmData.data;
        }
      }

      return { agent: agentConfig, llm: llmConfig };
    },
    enabled: enabled && !!agentId,
  });
}

// ─── Voices ───
export function useRetellVoices({ organizationId, apiKey }: { organizationId: string | null; apiKey?: string | null }) {
  return useQuery({
    queryKey: ['retell-voices', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('retell-proxy', {
        body: { action: 'listVoices', organizationId, apiKey },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to fetch voices');
      return data.data as RetellVoice[];
    },
    enabled: !!organizationId,
  });
}

// ─── Knowledge Bases ───
export function useRetellKnowledgeBases({ organizationId, apiKey }: { organizationId: string | null; apiKey?: string | null }) {
  return useQuery({
    queryKey: ['retell-knowledge-bases', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('retell-proxy', {
        body: { action: 'listKnowledgeBases', organizationId, apiKey },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to fetch knowledge bases');
      return data.data as RetellKnowledgeBase[];
    },
    enabled: !!organizationId,
  });
}

// ─── Phone Numbers ───
export function useRetellPhoneNumbers({ organizationId, apiKey }: { organizationId: string | null; apiKey?: string | null }) {
  return useQuery({
    queryKey: ['retell-phone-numbers', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('retell-proxy', {
        body: { action: 'listPhoneNumbers', organizationId, apiKey },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to fetch phone numbers');
      return data.data as any[];
    },
    enabled: !!organizationId,
  });
}

// ─── Concurrency ───
export function useRetellConcurrency({ organizationId, apiKey }: { organizationId: string | null; apiKey?: string | null }) {
  return useQuery({
    queryKey: ['retell-concurrency', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('retell-proxy', {
        body: { action: 'getConcurrency', organizationId, apiKey },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to fetch concurrency');
      return data.data;
    },
    enabled: !!organizationId,
  });
}

// ─── Update agent settings ───
export function useUpdateRetellAgent() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({
      agentId, organizationId, apiKey, config,
    }: {
      agentId: string;
      organizationId: string;
      apiKey?: string;
      config: Partial<RetellAgentConfig>;
    }) => {
      const { data, error } = await supabase.functions.invoke('retell-proxy', {
        body: { action: 'updateAgent', retellAgentId: agentId, organizationId, apiKey, config },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to update agent');
      return data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['retell-full-config', variables.agentId] });
      toast.success(t('messages.agentConfigUpdated'));
    },
    onError: (error: Error) => {
      toast.error(`${t('common.error')}: ${error.message}`);
    },
  });
}

// ─── Update LLM settings ───
export function useUpdateRetellLLM() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({
      llmId, agentId, organizationId, apiKey, config,
    }: {
      llmId: string;
      agentId: string;
      organizationId: string;
      apiKey?: string;
      config: Partial<RetellLLMConfig>;
    }) => {
      const { data, error } = await supabase.functions.invoke('retell-proxy', {
        body: { action: 'updateLlm', llmId, organizationId, apiKey, config },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to update LLM');
      return data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['retell-full-config', variables.agentId] });
      toast.success(t('messages.llmSettingsUpdated'));
    },
    onError: (error: Error) => {
      toast.error(`${t('common.error')}: ${error.message}`);
    },
  });
}

// ─── Publish Agent ───
export function usePublishRetellAgent() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({
      agentId, organizationId, apiKey,
    }: {
      agentId: string;
      organizationId: string;
      apiKey?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('retell-proxy', {
        body: { action: 'publishAgent', retellAgentId: agentId, organizationId, apiKey },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to publish agent');
      return data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['retell-full-config', variables.agentId] });
      toast.success('Agent publié avec succès');
    },
    onError: (error: Error) => {
      toast.error(`${t('common.error')}: ${error.message}`);
    },
  });
}

// ─── Generic Retell action ───
export function useRetellAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      action, organizationId, apiKey, ...params
    }: {
      action: string;
      organizationId: string;
      apiKey?: string;
      [key: string]: any;
    }) => {
      const { data, error } = await supabase.functions.invoke('retell-proxy', {
        body: { action, organizationId, apiKey, ...params },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || `Failed: ${action}`);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retell'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
