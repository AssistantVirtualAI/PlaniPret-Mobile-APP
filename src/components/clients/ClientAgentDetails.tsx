import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Bot, BookOpen, Volume2, MessageSquare, 
  ExternalLink, Copy, CheckCircle 
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface ClientAgentDetailsProps {
  agentId: string;
  onClose: () => void;
}

export const ClientAgentDetails = ({ agentId, onClose }: ClientAgentDetailsProps) => {
  const navigate = useNavigate();

  const { data: agent, isLoading } = useQuery({
    queryKey: ['agent-details', agentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agents_safe')
        .select('id, name, platform, platform_agent_id, config, organization_id')
        .eq('id', agentId)
        .single();

      if (error) throw error;
      return data;
    },
  });

  // Fetch agent config based on platform
  const { data: agentConfig, isLoading: isLoadingConfig } = useQuery({
    queryKey: ['agent-config-by-platform', agentId, agent?.platform],
    queryFn: async () => {
      if (!agent?.platform_agent_id) return null;

      const platform = agent.platform;
      const platformAgentId = agent.platform_agent_id;

      console.log(`[ClientAgentDetails] Fetching config for ${platform} agent: ${platformAgentId}`);

      switch (platform) {
        case 'elevenlabs': {
          const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
            body: { action: 'get', agentId: platformAgentId, organizationId: agent.organization_id }
          });
          if (error) throw error;
          
          const agentInfo = data?.agent || data;
          const conversationConfig = agentInfo?.conversation_config || {};
          const agentConf = conversationConfig?.agent || {};
          
          return {
            systemPrompt: agentConf?.prompt?.prompt || '',
            firstMessage: agentConf?.first_message || '',
            voiceId: conversationConfig?.tts?.voice_id,
            voiceSettings: {
              stability: conversationConfig?.tts?.stability || 0.5,
              similarity: conversationConfig?.tts?.similarity_boost || 0.75,
            },
            knowledgeBase: data?.knowledge_base || [],
            platform: 'elevenlabs',
          };
        }

        case 'retell': {
          const { data: agentData, error } = await supabase.functions.invoke('retell-proxy', {
            body: { 
              action: 'getAgent', 
              retellAgentId: platformAgentId, 
              organizationId: agent.organization_id
            }
          });
          if (error) throw error;
          
          const agentInfo = agentData?.data || agentData;
          const llmId = agentInfo?.llm_websocket_url?.split('/').pop() || agentInfo?.response_engine?.llm_id;
          
          let systemPrompt = agentInfo?.general_prompt || '';
          let firstMessage = agentInfo?.begin_message || '';
          
          // Try to get more detailed prompt from LLM
          if (llmId) {
            try {
              const { data: llmData } = await supabase.functions.invoke('retell-proxy', {
                body: { 
                  action: 'getLlm', 
                  llmId, 
                  organizationId: agent.organization_id
                }
              });
              if (llmData?.data) {
                systemPrompt = llmData.data.general_prompt || systemPrompt;
                firstMessage = llmData.data.begin_message || firstMessage;
              }
            } catch (e) {
              console.warn('[ClientAgentDetails] Could not fetch LLM config:', e);
            }
          }
          
          return {
            systemPrompt,
            firstMessage,
            voiceId: agentInfo?.voice_id,
            voiceSettings: null,
            knowledgeBase: [],
            platform: 'retell',
          };
        }

        case 'vapi': {
          const { data, error } = await supabase.functions.invoke('vapi-proxy', {
            body: { 
              action: 'getAssistant', 
              assistantId: platformAgentId, 
              organizationId: agent.organization_id
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
            voiceSettings: null,
            knowledgeBase: [],
            platform: 'vapi',
          };
        }

        default:
          console.warn(`[ClientAgentDetails] Unsupported platform: ${platform}`);
          return null;
      }
    },
    enabled: !!agent?.platform_agent_id && !!agent?.platform,
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copié`);
  };

  const config = agent?.config as Record<string, any> || {};
  const platformLabel = agent?.platform?.toUpperCase() || 'Agent';

  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            {agent?.name || 'Agent'}
            <Badge variant="outline" className="ml-2">{platformLabel}</Badge>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Agent ID */}
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Agent ID {platformLabel}</p>
                    <p className="font-mono text-sm">
                      {agent?.platform_agent_id || config.agent_id || 'Non configuré'}
                    </p>
                  </div>
                  {(agent?.platform_agent_id || config.agent_id) && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => copyToClipboard(agent?.platform_agent_id || config.agent_id, 'Agent ID')}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* System Prompt */}
              <div>
                <h4 className="flex items-center gap-2 font-medium mb-2">
                  <MessageSquare className="h-4 w-4" />
                  Prompt Système
                </h4>
                <div className="p-4 bg-muted rounded-lg">
                  {isLoadingConfig ? (
                    <Skeleton className="h-20 w-full" />
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">
                      {agentConfig?.systemPrompt || config.system_prompt || 'Aucun prompt défini'}
                    </p>
                  )}
                </div>
              </div>

              {/* First Message */}
              <div>
                <h4 className="flex items-center gap-2 font-medium mb-2">
                  <MessageSquare className="h-4 w-4" />
                  Premier Message
                </h4>
                <div className="p-4 bg-muted rounded-lg">
                  {isLoadingConfig ? (
                    <Skeleton className="h-12 w-full" />
                  ) : (
                    <p className="text-sm">
                      {agentConfig?.firstMessage || config.first_message || 'Aucun message défini'}
                    </p>
                  )}
                </div>
              </div>

              {/* Voice Configuration - only show if available */}
              {agentConfig?.voiceSettings && (
                <div>
                  <h4 className="flex items-center gap-2 font-medium mb-2">
                    <Volume2 className="h-4 w-4" />
                    Configuration Vocale
                  </h4>
                  <div className="p-4 bg-muted rounded-lg space-y-2">
                    {isLoadingConfig ? (
                      <Skeleton className="h-16 w-full" />
                    ) : (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Voice ID</span>
                          <span className="font-mono">
                            {agentConfig?.voiceId || config.voice_id || 'Par défaut'}
                          </span>
                        </div>
                        {agentConfig?.voiceSettings?.stability !== undefined && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Stabilité</span>
                            <span>{(agentConfig.voiceSettings.stability || 0.5) * 100}%</span>
                          </div>
                        )}
                        {agentConfig?.voiceSettings?.similarity !== undefined && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Similarité</span>
                            <span>{(agentConfig.voiceSettings.similarity || 0.75) * 100}%</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Knowledge Base - only show for ElevenLabs */}
              {agent?.platform === 'elevenlabs' && (
                <div>
                  <h4 className="flex items-center gap-2 font-medium mb-2">
                    <BookOpen className="h-4 w-4" />
                    Base de Connaissances
                  </h4>
                  <div className="p-4 bg-muted rounded-lg">
                    {isLoadingConfig ? (
                      <Skeleton className="h-12 w-full" />
                    ) : agentConfig?.knowledgeBase?.length > 0 ? (
                      <div className="space-y-2">
                        {agentConfig.knowledgeBase.map((doc: any, index: number) => (
                          <div key={index} className="flex items-center justify-between text-sm">
                            <span>{doc.name || `Document ${index + 1}`}</span>
                            <Badge variant="secondary">
                              {doc.size ? `${Math.round(doc.size / 1024)} KB` : 'N/A'}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        Aucun document configuré
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => {
                    onClose();
                    navigate(`/agent-settings/${agentId}`);
                  }}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Configurer l'agent
                </Button>
                <Button variant="ghost" onClick={onClose}>
                  Fermer
                </Button>
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
