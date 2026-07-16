import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { toast } from 'sonner';

export interface VoiceSettings {
  voice_id: string;
  model_id?: string;
  stability?: number;
  similarity_boost?: number;
  style?: number;
  speed?: number;
  provider?: string;
}

export interface TurnSettings {
  turn_timeout?: number;
  silence_end_call_timeout?: number;
  turn_eagerness?: 'eager' | 'normal' | 'relaxed';
}

export interface ConversationSettings {
  max_duration_seconds?: number;
}

export interface LLMSettings {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  provider?: string;
}

export interface ASRSettings {
  provider?: 'elevenlabs' | 'deepgram' | 'google';
  quality?: 'high' | 'standard';
  keywords?: string[];
}

export interface CreateAgentParams {
  platform: 'elevenlabs' | 'vapi' | 'retell';
  name: string;
  systemPrompt: string;
  firstMessage: string;
  voiceSettings: VoiceSettings;
  language?: string;
  turnSettings?: TurnSettings;
  conversationSettings?: ConversationSettings;
  llmSettings?: LLMSettings;
  asrSettings?: ASRSettings;
  clientId?: string;
}

export interface CreateAgentResult {
  agentId: string;
  platformAgentId: string;
  success: boolean;
}

async function createElevenLabsAgent(
  organizationId: string,
  params: CreateAgentParams
): Promise<{ agent_id: string; agent: any }> {
  const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
    body: {
      action: 'create_agent',
      organizationId,
      name: params.name,
      systemPrompt: params.systemPrompt,
      firstMessage: params.firstMessage,
      voiceId: params.voiceSettings.voice_id,
      language: params.language || 'en',
      ttsSettings: {
        model_id: params.voiceSettings.model_id || 'eleven_turbo_v2_5',
        stability: params.voiceSettings.stability ?? 0.5,
        similarity_boost: params.voiceSettings.similarity_boost ?? 0.75,
        style: params.voiceSettings.style,
        speed: params.voiceSettings.speed,
      },
      asrSettings: params.asrSettings,
      turnSettings: params.turnSettings,
      conversationSettings: params.conversationSettings,
      llmSettings: params.llmSettings,
    },
  });

  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error || 'Failed to create agent on ElevenLabs');

  return { agent_id: data.agent_id, agent: data.agent };
}

async function createVapiAgent(
  organizationId: string,
  params: CreateAgentParams
): Promise<{ agent_id: string; agent: any }> {
  const { data, error } = await supabase.functions.invoke('vapi-proxy', {
    body: {
      action: 'createAssistant',
      organizationId,
      name: params.name,
      systemPrompt: params.systemPrompt,
      firstMessage: params.firstMessage,
      // Voice settings
      voiceId: params.voiceSettings.voice_id,
      voiceProvider: params.voiceSettings.provider || 'elevenlabs',
      stability: params.voiceSettings.stability ?? 0.5,
      similarityBoost: params.voiceSettings.similarity_boost ?? 0.75,
      style: params.voiceSettings.style,
      // LLM settings
      llmProvider: params.llmSettings?.provider || 'openai',
      llmModel: params.llmSettings?.model || 'gpt-4o-mini',
      temperature: params.llmSettings?.temperature ?? 0.7,
      maxTokens: params.llmSettings?.max_tokens || 1000,
      // Timing settings
      silenceTimeout: params.turnSettings?.silence_end_call_timeout || 30,
      maxDuration: params.conversationSettings?.max_duration_seconds || 600,
    },
  });

  if (error) throw new Error(error.message);
  
  const agentData = data?.data || data;
  if (!agentData?.id) throw new Error('Failed to create assistant on Vapi');

  return { agent_id: agentData.id, agent: agentData };
}

async function createRetellAgent(
  organizationId: string,
  params: CreateAgentParams
): Promise<{ agent_id: string; agent: any }> {
  const { data, error } = await supabase.functions.invoke('retell-proxy', {
    body: {
      action: 'createAgent',
      organizationId,
      name: params.name,
      systemPrompt: params.systemPrompt,
      firstMessage: params.firstMessage,
      // Voice settings
      voiceId: params.voiceSettings.voice_id,
      speed: params.voiceSettings.speed || 1.0,
      // Language
      language: params.language || 'en-US',
      // LLM settings
      llmModel: params.llmSettings?.model || 'gpt-4o-mini',
      temperature: params.llmSettings?.temperature ?? 0.7,
      // Timing settings
      silenceTimeout: params.turnSettings?.silence_end_call_timeout || 30,
    },
  });

  if (error) throw new Error(error.message);
  
  const agentData = data?.data || data;
  if (!agentData?.agent_id) throw new Error('Failed to create agent on Retell AI');

  return { agent_id: agentData.agent_id, agent: agentData };
}

export function useCreatePlatformAgent() {
  const { selectedOrgId } = useOrganization();
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<string>('');

  const mutation = useMutation({
    mutationFn: async (params: CreateAgentParams): Promise<CreateAgentResult> => {
      if (!selectedOrgId) throw new Error('No organization selected');

      const traceId = (crypto as any)?.randomUUID?.() ?? `trace_${Date.now()}`;
      const t0 = performance.now();
      const trace = (step: string, extra: Record<string, unknown> = {}) => {
        console.info('[create-agent]', { traceId, step, organizationId: selectedOrgId, platform: params.platform, elapsedMs: Math.round(performance.now() - t0), ...extra });
      };
      trace('start');

      // Audit: record create intent (helps cross-org debugging)
      supabase.rpc('log_agent_access', {
        _org_id: selectedOrgId,
        _action: 'create_attempt',
        _metadata: { traceId, platform: params.platform, name: params.name } as any,
      }).then(({ error }) => { if (error) console.warn('[create-agent] audit insert failed', { traceId, error }); });

      setProgress('Creating agent on platform...');

      let platformResult: { agent_id: string; agent: any };

      try {
        switch (params.platform) {
          case 'elevenlabs':
            platformResult = await createElevenLabsAgent(selectedOrgId, params);
            break;
          case 'vapi':
            platformResult = await createVapiAgent(selectedOrgId, params);
            break;
          case 'retell':
            platformResult = await createRetellAgent(selectedOrgId, params);
            break;
          default:
            throw new Error(`Unsupported platform: ${params.platform}`);
        }
        trace('platform_created', { platformAgentId: platformResult.agent_id });
      } catch (err: any) {
        trace('platform_error', { message: err?.message, stack: err?.stack });
        throw new Error(`[${params.platform}] ${err?.message || 'platform create failed'} (trace ${traceId})`);
      }

      setProgress('Saving agent to database...');

      const agentData = {
        name: params.name,
        organization_id: selectedOrgId,
        platform: params.platform,
        platform_agent_id: platformResult.agent_id,
        client_id: params.clientId || null,
        config: JSON.parse(JSON.stringify({
          systemPrompt: params.systemPrompt,
          firstMessage: params.firstMessage,
          voiceSettings: params.voiceSettings,
          language: params.language,
          turnSettings: params.turnSettings,
          conversationSettings: params.conversationSettings,
          llmSettings: params.llmSettings,
          asrSettings: params.asrSettings,
          platformAgent: platformResult.agent,
          traceId,
        })),
      };

      const { data: savedAgent, error: saveError } = await supabase
        .from('agents')
        .insert([agentData])
        .select('id')
        .single();

      if (saveError) {
        trace('db_save_error', { message: saveError.message, code: saveError.code, details: saveError.details });
        throw new Error(`DB save failed: ${saveError.message} (trace ${traceId})`);
      }
      trace('db_saved', { agentId: savedAgent.id });

      setProgress('');

      return { agentId: savedAgent.id, platformAgentId: platformResult.agent_id, success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success('Agent created successfully on platform!');
    },
    onError: (error: Error) => {
      setProgress('');
      toast.error(`Failed to create agent: ${error.message}`);
    },
  });

  return {
    createAgent: mutation.mutateAsync,
    isCreating: mutation.isPending,
    progress,
    error: mutation.error,
  };
}
