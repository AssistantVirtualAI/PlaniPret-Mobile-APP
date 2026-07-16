import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Save, 
  RefreshCw, 
  BookOpen, 
  MessageSquare,
  Loader2,
  CheckCircle,
  AlertCircle,
  Sparkles
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AgentSettings } from '@/hooks/useAgentSettings';
import { PromptTemplatesSection } from './PromptTemplatesSection';
import { PromptAIAssistant } from './PromptAIAssistant';
import { AgentKnowledgeSection } from './AgentKnowledgeSection';
import { useAgentConfigByPlatform } from '@/hooks/usePortalAgentConfig';

interface AgentKnowledgePromptTabProps {
  agent: AgentSettings;
}

export function AgentKnowledgePromptTab({ agent }: AgentKnowledgePromptTabProps) {
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState('');
  const [firstMessage, setFirstMessage] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  const platformAgentId = (agent.config as Record<string, any>)?.agent_id || agent.platform_agent_id;

  // Use unified multi-platform hook
  const { data: agentConfig, isLoading: isLoadingConfig, error: configError } = useAgentConfigByPlatform({
    id: agent.id,
    platform: agent.platform,
    platform_agent_id: agent.platform_agent_id,
    organization_id: agent.organization_id,
    config: agent.config as Record<string, any>,
  });

  // Initialiser les champs avec les valeurs récupérées
  useEffect(() => {
    if (agentConfig) {
      setPrompt(agentConfig.systemPrompt || '');
      setFirstMessage(agentConfig.firstMessage || '');
      setHasChanges(false);
    }
  }, [agentConfig]);

  // Mutation pour mettre à jour le prompt (multi-plateforme)
  const updatePrompt = useMutation({
    mutationFn: async () => {
      const platform = agent.platform;
      
      switch (platform) {
        case 'elevenlabs': {
          const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
            body: { 
              action: 'update_prompt',
              agentId: platformAgentId,
              organizationId: agent.organization_id,
              prompt,
              firstMessage
            }
          });
          if (error) throw error;
          return data;
        }
        
        case 'retell': {
          // Get agent to find LLM ID - API key fetched server-side via organizationId
          const { data: agentData } = await supabase.functions.invoke('retell-proxy', {
            body: { 
              action: 'getAgent', 
              retellAgentId: platformAgentId, 
              organizationId: agent.organization_id
            }
          });
          
          const agentInfo = agentData?.data || agentData;
          const llmId = agentInfo?.llm_websocket_url?.split('/').pop() || agentInfo?.response_engine?.llm_id;
          
          if (llmId) {
            const { data, error } = await supabase.functions.invoke('retell-proxy', {
              body: { 
                action: 'updateLlm', 
                llmId, 
                organizationId: agent.organization_id,
                config: {
                  general_prompt: prompt,
                  begin_message: firstMessage
                }
              }
            });
            if (error) throw error;
            return data;
          } else {
            const { data, error } = await supabase.functions.invoke('retell-proxy', {
              body: { 
                action: 'updateAgent', 
                retellAgentId: platformAgentId, 
                organizationId: agent.organization_id,
                config: {
                  general_prompt: prompt,
                  begin_message: firstMessage
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
              assistantId: platformAgentId, 
              organizationId: agent.organization_id,
              config: {
                firstMessage,
                model: {
                  systemMessage: prompt,
                }
              }
            }
          });
          if (error) throw error;
          return data;
        }
        
        default:
          throw new Error(`Platform ${platform} not supported for prompt update`);
      }
    },
    onSuccess: () => {
      toast.success('Prompt mis à jour avec succès');
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ['agent-config-by-platform', agent.id] });
    },
    onError: (error: any) => {
      console.error('[AgentKnowledgePromptTab] Update prompt error:', error);
      toast.error(error.message || 'Erreur lors de la mise à jour du prompt');
    }
  });


  const handlePromptChange = (value: string) => {
    setPrompt(value);
    setHasChanges(true);
  };

  const handleFirstMessageChange = (value: string) => {
    setFirstMessage(value);
    setHasChanges(true);
  };

  const platformLabel = agent.platform.toUpperCase();

  if (!platformAgentId) {
    return (
      <Card className="glass-card">
        <CardContent className="pt-6 text-center">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">
            Veuillez configurer l'ID de l'agent {platformLabel} dans l'onglet Config.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            L'ID de l'agent se trouve dans votre dashboard {platformLabel}.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Templates Section - ElevenLabs only */}
      {agent.platform === 'elevenlabs' && (
        <PromptTemplatesSection 
          agentId={agent.id} 
          platformAgentId={platformAgentId}
          onApplied={() => queryClient.invalidateQueries({ queryKey: ['agent-config-by-platform', agent.id] })}
        />
      )}

      {/* Status Banner */}
      {configError ? (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <div>
            <p className="font-medium text-destructive">Erreur de connexion à {platformLabel}</p>
            <p className="text-sm text-muted-foreground">Vérifiez la clé API et l'ID de l'agent dans la configuration.</p>
          </div>
        </div>
      ) : agentConfig && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-green-500" />
          <div>
            <p className="font-medium text-green-600 dark:text-green-400">Connecté à {platformLabel}</p>
            <p className="text-sm text-muted-foreground">Agent: {agentConfig.agentName || platformAgentId}</p>
          </div>
        </div>
      )}

      <Tabs defaultValue="prompt" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="prompt" className="gap-2">
            <MessageSquare className="w-4 h-4" />
            Prompt & Premier Message
          </TabsTrigger>
          <TabsTrigger value="knowledge" className="gap-2">
            <BookOpen className="w-4 h-4" />
            Base de Connaissances
          </TabsTrigger>
        </TabsList>

        <TabsContent value="prompt" className="space-y-4">
          {/* AI Assistant for Prompt Improvement */}
          <PromptAIAssistant
            agentId={agent.id}
            agentName={agent.name}
            currentPrompt={prompt}
            currentFirstMessage={firstMessage}
            organizationId={agent.organization_id}
            onApplyPrompt={(newPrompt) => {
              setPrompt(newPrompt);
              setHasChanges(true);
            }}
            onApplyFirstMessage={(newFirstMessage) => {
              setFirstMessage(newFirstMessage);
              setHasChanges(true);
            }}
            canEdit={true}
          />

          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Configuration du Prompt
                <Badge variant="outline" className="ml-2">{platformLabel}</Badge>
                {hasChanges && (
                  <Badge variant="outline" className="ml-2 text-yellow-500 border-yellow-500">
                    Non sauvegardé
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Modifiez le prompt système et le premier message de l'agent. 
                Les modifications sont synchronisées avec {platformLabel}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoadingConfig ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <span className="ml-2 text-muted-foreground">Chargement de la configuration...</span>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="system-prompt">Prompt Système</Label>
                    <Textarea
                      id="system-prompt"
                      value={prompt}
                      onChange={(e) => handlePromptChange(e.target.value)}
                      placeholder="Vous êtes un assistant virtuel professionnel..."
                      className="min-h-[250px] font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Instructions générales pour le comportement de l'agent. Ce texte définit la personnalité et les règles de réponse.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="first-message">Premier Message</Label>
                    <Textarea
                      id="first-message"
                      value={firstMessage}
                      onChange={(e) => handleFirstMessageChange(e.target.value)}
                      placeholder="Bonjour ! Comment puis-je vous aider aujourd'hui ?"
                      className="min-h-[100px]"
                    />
                    <p className="text-xs text-muted-foreground">
                      Message d'accueil affiché/prononcé au début de chaque conversation.
                    </p>
                  </div>

                  <div className="flex justify-between items-center pt-4 border-t">
                    <Button
                      variant="outline"
                      onClick={() => queryClient.invalidateQueries({ queryKey: ['agent-config-by-platform', agent.id] })}
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Rafraîchir
                    </Button>
                    <Button
                      onClick={() => updatePrompt.mutate()}
                      disabled={updatePrompt.isPending || !hasChanges}
                    >
                      {updatePrompt.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      Save & Sync
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="knowledge" className="space-y-4">
          <AgentKnowledgeSection
            agentId={agent.id}
            platform={agent.platform}
            platformAgentId={platformAgentId}
            organizationId={agent.organization_id}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
