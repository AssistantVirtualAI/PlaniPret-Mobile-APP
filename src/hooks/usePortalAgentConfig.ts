import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePortal } from '@/hooks/usePortalAuth';

export interface NormalizedAgentConfig {
  systemPrompt: string;
  firstMessage: string;
  voiceId?: string;
  voiceSettings?: {
    stability?: number;
    similarity?: number;
    style?: number;
  };
  agentName?: string;
  platform: string;
  raw?: any;
}

// SECURITY: All hooks now use organizationId for auth - API keys are fetched server-side

/**
 * Hook unifié pour récupérer la configuration d'un agent sur toutes les plateformes
 * Supporte: ElevenLabs, Retell, Vapi
 */
export function usePortalAgentConfig() {
  const { session } = usePortal();
  const platform = session?.platform;
  const agentId = session?.platformAgentId || session?.agentId;
  const organizationId = session?.organizationId;

  return useQuery({
    queryKey: ['portal-agent-config', agentId, platform],
    queryFn: async (): Promise<NormalizedAgentConfig | null> => {
      if (!agentId || !platform) return null;

      console.log(`[usePortalAgentConfig] Fetching config for ${platform} agent: ${agentId}`);

      switch (platform) {
        case 'elevenlabs': {
          const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
            body: { action: 'get', agentId, organizationId }
          });
          if (error) throw error;
          
          const agent = data?.agent || data;
          const conversationConfig = agent?.conversation_config || {};
          const agentConfig = conversationConfig?.agent || {};
          
          return {
            systemPrompt: agentConfig?.prompt?.prompt || '',
            firstMessage: agentConfig?.first_message || '',
            voiceId: conversationConfig?.tts?.voice_id,
            voiceSettings: {
              stability: conversationConfig?.tts?.stability,
              similarity: conversationConfig?.tts?.similarity_boost,
              style: conversationConfig?.tts?.style,
            },
            agentName: agent?.name,
            platform: 'elevenlabs',
            raw: data,
          };
        }

        case 'retell': {
          // First get the agent to find the LLM ID
          const { data: agentData, error: agentError } = await supabase.functions.invoke('retell-proxy', {
            body: { action: 'getAgent', agentId, organizationId }
          });
          if (agentError) throw agentError;
          
          const agentInfo = agentData?.data || agentData;
          const llmId = agentInfo?.llm_websocket_url?.split('/').pop() || agentInfo?.response_engine?.llm_id;
          
          let systemPrompt = agentInfo?.general_prompt || '';
          let firstMessage = agentInfo?.begin_message || '';
          
          // If there's an LLM, fetch its config for more detailed prompt
          if (llmId) {
            const { data: llmData } = await supabase.functions.invoke('retell-proxy', {
              body: { action: 'getLlm', llmId, organizationId }
            });
            if (llmData?.data) {
              systemPrompt = llmData.data.general_prompt || systemPrompt;
              firstMessage = llmData.data.begin_message || firstMessage;
            }
          }
          
          return {
            systemPrompt,
            firstMessage,
            voiceId: agentInfo?.voice_id,
            agentName: agentInfo?.agent_name,
            platform: 'retell',
            raw: { agent: agentInfo, llmId },
          };
        }

        case 'vapi': {
          const { data, error } = await supabase.functions.invoke('vapi-proxy', {
            body: { action: 'getAssistant', assistantId: agentId, organizationId }
          });
          if (error) throw error;
          
          const assistant = data?.data || data;
          
          // Vapi stores prompt in model.messages or systemMessage
          let systemPrompt = assistant?.model?.systemMessage || '';
          if (!systemPrompt && assistant?.model?.messages) {
            const systemMsg = assistant.model.messages.find((m: any) => m.role === 'system');
            systemPrompt = systemMsg?.content || '';
          }
          
          return {
            systemPrompt,
            firstMessage: assistant?.firstMessage || '',
            voiceId: assistant?.voice?.voiceId,
            agentName: assistant?.name,
            platform: 'vapi',
            raw: assistant,
          };
        }

        default:
          console.warn(`[usePortalAgentConfig] Unsupported platform: ${platform}`);
          return null;
      }
    },
    enabled: !!agentId && !!platform,
    retry: 1,
  });
}

/**
 * Hook pour mettre à jour le prompt sur toutes les plateformes
 */
export function usePortalUpdateAgentPrompt() {
  const { session } = usePortal();
  const queryClient = useQueryClient();
  const platform = session?.platform;
  const agentId = session?.platformAgentId || session?.agentId;
  const organizationId = session?.organizationId;

  return useMutation({
    mutationFn: async ({ systemPrompt, firstMessage }: { systemPrompt: string; firstMessage?: string }) => {
      if (!agentId || !platform) throw new Error('Missing agent or platform');

      console.log(`[usePortalUpdateAgentPrompt] Updating prompt for ${platform} agent: ${agentId}`);

      switch (platform) {
        case 'elevenlabs': {
          const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
            body: { 
              action: 'update_prompt', 
              agentId, 
              organizationId,
              prompt: systemPrompt,
              firstMessage 
            }
          });
          if (error) throw error;
          return data;
        }

        case 'retell': {
          // For Retell, we need to update the LLM config
          // First get agent to find LLM ID
          const { data: agentData } = await supabase.functions.invoke('retell-proxy', {
            body: { action: 'getAgent', agentId, organizationId }
          });
          
          const agentInfo = agentData?.data || agentData;
          const llmId = agentInfo?.llm_websocket_url?.split('/').pop() || agentInfo?.response_engine?.llm_id;
          
          if (llmId) {
            // Update LLM with new prompt
            const { data, error } = await supabase.functions.invoke('retell-proxy', {
              body: { 
                action: 'updateLlm', 
                llmId, 
                organizationId,
                config: {
                  general_prompt: systemPrompt,
                  ...(firstMessage && { begin_message: firstMessage })
                }
              }
            });
            if (error) throw error;
            return data;
          } else {
            // Update agent directly
            const { data, error } = await supabase.functions.invoke('retell-proxy', {
              body: { 
                action: 'updateAgent', 
                retellAgentId: agentId, 
                organizationId,
                config: {
                  general_prompt: systemPrompt,
                  ...(firstMessage && { begin_message: firstMessage })
                }
              }
            });
            if (error) throw error;
            return data;
          }
        }

        case 'vapi': {
          const { data, error } = await supabase.functions.invoke('vapi-proxy', {
            body: { 
              action: 'updateAssistant', 
              assistantId: agentId, 
              organizationId,
              config: {
                firstMessage,
                model: {
                  systemMessage: systemPrompt,
                }
              }
            }
          });
          if (error) throw error;
          return data;
        }

        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-agent-config', agentId, platform] });
    },
  });
}

/**
 * Hook pour récupérer la configuration d'un agent spécifique (admin portal)
 * Prend en paramètre l'agent au lieu d'utiliser le contexte portal
 */
export function useAgentConfigByPlatform(agent: { 
  id: string; 
  platform: string; 
  platform_agent_id?: string | null;
  organization_id?: string;
  config?: Record<string, any>;
}) {
  const platformAgentId = agent.config?.agent_id || agent.platform_agent_id;
  const platform = agent.platform;
  const organizationId = agent.organization_id;

  return useQuery({
    queryKey: ['agent-config-by-platform', agent.id, platformAgentId, platform],
    queryFn: async (): Promise<NormalizedAgentConfig | null> => {
      if (!platformAgentId || !platform) return null;

      console.log(`[useAgentConfigByPlatform] Fetching config for ${platform} agent: ${platformAgentId}`);

      switch (platform) {
        case 'elevenlabs': {
          const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
            body: { action: 'get', agentId: platformAgentId, organizationId }
          });
          if (error) throw error;
          
          const agentInfo = data?.agent || data;
          const conversationConfig = agentInfo?.conversation_config || {};
          const agentConfig = conversationConfig?.agent || {};
          
          return {
            systemPrompt: agentConfig?.prompt?.prompt || '',
            firstMessage: agentConfig?.first_message || '',
            voiceId: conversationConfig?.tts?.voice_id,
            voiceSettings: {
              stability: conversationConfig?.tts?.stability,
              similarity: conversationConfig?.tts?.similarity_boost,
            },
            agentName: agentInfo?.name,
            platform: 'elevenlabs',
            raw: data,
          };
        }

        case 'retell': {
          const { data: agentData, error } = await supabase.functions.invoke('retell-proxy', {
            body: { 
              action: 'getAgent', 
              retellAgentId: platformAgentId, 
              organizationId
            }
          });
          if (error) throw error;
          
          const agentInfo = agentData?.data || agentData;
          const llmId = agentInfo?.llm_websocket_url?.split('/').pop() || agentInfo?.response_engine?.llm_id;
          
          let systemPrompt = agentInfo?.general_prompt || '';
          let firstMessage = agentInfo?.begin_message || '';
          
          if (llmId) {
            const { data: llmData } = await supabase.functions.invoke('retell-proxy', {
              body: { 
                action: 'getLlm', 
                llmId, 
                organizationId
              }
            });
            if (llmData?.data) {
              systemPrompt = llmData.data.general_prompt || systemPrompt;
              firstMessage = llmData.data.begin_message || firstMessage;
            }
          }
          
          return {
            systemPrompt,
            firstMessage,
            voiceId: agentInfo?.voice_id,
            agentName: agentInfo?.agent_name,
            platform: 'retell',
            raw: { agent: agentInfo, llmId },
          };
        }

        case 'vapi': {
          const { data, error } = await supabase.functions.invoke('vapi-proxy', {
            body: { 
              action: 'getAssistant', 
              assistantId: platformAgentId, 
              organizationId
            }
          });
          if (error) throw error;
          
          const assistant = data?.data || data;
          
          let systemPrompt = assistant?.model?.systemMessage || '';
          if (!systemPrompt && assistant?.model?.messages) {
            const systemMsg = assistant.model.messages.find((m: any) => m.role === 'system');
            systemPrompt = systemMsg?.content || '';
          }
          
          return {
            systemPrompt,
            firstMessage: assistant?.firstMessage || '',
            voiceId: assistant?.voice?.voiceId,
            agentName: assistant?.name,
            platform: 'vapi',
            raw: assistant,
          };
        }

        default:
          return null;
      }
    },
    enabled: !!platformAgentId && !!platform,
    retry: 1,
  });
}
