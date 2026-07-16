import { useState, useEffect } from 'react';
import { ElevenLabsAPISections } from '@/components/elevenlabs/ElevenLabsAPISections';
import { VapiAPISections } from '@/components/vapi/VapiAPISections';
import { useParams } from 'react-router-dom';
import { useClientAgentAccess } from '@/hooks/useClientAgentAccess';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { VoiceSelector } from '@/components/agents/VoiceSelector';
import { RetellFullConfigTab } from '@/components/agents/RetellFullConfigTab';
import { 
  Settings, 
  MessageSquare, 
  Volume2, 
  Save,
  Lock,
  Info,
  RefreshCw,
  Loader2,
  AlertCircle,
  Mic,
  Clock,
  Globe,
  Settings2,
  Brain,
} from 'lucide-react';
import { toast } from 'sonner';
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

const ClientAgentSettings = () => {
  const { clientId, agentId } = useParams();
  const { apiKey, platformAgentId, agentName, canEdit, platform, organizationId, isLoading: accessLoading } = useClientAgentAccess(clientId, agentId);

  // Full config from ElevenLabs API
  const { data: config, isLoading, refetch } = useElevenLabsFullAgentConfig({
    agentId: platformAgentId,
    apiKey,
    organizationId,
    enabled: !!platformAgentId && platform === 'elevenlabs',
  });

  // Mutation hooks
  const updateTTS = useUpdateTTSSettings();
  const updateASR = useUpdateASRSettings();
  const updateTurn = useUpdateTurnSettings();
  const updateConversation = useUpdateConversationSettings();
  const updateAdvanced = useUpdateAgentAdvancedSettings();
  const updatePromptMutation = useUpdatePrompt();
  const updateLLM = useUpdateLLMSettings();

  // Local state for all settings
  const [prompt, setPrompt] = useState('');
  const [firstMessage, setFirstMessage] = useState('');

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

      if (tts) setTtsSettings(prev => ({ ...prev, ...tts }));
      if (stt) {
        setAsrSettings(prev => ({ ...prev, ...stt }));
        if (stt.keywords) setKeywords(stt.keywords.join(', '));
      }
      if (turn) setTurnSettings(prev => ({ ...prev, ...turn }));
      if (conv) setConversationSettings(prev => ({ ...prev, ...conv }));
      if (agent) {
        setLanguage(agent.language || 'fr');
        setPrompt(agent.prompt?.prompt || '');
        setFirstMessage(agent.first_message || '');
        if (agent.prompt?.llm) setLlmSettings(prev => ({ ...prev, ...agent.prompt?.llm }));
      }
    }
  }, [config]);

  const mutationParams = {
    agentId: platformAgentId!,
    apiKey: apiKey || undefined,
    organizationId: organizationId || undefined,
  };

  const handleSavePrompt = () => {
    if (!platformAgentId) return;
    updatePromptMutation.mutate({ ...mutationParams, prompt, firstMessage });
  };

  const handleSaveTTS = () => {
    if (!platformAgentId) return;
    updateTTS.mutate({ ...mutationParams, ttsSettings });
  };

  const handleSaveASR = () => {
    if (!platformAgentId) return;
    const keywordsArray = keywords.split(',').map(k => k.trim()).filter(Boolean);
    updateASR.mutate({ ...mutationParams, asrSettings: { ...asrSettings, keywords: keywordsArray } });
  };

  const handleSaveTurn = () => {
    if (!platformAgentId) return;
    updateTurn.mutate({ ...mutationParams, turnSettings });
  };

  const handleSaveConversation = () => {
    if (!platformAgentId) return;
    updateConversation.mutate({ ...mutationParams, conversationSettings });
  };

  const handleSaveAdvanced = () => {
    if (!platformAgentId) return;
    updateAdvanced.mutate({ 
      ...mutationParams, 
      agentAdvancedSettings: { language, disable_first_message_interruptions: disableFirstMessageInterruption } 
    });
  };

  const handleSaveLLM = () => {
    if (!platformAgentId) return;
    updateLLM.mutate({ ...mutationParams, llmSettings });
  };

  // Loading state
  if (accessLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // Error state
  if (!platform || (!apiKey && !organizationId) || !platformAgentId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Configuration</h1>
          <p className="text-muted-foreground">Settings for {agentName}</p>
        </div>
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">
                Missing {platform ? platform.toUpperCase() : 'platform'} configuration for this agent
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Verify that the agent has a valid platform ID and API key.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isElevenLabs = platform === 'elevenlabs';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Configuration</h1>
          <p className="text-muted-foreground">Settings for {agentName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="capitalize">{platform}</Badge>
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          {!canEdit && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <Lock className="h-3 w-3" />
              Read only
            </Badge>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : platform === 'retell' ? (
        <RetellFullConfigTab
          agentId={agentId!}
          platformAgentId={platformAgentId}
          organizationId={organizationId || ''}
          apiKey={apiKey}
          canEdit={canEdit}
        />
      ) : platform === 'vapi' ? (
        <VapiAPISections
          organizationId={organizationId}
          apiKey={apiKey}
          assistantId={platformAgentId}
          canEdit={canEdit}
        />
      ) : !isElevenLabs ? (
        <Card className="p-8 text-center">
          <Settings2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">
            Advanced configuration is not available yet for {(platform as string)?.toUpperCase()}.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
        <Accordion type="multiple" defaultValue={['prompt', 'voice']} className="space-y-4">
          {/* Section 1: Prompt & First Message */}
          <AccordionItem value="prompt" className="border rounded-lg bg-card">
            <AccordionTrigger className="px-6 hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <MessageSquare className="h-5 w-5 text-blue-500" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold">Prompt & First Message</h3>
                  <p className="text-sm text-muted-foreground">Instructions and welcome message</p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6">
              <div className="space-y-6">
                <div>
                  <Label className="text-base font-medium">System Prompt</Label>
                  <Textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Instructions for the agent..."
                    rows={10}
                    disabled={!canEdit}
                    className="mt-2 font-mono text-sm"
                  />
                </div>

                <div>
                  <Label className="text-base font-medium">First Message</Label>
                  <Textarea
                    value={firstMessage}
                    onChange={(e) => setFirstMessage(e.target.value)}
                    placeholder="Agent welcome message..."
                    rows={3}
                    disabled={!canEdit}
                    className="mt-2"
                  />
                </div>

                {canEdit && (
                  <Button onClick={handleSavePrompt} disabled={updatePromptMutation.isPending}>
                    {updatePromptMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <Save className="h-4 w-4 mr-2" />
                    Save Prompt
                  </Button>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Section 2: Voice & TTS */}
          <AccordionItem value="voice" className="border rounded-lg bg-card">
            <AccordionTrigger className="px-6 hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Volume2 className="h-5 w-5 text-primary" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold">Voice & TTS</h3>
                  <p className="text-sm text-muted-foreground">Speech synthesis settings</p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6">
              <div className="space-y-6">
                <div>
                  <Label className="text-base font-medium mb-4 block">Select a voice</Label>
                  <VoiceSelector
                    selectedVoiceId={ttsSettings.voice_id}
                    onSelect={(voice) => setTtsSettings(prev => ({ ...prev, voice_id: voice.voice_id }))}
                    apiKey={apiKey}
                    organizationId={organizationId}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label>TTS Model</Label>
                    <Select
                      value={ttsSettings.model_id || 'eleven_turbo_v2_5'}
                      onValueChange={(v) => setTtsSettings(prev => ({ ...prev, model_id: v }))}
                      disabled={!canEdit}
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
                    <Label>Speed ({ttsSettings.speed?.toFixed(1)}x)</Label>
                    <Slider
                      value={[ttsSettings.speed || 1]}
                      onValueChange={([v]) => setTtsSettings(prev => ({ ...prev, speed: v }))}
                      min={0.5}
                      max={2}
                      step={0.1}
                      className="mt-4"
                      disabled={!canEdit}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <Label>Stability ({Math.round((ttsSettings.stability || 0.5) * 100)}%)</Label>
                    <Slider
                      value={[ttsSettings.stability || 0.5]}
                      onValueChange={([v]) => setTtsSettings(prev => ({ ...prev, stability: v }))}
                      min={0}
                      max={1}
                      step={0.01}
                      className="mt-4"
                      disabled={!canEdit}
                    />
                  </div>
                  <div>
                    <Label>Similarity ({Math.round((ttsSettings.similarity_boost || 0.75) * 100)}%)</Label>
                    <Slider
                      value={[ttsSettings.similarity_boost || 0.75]}
                      onValueChange={([v]) => setTtsSettings(prev => ({ ...prev, similarity_boost: v }))}
                      min={0}
                      max={1}
                      step={0.01}
                      className="mt-4"
                      disabled={!canEdit}
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
                      disabled={!canEdit}
                    />
                  </div>
                </div>

                <div>
                  <Label>Streaming latency optimization (0-4)</Label>
                  <Slider
                    value={[ttsSettings.optimize_streaming_latency || 3]}
                    onValueChange={([v]) => setTtsSettings(prev => ({ ...prev, optimize_streaming_latency: v }))}
                    min={0}
                    max={4}
                    step={1}
                    className="mt-4"
                    disabled={!canEdit}
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    0 = High quality, 4 = Low latency
                  </p>
                </div>

                {canEdit && (
                  <Button onClick={handleSaveTTS} disabled={updateTTS.isPending}>
                    {updateTTS.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <Save className="h-4 w-4 mr-2" />
                    Save TTS
                  </Button>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Section 3: ASR/STT */}
          <AccordionItem value="asr" className="border rounded-lg bg-card">
            <AccordionTrigger className="px-6 hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <Mic className="h-5 w-5 text-purple-500" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold">Speech Recognition (ASR)</h3>
                  <p className="text-sm text-muted-foreground">Transcription settings</p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6">
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label>ASR Provider</Label>
                    <Select
                      value={asrSettings.provider || 'elevenlabs'}
                      onValueChange={(v: any) => setAsrSettings(prev => ({ ...prev, provider: v }))}
                      disabled={!canEdit}
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
                    <Label>Quality</Label>
                    <Select
                      value={asrSettings.quality || 'high'}
                      onValueChange={(v: any) => setAsrSettings(prev => ({ ...prev, quality: v }))}
                      disabled={!canEdit}
                    >
                      <SelectTrigger className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high">High (recommended)</SelectItem>
                        <SelectItem value="standard">Standard</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>Custom keywords</Label>
                  <Input
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    placeholder="word1, word2, word3..."
                    className="mt-2"
                    disabled={!canEdit}
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Separate keywords with commas. Improves recognition of specific terms.
                  </p>
                </div>

                {canEdit && (
                  <Button onClick={handleSaveASR} disabled={updateASR.isPending}>
                    {updateASR.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <Save className="h-4 w-4 mr-2" />
                    Save ASR
                  </Button>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Section 4: Turn Settings */}
          <AccordionItem value="turn" className="border rounded-lg bg-card">
            <AccordionTrigger className="px-6 hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-500/10">
                  <Clock className="h-5 w-5 text-orange-500" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold">Turn Management</h3>
                  <p className="text-sm text-muted-foreground">Timing and interruptions</p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6">
              <div className="space-y-6">
                <div>
                  <Label>Agent responsiveness</Label>
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    {TURN_EAGERNESS_OPTIONS.map(option => (
                      <div
                        key={option.value}
                        className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                          turnSettings.turn_eagerness === option.value 
                            ? 'border-primary bg-primary/5' 
                            : 'border-border hover:border-muted-foreground/50'
                        } ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
                        onClick={() => canEdit && setTurnSettings(prev => ({ ...prev, turn_eagerness: option.value as any }))}
                      >
                        <p className="font-medium text-sm">{option.label}</p>
                        <p className="text-xs text-muted-foreground mt-1">{option.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label>Turn timeout ({turnSettings.turn_timeout}s)</Label>
                    <Slider
                      value={[turnSettings.turn_timeout || 10]}
                      onValueChange={([v]) => setTurnSettings(prev => ({ ...prev, turn_timeout: v }))}
                      min={1}
                      max={30}
                      step={1}
                      className="mt-4"
                      disabled={!canEdit}
                    />
                    <p className="text-xs text-muted-foreground mt-2">Time before the agent follows up</p>
                  </div>

                  <div>
                    <Label>End call on silence ({turnSettings.silence_end_call_timeout}s)</Label>
                    <Slider
                      value={[turnSettings.silence_end_call_timeout || 30]}
                      onValueChange={([v]) => setTurnSettings(prev => ({ ...prev, silence_end_call_timeout: v }))}
                      min={5}
                      max={120}
                      step={5}
                      className="mt-4"
                      disabled={!canEdit}
                    />
                    <p className="text-xs text-muted-foreground mt-2">Silence before automatic ending</p>
                  </div>
                </div>

                {canEdit && (
                  <Button onClick={handleSaveTurn} disabled={updateTurn.isPending}>
                    {updateTurn.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <Save className="h-4 w-4 mr-2" />
                    Save Turns
                  </Button>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Section 5: Conversation Settings */}
          <AccordionItem value="conversation" className="border rounded-lg bg-card">
            <AccordionTrigger className="px-6 hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <Settings className="h-5 w-5 text-green-500" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold">Conversation Settings</h3>
                  <p className="text-sm text-muted-foreground">Duration and events</p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6">
              <div className="space-y-6">
                <div>
                  <Label>Maximum duration ({Math.round((conversationSettings.max_duration_seconds || 600) / 60)} min)</Label>
                  <Slider
                    value={[conversationSettings.max_duration_seconds || 600]}
                    onValueChange={([v]) => setConversationSettings(prev => ({ ...prev, max_duration_seconds: v }))}
                    min={60}
                    max={3600}
                    step={60}
                    className="mt-4"
                    disabled={!canEdit}
                  />
                </div>

                <div>
                  <Label className="mb-3 block">Client Events</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {ELEVENLABS_CLIENT_EVENTS.map(event => (
                      <div key={event.id} className="flex items-start gap-3 p-3 rounded-lg border">
                        <Checkbox
                          checked={conversationSettings.client_events?.includes(event.id)}
                          onCheckedChange={(checked) => {
                            if (!canEdit) return;
                            setConversationSettings(prev => ({
                              ...prev,
                              client_events: checked
                                ? [...(prev.client_events || []), event.id]
                                : (prev.client_events || []).filter(e => e !== event.id),
                            }));
                          }}
                          disabled={!canEdit}
                        />
                        <div>
                          <p className="text-sm font-medium">{event.name}</p>
                          <p className="text-xs text-muted-foreground">{event.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {canEdit && (
                  <Button onClick={handleSaveConversation} disabled={updateConversation.isPending}>
                    {updateConversation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <Save className="h-4 w-4 mr-2" />
                    Save Conversation
                  </Button>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Section 6: LLM Settings */}
          <AccordionItem value="llm" className="border rounded-lg bg-card">
            <AccordionTrigger className="px-6 hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-cyan-500/10">
                  <Brain className="h-5 w-5 text-cyan-500" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold">LLM Settings</h3>
                  <p className="text-sm text-muted-foreground">Temperature and model limits</p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6">
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label>Temperature ({llmSettings.temperature?.toFixed(1)})</Label>
                    <Slider
                      value={[llmSettings.temperature || 0.7]}
                      onValueChange={([v]) => setLlmSettings(prev => ({ ...prev, temperature: v }))}
                      min={0}
                      max={2}
                      step={0.1}
                      className="mt-4"
                      disabled={!canEdit}
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      Lower = more predictable, higher = more creative
                    </p>
                  </div>

                  <div>
                    <Label>Max Tokens</Label>
                    <Input
                      type="number"
                      value={llmSettings.max_tokens || 1000}
                      onChange={(e) => setLlmSettings(prev => ({ ...prev, max_tokens: parseInt(e.target.value) || 1000 }))}
                      className="mt-2"
                      disabled={!canEdit}
                      min={100}
                      max={32000}
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      Maximum tokens per response
                    </p>
                  </div>
                </div>

                {canEdit && (
                  <Button onClick={handleSaveLLM} disabled={updateLLM.isPending}>
                    {updateLLM.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <Save className="h-4 w-4 mr-2" />
                    Save LLM
                  </Button>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Section 7: Language & Advanced */}
          <AccordionItem value="advanced" className="border rounded-lg bg-card">
            <AccordionTrigger className="px-6 hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <Globe className="h-5 w-5 text-amber-500" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold">Language & Advanced</h3>
                  <p className="text-sm text-muted-foreground">Language and advanced settings</p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6">
              <div className="space-y-6">
                <div>
                  <Label>Agent language</Label>
                  <Select
                    value={language}
                    onValueChange={setLanguage}
                    disabled={!canEdit}
                  >
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

                <div className="flex items-center justify-between p-4 rounded-lg border">
                  <div>
                    <p className="font-medium text-sm">Disable first message interruption</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      The user will not be able to interrupt the welcome message
                    </p>
                  </div>
                  <Switch
                    checked={disableFirstMessageInterruption}
                    onCheckedChange={setDisableFirstMessageInterruption}
                    disabled={!canEdit}
                  />
                </div>

                {canEdit && (
                  <Button onClick={handleSaveAdvanced} disabled={updateAdvanced.isPending}>
                    {updateAdvanced.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <Save className="h-4 w-4 mr-2" />
                    Save Advanced
                  </Button>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Section 8: Agent Info */}
          <AccordionItem value="info" className="border rounded-lg bg-card">
            <AccordionTrigger className="px-6 hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gray-500/10">
                  <Info className="h-5 w-5 text-gray-500" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold">Information</h3>
                  <p className="text-sm text-muted-foreground">Technical agent details</p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Platform</p>
                  <p className="font-medium capitalize">{platform}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Agent ID</p>
                  <p className="font-mono text-sm truncate">{platformAgentId}</p>
                </div>
                {config?.name && (
                  <div className="p-3 rounded-lg bg-muted/50 col-span-2">
                    <p className="text-sm text-muted-foreground">Agent Name</p>
                    <p className="font-medium">{config.name}</p>
                  </div>
                )}
                {ttsSettings.voice_id && (
                  <div className="p-3 rounded-lg bg-muted/50 col-span-2">
                    <p className="text-sm text-muted-foreground">Voice ID</p>
                    <p className="font-mono text-sm">{ttsSettings.voice_id}</p>
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="mt-6">
          <h2 className="text-lg font-semibold mb-4">Extended ElevenLabs API</h2>
          <ElevenLabsAPISections
            apiKey={apiKey}
            organizationId={organizationId}
            canEdit={canEdit}
            voiceId={ttsSettings.voice_id}
          />
        </div>
        </div>
      )}
    </div>
  );
};

export default ClientAgentSettings;
