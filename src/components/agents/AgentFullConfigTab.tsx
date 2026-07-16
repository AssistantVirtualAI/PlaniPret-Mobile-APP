import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ElevenLabsAPISections } from '@/components/elevenlabs/ElevenLabsAPISections';
import { VapiAPISections } from '@/components/vapi/VapiAPISections';
import { 
  Volume2, Mic, Clock, MessageSquare, Settings2, Webhook, 
  Wrench, Globe, Save, Loader2, RefreshCw, ChevronDown 
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { VoiceSelector } from './VoiceSelector';
import { RetellFullConfigTab } from './RetellFullConfigTab';
import {
  useElevenLabsFullAgentConfig,
  useUpdateTTSSettings,
  useUpdateASRSettings,
  useUpdateTurnSettings,
  useUpdateConversationSettings,
  useUpdateAgentAdvancedSettings,
  useUpdatePrompt,
  useUpdateLLMSettings,
} from '@/hooks/useElevenLabsFullConfig';
import {
  ELEVENLABS_LANGUAGES,
  ELEVENLABS_CLIENT_EVENTS,
  TURN_EAGERNESS_OPTIONS,
  ASR_PROVIDERS,
  TTS_MODELS,
} from '@/types/elevenlabs-full';
import type { TTSSettings, ASRSettings, TurnSettings, ConversationSettings, LLMSettings } from '@/types/elevenlabs-full';

interface AgentFullConfigTabProps {
  agentId: string;
  platformAgentId: string | null;
  apiKey?: string | null;
  platform?: string;
  organizationId?: string;
}

export function AgentFullConfigTab({ agentId, platformAgentId, apiKey, platform, organizationId }: AgentFullConfigTabProps) {
  // Route to platform-specific component
  if (platform === 'retell' && organizationId) {
    return (
      <RetellFullConfigTab
        agentId={agentId}
        platformAgentId={platformAgentId}
        organizationId={organizationId}
      />
    );
  }

  if (platform === 'vapi' && organizationId) {
    return (
      <VapiAPISections
        organizationId={organizationId}
        apiKey={apiKey}
        assistantId={platformAgentId}
        canEdit={true}
      />
    );
  }

  // Default: ElevenLabs
  return <ElevenLabsFullConfigTab agentId={agentId} platformAgentId={platformAgentId} apiKey={apiKey} />;
}

// ElevenLabs-specific config (original component logic)
function ElevenLabsFullConfigTab({ agentId, platformAgentId, apiKey }: { agentId: string; platformAgentId: string | null; apiKey: string | null }) {
  const { data: config, isLoading, refetch } = useElevenLabsFullAgentConfig({
    agentId: platformAgentId,
    apiKey,
    enabled: !!platformAgentId,
  });

  const updateTTS = useUpdateTTSSettings();
  const updateASR = useUpdateASRSettings();
  const updateTurn = useUpdateTurnSettings();
  const updateConversation = useUpdateConversationSettings();
  const updateAdvanced = useUpdateAgentAdvancedSettings();
  const updatePrompt = useUpdatePrompt();
  const updateLLM = useUpdateLLMSettings();

  // Local state for form values
  const [ttsSettings, setTtsSettings] = useState<TTSSettings>({
    voice_id: '',
    model_id: 'eleven_turbo_v2_5',
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0,
    speed: 1,
    optimize_streaming_latency: 3,
  });

  const [asrSettings, setAsrSettings] = useState<ASRSettings>({
    provider: 'elevenlabs',
    quality: 'high',
    keywords: [],
  });

  const [turnSettings, setTurnSettings] = useState<TurnSettings>({
    turn_timeout: 10,
    silence_end_call_timeout: 30,
    turn_eagerness: 'normal',
  });

  const [conversationSettings, setConversationSettings] = useState<ConversationSettings>({
    max_duration_seconds: 600,
    client_events: ['transcript', 'audio'],
  });

  const [language, setLanguage] = useState('fr');
  const [disableFirstMessageInterruption, setDisableFirstMessageInterruption] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [firstMessage, setFirstMessage] = useState('');
  const [llmSettings, setLlmSettings] = useState<LLMSettings>({
    temperature: 0.7,
    max_tokens: 1000,
  });
  const [keywords, setKeywords] = useState('');

  // Sync config to local state
  useEffect(() => {
    if (config) {
      const tts = config.conversation_config?.tts;
      const stt = config.conversation_config?.stt;
      const turn = config.conversation_config?.turn;
      const conv = config.conversation_config?.conversation;
      const agent = config.conversation_config?.agent;

      if (tts) {
        setTtsSettings(prev => ({ ...prev, ...tts }));
      }
      if (stt) {
        setAsrSettings(prev => ({ ...prev, ...stt }));
        if (stt.keywords) {
          setKeywords(stt.keywords.join(', '));
        }
      }
      if (turn) {
        setTurnSettings(prev => ({ ...prev, ...turn }));
      }
      if (conv) {
        setConversationSettings(prev => ({ ...prev, ...conv }));
      }
      if (agent) {
        setLanguage(agent.language || 'fr');
        setPrompt(agent.prompt?.prompt || '');
        setFirstMessage(agent.first_message || '');
        if (agent.prompt?.llm) {
          setLlmSettings(prev => ({ ...prev, ...agent.prompt?.llm }));
        }
      }
    }
  }, [config]);

  const handleSaveTTS = () => {
    if (!platformAgentId) return;
    updateTTS.mutate({ agentId: platformAgentId, apiKey: apiKey || undefined, ttsSettings });
  };

  const handleSaveASR = () => {
    if (!platformAgentId) return;
    const keywordsArray = keywords.split(',').map(k => k.trim()).filter(Boolean);
    updateASR.mutate({ 
      agentId: platformAgentId, 
      apiKey: apiKey || undefined, 
      asrSettings: { ...asrSettings, keywords: keywordsArray } 
    });
  };

  const handleSaveTurn = () => {
    if (!platformAgentId) return;
    updateTurn.mutate({ agentId: platformAgentId, apiKey: apiKey || undefined, turnSettings });
  };

  const handleSaveConversation = () => {
    if (!platformAgentId) return;
    updateConversation.mutate({ agentId: platformAgentId, apiKey: apiKey || undefined, conversationSettings });
  };

  const handleSaveAdvanced = () => {
    if (!platformAgentId) return;
    updateAdvanced.mutate({ 
      agentId: platformAgentId, 
      apiKey: apiKey || undefined, 
      agentAdvancedSettings: { 
        language, 
        disable_first_message_interruptions: disableFirstMessageInterruption 
      } 
    });
  };

  const handleSavePrompt = () => {
    if (!platformAgentId) return;
    updatePrompt.mutate({ agentId: platformAgentId, apiKey: apiKey || undefined, prompt, firstMessage });
  };

  const handleSaveLLM = () => {
    if (!platformAgentId) return;
    updateLLM.mutate({ agentId: platformAgentId, apiKey: apiKey || undefined, llmSettings });
  };

  if (!platformAgentId) {
    return (
      <Card className="p-8 text-center">
        <Settings2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
        <p className="text-muted-foreground">
          Configurez d'abord l'ID de l'agent ElevenLabs dans l'onglet Config
        </p>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Configuration Avancée ElevenLabs</h2>
          <p className="text-sm text-muted-foreground">
            Paramétrez tous les aspects de votre agent vocal
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Actualiser
        </Button>
      </div>

      <Accordion type="multiple" defaultValue={['voice', 'prompt']} className="space-y-4">
        {/* Section 1: Voice & TTS */}
        <AccordionItem value="voice" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-6 hover:no-underline">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Volume2 className="h-5 w-5 text-primary" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold">Voix & TTS</h3>
                <p className="text-sm text-muted-foreground">Paramètres de synthèse vocale</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            <div className="space-y-6">
              <div>
                <Label className="text-base font-medium mb-4 block">Sélectionner une voix</Label>
                <VoiceSelector
                  selectedVoiceId={ttsSettings.voice_id}
                  onSelect={(voice) => setTtsSettings(prev => ({ ...prev, voice_id: voice.voice_id }))}
                  apiKey={apiKey}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>Modèle TTS</Label>
                  <Select
                    value={ttsSettings.model_id || 'eleven_turbo_v2_5'}
                    onValueChange={(v) => setTtsSettings(prev => ({ ...prev, model_id: v }))}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TTS_MODELS.map(model => (
                        <SelectItem key={model.id} value={model.id}>
                          <div>
                            <div className="font-medium">{model.name}</div>
                            <div className="text-xs text-muted-foreground">{model.description}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Vitesse ({ttsSettings.speed?.toFixed(1)}x)</Label>
                  <Slider
                    value={[ttsSettings.speed || 1]}
                    onValueChange={([v]) => setTtsSettings(prev => ({ ...prev, speed: v }))}
                    min={0.5}
                    max={2}
                    step={0.1}
                    className="mt-4"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <Label>Stabilité ({Math.round((ttsSettings.stability || 0.5) * 100)}%)</Label>
                  <Slider
                    value={[ttsSettings.stability || 0.5]}
                    onValueChange={([v]) => setTtsSettings(prev => ({ ...prev, stability: v }))}
                    min={0}
                    max={1}
                    step={0.01}
                    className="mt-4"
                  />
                </div>
                <div>
                  <Label>Similarité ({Math.round((ttsSettings.similarity_boost || 0.75) * 100)}%)</Label>
                  <Slider
                    value={[ttsSettings.similarity_boost || 0.75]}
                    onValueChange={([v]) => setTtsSettings(prev => ({ ...prev, similarity_boost: v }))}
                    min={0}
                    max={1}
                    step={0.01}
                    className="mt-4"
                  />
                </div>
                <div>
                  <Label>Style ({Math.round((ttsSettings.style || 0) * 100)}%)</Label>
                  <Slider
                    value={[ttsSettings.style || 0]}
                    onValueChange={([v]) => setTtsSettings(prev => ({ ...prev, style: v }))}
                    min={0}
                    max={1}
                    step={0.01}
                    className="mt-4"
                  />
                </div>
              </div>

              <div>
                <Label>Optimisation latence streaming (0-4)</Label>
                <Slider
                  value={[ttsSettings.optimize_streaming_latency || 3]}
                  onValueChange={([v]) => setTtsSettings(prev => ({ ...prev, optimize_streaming_latency: v }))}
                  min={0}
                  max={4}
                  step={1}
                  className="mt-4"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  0 = High quality, 4 = Low latency
                </p>
              </div>

              <Button onClick={handleSaveTTS} disabled={updateTTS.isPending}>
                {updateTTS.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Save className="h-4 w-4 mr-2" />
                Save TTS
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Section 2: ASR/STT */}
        <AccordionItem value="asr" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-6 hover:no-underline">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Mic className="h-5 w-5 text-purple-500" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold">Reconnaissance Vocale (ASR)</h3>
                <p className="text-sm text-muted-foreground">Paramètres de transcription</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>Fournisseur ASR</Label>
                  <Select
                    value={asrSettings.provider || 'elevenlabs'}
                    onValueChange={(v: any) => setAsrSettings(prev => ({ ...prev, provider: v }))}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ASR_PROVIDERS.map(provider => (
                        <SelectItem key={provider.value} value={provider.value}>
                          <div>
                            <div className="font-medium">{provider.label}</div>
                            <div className="text-xs text-muted-foreground">{provider.description}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Qualité</Label>
                  <Select
                    value={asrSettings.quality || 'high'}
                    onValueChange={(v: any) => setAsrSettings(prev => ({ ...prev, quality: v }))}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">Haute (recommandé)</SelectItem>
                      <SelectItem value="standard">Standard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Mots-clés personnalisés</Label>
                <Input
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="mot1, mot2, mot3..."
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Separate keywords with commas. Improves recognition of specific terms.
                </p>
              </div>

              <Button onClick={handleSaveASR} disabled={updateASR.isPending}>
                {updateASR.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Save className="h-4 w-4 mr-2" />
                Save ASR
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Section 3: Turn Settings */}
        <AccordionItem value="turn" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-6 hover:no-underline">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/10">
                <Clock className="h-5 w-5 text-orange-500" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold">Gestion des Tours</h3>
                <p className="text-sm text-muted-foreground">Timing et interruptions</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            <div className="space-y-6">
              <div>
                <Label>Réactivité de l'agent</Label>
                <div className="grid grid-cols-3 gap-3 mt-3">
                  {TURN_EAGERNESS_OPTIONS.map(option => (
                    <Card
                      key={option.value}
                      className={`p-4 cursor-pointer transition-all ${
                        turnSettings.turn_eagerness === option.value 
                          ? 'border-primary bg-primary/5' 
                          : 'hover:border-primary/50'
                      }`}
                      onClick={() => setTurnSettings(prev => ({ ...prev, turn_eagerness: option.value as any }))}
                    >
                      <h4 className="font-medium">{option.label}</h4>
                      <p className="text-xs text-muted-foreground mt-1">{option.description}</p>
                    </Card>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>Timeout de tour ({turnSettings.turn_timeout}s)</Label>
                  <Slider
                    value={[turnSettings.turn_timeout || 10]}
                    onValueChange={([v]) => setTurnSettings(prev => ({ ...prev, turn_timeout: v }))}
                    min={5}
                    max={30}
                    step={1}
                    className="mt-4"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Temps avant que l'agent reprenne la parole
                  </p>
                </div>

                <div>
                  <Label>Fin d'appel sur silence ({turnSettings.silence_end_call_timeout}s)</Label>
                  <Slider
                    value={[turnSettings.silence_end_call_timeout || 30]}
                    onValueChange={([v]) => setTurnSettings(prev => ({ ...prev, silence_end_call_timeout: v }))}
                    min={10}
                    max={120}
                    step={5}
                    className="mt-4"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Silence duration before automatic ending
                  </p>
                </div>
              </div>

              <Button onClick={handleSaveTurn} disabled={updateTurn.isPending}>
                {updateTurn.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Save className="h-4 w-4 mr-2" />
                Save Turns
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Section 4: Conversation Settings */}
        <AccordionItem value="conversation" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-6 hover:no-underline">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <MessageSquare className="h-5 w-5 text-green-500" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold">Paramètres Conversation</h3>
                <p className="text-sm text-muted-foreground">Durée et événements</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            <div className="space-y-6">
              <div>
                <Label>Durée maximale ({Math.floor((conversationSettings.max_duration_seconds || 600) / 60)} min)</Label>
                <Slider
                  value={[conversationSettings.max_duration_seconds || 600]}
                  onValueChange={([v]) => setConversationSettings(prev => ({ ...prev, max_duration_seconds: v }))}
                  min={60}
                  max={3600}
                  step={60}
                  className="mt-4"
                />
              </div>

              <div>
                <Label className="mb-3 block">Événements client activés</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {ELEVENLABS_CLIENT_EVENTS.map(event => (
                    <div key={event.id} className="flex items-start space-x-3 p-3 rounded-lg bg-muted/30">
                      <Checkbox
                        id={event.id}
                        checked={conversationSettings.client_events?.includes(event.id)}
                        onCheckedChange={(checked) => {
                          const events = conversationSettings.client_events || [];
                          if (checked) {
                            setConversationSettings(prev => ({ 
                              ...prev, 
                              client_events: [...events, event.id] 
                            }));
                          } else {
                            setConversationSettings(prev => ({ 
                              ...prev, 
                              client_events: events.filter(e => e !== event.id) 
                            }));
                          }
                        }}
                      />
                      <div className="space-y-1">
                        <label htmlFor={event.id} className="text-sm font-medium cursor-pointer">
                          {event.name}
                        </label>
                        <p className="text-xs text-muted-foreground">{event.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Button onClick={handleSaveConversation} disabled={updateConversation.isPending}>
                {updateConversation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Save className="h-4 w-4 mr-2" />
                Save Conversation
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Section 5: Agent Advanced */}
        <AccordionItem value="advanced" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-6 hover:no-underline">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Globe className="h-5 w-5 text-blue-500" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold">Paramètres Agent</h3>
                <p className="text-sm text-muted-foreground">Langue et comportement</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            <div className="space-y-6">
              <div>
                <Label>Langue de l'agent</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ELEVENLABS_LANGUAGES.map(lang => (
                      <SelectItem key={lang.code} value={lang.code}>
                        {lang.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
                <div>
                  <Label>Désactiver interruption du premier message</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Empêche l'utilisateur d'interrompre le message d'accueil
                  </p>
                </div>
                <Switch
                  checked={disableFirstMessageInterruption}
                  onCheckedChange={setDisableFirstMessageInterruption}
                />
              </div>

              <Button onClick={handleSaveAdvanced} disabled={updateAdvanced.isPending}>
                {updateAdvanced.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Save className="h-4 w-4 mr-2" />
                Save Agent
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Section 6: Prompt & First Message */}
        <AccordionItem value="prompt" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-6 hover:no-underline">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-pink-500/10">
                <Settings2 className="h-5 w-5 text-pink-500" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold">Prompt & Premier Message</h3>
                <p className="text-sm text-muted-foreground">Instructions de l'agent</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            <div className="space-y-6">
              <div>
                <Label>Prompt Système</Label>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={8}
                  className="mt-2 font-mono text-sm"
                  placeholder="Vous êtes un assistant IA..."
                />
              </div>

              <div>
                <Label>Premier Message</Label>
                <Textarea
                  value={firstMessage}
                  onChange={(e) => setFirstMessage(e.target.value)}
                  rows={3}
                  className="mt-2"
                  placeholder="Hello, how can I help you?"
                />
              </div>

              <Button onClick={handleSavePrompt} disabled={updatePrompt.isPending}>
                {updatePrompt.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Save className="h-4 w-4 mr-2" />
                Save Prompt
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Section 7: LLM Settings */}
        <AccordionItem value="llm" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-6 hover:no-underline">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/10">
                <Wrench className="h-5 w-5 text-cyan-500" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold">Paramètres LLM</h3>
                <p className="text-sm text-muted-foreground">Modèle et génération</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>Température ({llmSettings.temperature?.toFixed(2)})</Label>
                  <Slider
                    value={[llmSettings.temperature || 0.7]}
                    onValueChange={([v]) => setLlmSettings(prev => ({ ...prev, temperature: v }))}
                    min={0}
                    max={2}
                    step={0.05}
                    className="mt-4"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Plus élevé = Plus créatif, Plus bas = Plus déterministe
                  </p>
                </div>

                <div>
                  <Label>Max Tokens ({llmSettings.max_tokens})</Label>
                  <Slider
                    value={[llmSettings.max_tokens || 1000]}
                    onValueChange={([v]) => setLlmSettings(prev => ({ ...prev, max_tokens: v }))}
                    min={100}
                    max={4000}
                    step={100}
                    className="mt-4"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Maximum response length
                  </p>
                </div>
              </div>

              <Button onClick={handleSaveLLM} disabled={updateLLM.isPending}>
                {updateLLM.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Save className="h-4 w-4 mr-2" />
                Save LLM
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Extended ElevenLabs API sections */}
      <div className="mt-6">
        <h2 className="text-lg font-semibold mb-4">API ElevenLabs Étendue</h2>
        <ElevenLabsAPISections
          apiKey={apiKey}
          voiceId={ttsSettings.voice_id}
        />
      </div>
    </motion.div>
  );
}
