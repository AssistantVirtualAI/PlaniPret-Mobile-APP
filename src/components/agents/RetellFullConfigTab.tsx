import { useTranslation } from '@/hooks/useTranslation';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Volume2, MessageSquare, Settings2, Save, Loader2, RefreshCw, Brain, Zap,
  Phone, BookOpen, Shield, Globe, Rocket, AlertCircle
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  useRetellFullAgentConfig,
  useRetellVoices,
  useRetellKnowledgeBases,
  useRetellPhoneNumbers,
  useUpdateRetellAgent,
  useUpdateRetellLLM,
  usePublishRetellAgent,
} from '@/hooks/useRetellFullConfig';

interface RetellFullConfigTabProps {
  agentId: string;
  platformAgentId: string | null;
  organizationId: string;
  apiKey?: string | null;
  canEdit?: boolean;
}

const RETELL_LANGUAGES = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'en-AU', label: 'English (AU)' },
  { value: 'fr-FR', label: 'French' },
  { value: 'es-ES', label: 'Spanish (Spain)' },
  { value: 'es-419', label: 'Spanish (LATAM)' },
  { value: 'de-DE', label: 'German' },
  { value: 'it-IT', label: 'Italian' },
  { value: 'pt-BR', label: 'Portuguese (Brazil)' },
  { value: 'pt-PT', label: 'Portuguese (Portugal)' },
  { value: 'nl-NL', label: 'Dutch' },
  { value: 'ja-JP', label: 'Japanese' },
  { value: 'ko-KR', label: 'Korean' },
  { value: 'zh-CN', label: 'Chinese (Mandarin)' },
  { value: 'ar-SA', label: 'Arabic' },
  { value: 'hi-IN', label: 'Hindi' },
  { value: 'ru-RU', label: 'Russian' },
  { value: 'pl-PL', label: 'Polish' },
  { value: 'tr-TR', label: 'Turkish' },
  { value: 'multi', label: 'Multilingual' },
];

const AMBIENT_SOUNDS = (t: (k: string) => string) => [
  { value: 'none', label: t('componentUi.retellConfig.ambientNone') },
  { value: 'coffee-shop', label: t('componentUi.retellConfig.ambientCoffeeShop') },
  { value: 'convention-hall', label: t('componentUi.retellConfig.ambientConventionHall') },
  { value: 'summer-outdoor', label: t('componentUi.retellConfig.ambientSummerOutdoor') },
  { value: 'mountain-outdoor', label: t('componentUi.retellConfig.ambientMountainOutdoor') },
  { value: 'static-noise', label: t('componentUi.retellConfig.ambientStaticNoise') },
  { value: 'call-center', label: t('componentUi.retellConfig.ambientCallCenter') },
];

const LLM_MODELS = [
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
  { value: 'claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
  { value: 'claude-3-haiku', label: 'Claude 3 Haiku' },
];

export function RetellFullConfigTab({ 
  agentId, 
  platformAgentId, 
  organizationId,
  apiKey,
  canEdit = true,
}: RetellFullConfigTabProps) {
  const { t } = useTranslation();
  const { data: config, isLoading, refetch } = useRetellFullAgentConfig({
    agentId: platformAgentId,
    organizationId,
    apiKey,
    enabled: !!platformAgentId,
  });

  const { data: voices } = useRetellVoices({ organizationId, apiKey });
  const { data: knowledgeBases } = useRetellKnowledgeBases({ organizationId, apiKey });
  const { data: phoneNumbers } = useRetellPhoneNumbers({ organizationId, apiKey });
  const updateAgent = useUpdateRetellAgent();
  const updateLLM = useUpdateRetellLLM();
  const publishAgent = usePublishRetellAgent();

  // ─── Agent settings state ───
  const [voiceId, setVoiceId] = useState('');
  const [voiceTemperature, setVoiceTemperature] = useState(1);
  const [voiceSpeed, setVoiceSpeed] = useState(1);
  const [language, setLanguage] = useState('en-US');
  const [responsiveness, setResponsiveness] = useState(1);
  const [interruptionSensitivity, setInterruptionSensitivity] = useState(1);
  const [enableBackchannel, setEnableBackchannel] = useState(false);
  const [ambientSound, setAmbientSound] = useState('none');
  const [ambientSoundVolume, setAmbientSoundVolume] = useState(1);
  const [boostedKeywords, setBoostedKeywords] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [enableVoicemailDetection, setEnableVoicemailDetection] = useState(false);
  const [endCallAfterSilenceMs, setEndCallAfterSilenceMs] = useState(30000);
  const [maxCallDurationMs, setMaxCallDurationMs] = useState(3600000);
  const [optOutSensitiveData, setOptOutSensitiveData] = useState(false);

  // ─── LLM settings state ───
  const [generalPrompt, setGeneralPrompt] = useState('');
  const [beginMessage, setBeginMessage] = useState('');
  const [modelTemperature, setModelTemperature] = useState(0);
  const [llmModel, setLlmModel] = useState('gpt-4o-mini');
  const [knowledgeBaseIds, setKnowledgeBaseIds] = useState<string[]>([]);

  // Sync config to local state
  useEffect(() => {
    if (config?.agent) {
      const agent = config.agent;
      setVoiceId(agent.voice_id || '');
      setVoiceTemperature(agent.voice_temperature ?? 1);
      setVoiceSpeed(agent.voice_speed ?? 1);
      setLanguage(agent.language || 'en-US');
      setResponsiveness(agent.responsiveness ?? 1);
      setInterruptionSensitivity(agent.interruption_sensitivity ?? 1);
      setEnableBackchannel(agent.enable_backchannel ?? false);
      setAmbientSound(agent.ambient_sound || 'none');
      setAmbientSoundVolume(agent.ambient_sound_volume ?? 1);
      setBoostedKeywords(agent.boosted_keywords?.join(', ') || '');
      setWebhookUrl(agent.webhook_url || '');
      setEnableVoicemailDetection(agent.enable_voicemail_detection ?? false);
      setEndCallAfterSilenceMs(agent.end_call_after_silence_ms ?? 30000);
      setMaxCallDurationMs(agent.max_call_duration_ms ?? 3600000);
      setOptOutSensitiveData(agent.opt_out_sensitive_data_storage ?? false);
    }
    if (config?.llm) {
      const llm = config.llm;
      setGeneralPrompt(llm.general_prompt || '');
      setBeginMessage(llm.begin_message || '');
      setModelTemperature(llm.model_temperature ?? 0);
      setLlmModel(llm.model || 'gpt-4o-mini');
      setKnowledgeBaseIds(llm.knowledge_base_ids || []);
    }
  }, [config]);

  const handleSaveAgentSettings = () => {
    if (!platformAgentId) return;
    
    const keywords = boostedKeywords.split(',').map(k => k.trim()).filter(Boolean);

    updateAgent.mutate({
      agentId: platformAgentId,
      organizationId,
      apiKey: apiKey || undefined,
      config: {
        voice_id: voiceId,
        voice_temperature: voiceTemperature,
        voice_speed: voiceSpeed,
        language,
        responsiveness,
        interruption_sensitivity: interruptionSensitivity,
        enable_backchannel: enableBackchannel,
        ambient_sound: ambientSound === 'none' ? undefined : ambientSound,
        ambient_sound_volume: ambientSoundVolume,
        boosted_keywords: keywords.length > 0 ? keywords : undefined,
        webhook_url: webhookUrl || undefined,
        enable_voicemail_detection: enableVoicemailDetection,
        end_call_after_silence_ms: endCallAfterSilenceMs,
        max_call_duration_ms: maxCallDurationMs,
        opt_out_sensitive_data_storage: optOutSensitiveData,
      },
    });
  };

  const handleSaveLLMSettings = () => {
    if (!platformAgentId || !config?.llm?.llm_id) return;

    updateLLM.mutate({
      llmId: config.llm.llm_id,
      agentId: platformAgentId,
      organizationId,
      apiKey: apiKey || undefined,
      config: {
        general_prompt: generalPrompt,
        begin_message: beginMessage || undefined,
        model_temperature: modelTemperature,
        model: llmModel,
        knowledge_base_ids: knowledgeBaseIds.length > 0 ? knowledgeBaseIds : undefined,
      },
    });
  };

  const handlePublish = () => {
    if (!platformAgentId) return;
    publishAgent.mutate({
      agentId: platformAgentId,
      organizationId,
      apiKey: apiKey || undefined,
    });
  };

  if (!platformAgentId) {
    return (
      <Card className="p-8 text-center">
        <Settings2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
        <p className="text-muted-foreground">
          {t('componentUi.retellConfig.configureFirst')}
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

  const isSaving = updateAgent.isPending || updateLLM.isPending;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">{t('componentUi.retellConfig.title')}</h2>
            <Badge variant="secondary" className="bg-orange-500/10 text-orange-600 border-orange-500/20">
              Retell AI
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('componentUi.retellConfig.desc')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('componentUi.retellConfig.refresh')}
          </Button>
          {canEdit && (
            <Button size="sm" variant="secondary" onClick={handlePublish} disabled={publishAgent.isPending}>
              {publishAgent.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Rocket className="h-4 w-4 mr-2" />}
              Publier
            </Button>
          )}
        </div>
      </div>

      <Accordion type="multiple" defaultValue={['prompt', 'voice']} className="space-y-4">
        {/* ─── Section 1: Prompt & LLM ─── */}
        <AccordionItem value="prompt" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-6 hover:no-underline">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Brain className="h-5 w-5 text-primary" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold">{t('componentUi.retellConfig.promptLlm')}</h3>
                <p className="text-sm text-muted-foreground">{t('componentUi.retellConfig.promptLlmDesc')}</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            <div className="space-y-6">
              <div>
                <Label className="text-base font-medium">{t('componentUi.retellConfig.systemPrompt')}</Label>
                <Textarea
                  value={generalPrompt}
                  onChange={(e) => setGeneralPrompt(e.target.value)}
                  {...{placeholder: t('componentUi.retellConfig.instructionsPlaceholder')}}
                  className="mt-2 min-h-[200px] font-mono text-sm"
                  disabled={!canEdit}
                />
              </div>

              <div>
                <Label className="text-base font-medium">{t('componentUi.retellConfig.firstMessage')}</Label>
                <Textarea
                  value={beginMessage}
                  onChange={(e) => setBeginMessage(e.target.value)}
                  {...{placeholder: t('componentUi.retellConfig.beginMessagePlaceholder')}}
                  className="mt-2 min-h-[80px]"
                  disabled={!canEdit}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>{t('componentUi.retellConfig.llmModel')}</Label>
                  <Select value={llmModel} onValueChange={setLlmModel} disabled={!canEdit}>
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LLM_MODELS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>{t('componentUi.retellConfig.temperature')} ({modelTemperature.toFixed(1)})</Label>
                  <Slider
                    value={[modelTemperature]}
                    onValueChange={([v]) => setModelTemperature(v)}
                    min={0}
                    max={1}
                    step={0.1}
                    className="mt-4"
                    disabled={!canEdit}
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    {t('componentUi.retellConfig.deterministic')} = 0, 1 = {t('componentUi.retellConfig.creative')}
                  </p>
                </div>
              </div>

              {/* Knowledge Base Selection */}
              {knowledgeBases && knowledgeBases.length > 0 && (
                <div>
                  <Label className="text-base font-medium">{t('componentUi.retellConfig.kbLabel')}</Label>
                  <div className="grid grid-cols-1 gap-2 mt-2">
                    {knowledgeBases.map((kb: any) => (
                      <div key={kb.knowledge_base_id} className="flex items-center gap-3 p-3 rounded-lg border">
                        <Switch
                          checked={knowledgeBaseIds.includes(kb.knowledge_base_id)}
                          onCheckedChange={(checked) => {
                            if (!canEdit) return;
                            setKnowledgeBaseIds(prev => 
                              checked 
                                ? [...prev, kb.knowledge_base_id]
                                : prev.filter(id => id !== kb.knowledge_base_id)
                            );
                          }}
                          disabled={!canEdit}
                        />
                        <div>
                          <p className="font-medium text-sm">{kb.knowledge_base_name}</p>
                          {kb.status && (
                            <Badge variant="outline" className="text-xs mt-1">{kb.status}</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {canEdit && (
                <Button 
                  onClick={handleSaveLLMSettings} 
                  disabled={updateLLM.isPending || !config?.llm}
                >
                  {updateLLM.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Save className="h-4 w-4 mr-2" />
                  {t('componentUi.retellConfig.savePromptLlm')}
                </Button>
              )}

              {!config?.llm && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                  <p className="text-sm text-amber-600">
                    {t('componentUi.retellConfig.notRetellLlm')}
                  </p>
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ─── Section 2: Voice & Audio ─── */}
        <AccordionItem value="voice" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-6 hover:no-underline">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Volume2 className="h-5 w-5 text-purple-500" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold">{t('componentUi.retellConfig.voiceAudio')}</h3>
                <p className="text-sm text-muted-foreground">{t('componentUi.retellConfig.voiceAudioDesc')}</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            <div className="space-y-6">
              <div>
                <Label>{t('componentUi.retellConfig.voice')}</Label>
                <Select value={voiceId} onValueChange={setVoiceId} disabled={!canEdit}>
                  <SelectTrigger className="mt-2">
                    <SelectValue {...{placeholder: t('componentUi.retellConfig.selectVoice')}} />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {voices?.map((voice) => (
                      <SelectItem key={voice.voice_id} value={voice.voice_id}>
                        <div className="flex items-center gap-2">
                          <span>{voice.voice_name}</span>
                          <Badge variant="outline" className="text-xs">{voice.provider}</Badge>
                          {voice.gender && <span className="text-xs text-muted-foreground">{voice.gender}</span>}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>{t('componentUi.retellConfig.voiceTemperature')} ({voiceTemperature.toFixed(1)})</Label>
                  <Slider value={[voiceTemperature]} onValueChange={([v]) => setVoiceTemperature(v)} min={0} max={2} step={0.1} className="mt-4" disabled={!canEdit} />
                  <p className="text-xs text-muted-foreground mt-2">{t('componentUi.retellConfig.voiceVariability')}</p>
                </div>
                <div>
                  <Label>{t('componentUi.retellConfig.speed')} ({voiceSpeed.toFixed(1)}x)</Label>
                  <Slider value={[voiceSpeed]} onValueChange={([v]) => setVoiceSpeed(v)} min={0.5} max={2} step={0.1} className="mt-4" disabled={!canEdit} />
                </div>
              </div>

              <div>
                <Label>{t('componentUi.retellConfig.language')}</Label>
                <Select value={language} onValueChange={setLanguage} disabled={!canEdit}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RETELL_LANGUAGES.map((lang) => (
                      <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>{t('componentUi.retellConfig.ambientSound')}</Label>
                  <Select value={ambientSound} onValueChange={setAmbientSound} disabled={!canEdit}>
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AMBIENT_SOUNDS(t).map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {ambientSound !== 'none' && (
                  <div>
                    <Label>{t('componentUi.retellConfig.ambientVolume')} ({Math.round(ambientSoundVolume * 100)}%)</Label>
                    <Slider value={[ambientSoundVolume]} onValueChange={([v]) => setAmbientSoundVolume(v)} min={0} max={2} step={0.1} className="mt-4" disabled={!canEdit} />
                  </div>
                )}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ─── Section 3: Behavior ─── */}
        <AccordionItem value="behavior" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-6 hover:no-underline">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Zap className="h-5 w-5 text-green-500" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold">{t('componentUi.retellConfig.behavior')}</h3>
                <p className="text-sm text-muted-foreground">{t('componentUi.retellConfig.behaviorDesc')}</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>{t('componentUi.retellConfig.responsiveness')} ({responsiveness.toFixed(1)})</Label>
                  <Slider value={[responsiveness]} onValueChange={([v]) => setResponsiveness(v)} min={0} max={1} step={0.1} className="mt-4" disabled={!canEdit} />
                  <p className="text-xs text-muted-foreground mt-2">{t('componentUi.retellConfig.slowResponse')} = 0, 1 = {t('componentUi.retellConfig.fastResponse')}</p>
                </div>
                <div>
                  <Label>{t('componentUi.retellConfig.interruptSensitivity')} ({interruptionSensitivity.toFixed(1)})</Label>
                  <Slider value={[interruptionSensitivity]} onValueChange={([v]) => setInterruptionSensitivity(v)} min={0} max={1} step={0.1} className="mt-4" disabled={!canEdit} />
                  <p className="text-xs text-muted-foreground mt-2">{t('componentUi.retellConfig.ignoreInterruptions')} = 0, 1 = {t('componentUi.retellConfig.verySensitive')}</p>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Label className="text-base">{t('componentUi.retellConfig.backchannel')}</Label>
                  <p className="text-sm text-muted-foreground">{t('componentUi.retellConfig.backchannelDesc')}</p>
                </div>
                <Switch checked={enableBackchannel} onCheckedChange={setEnableBackchannel} disabled={!canEdit} />
              </div>

              <div>
                <Label>{t('componentUi.retellConfig.boostedKeywords')}</Label>
                <Input
                  value={boostedKeywords}
                  onChange={(e) => setBoostedKeywords(e.target.value)}
                  placeholder="mot1, mot2, mot3..."
                  className="mt-2"
                  disabled={!canEdit}
                />
                <p className="text-xs text-muted-foreground mt-2">{t('componentUi.retellConfig.improveRecognition')}</p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ─── Section 4: Call Settings ─── */}
        <AccordionItem value="call-settings" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-6 hover:no-underline">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Phone className="h-5 w-5 text-blue-500" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold">{t('componentUi.retellConfig.callSettings')}</h3>
                <p className="text-sm text-muted-foreground">{t('componentUi.retellConfig.callSettingsDesc')}</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>{t('componentUi.retellConfig.endAfterSilence')} ({Math.round(endCallAfterSilenceMs / 1000)}s)</Label>
                  <Slider
                    value={[endCallAfterSilenceMs]}
                    onValueChange={([v]) => setEndCallAfterSilenceMs(v)}
                    min={5000}
                    max={120000}
                    step={1000}
                    className="mt-4"
                    disabled={!canEdit}
                  />
                  <p className="text-xs text-muted-foreground mt-2">{t('componentUi.retellConfig.silenceDuration')}</p>
                </div>
                <div>
                  <Label>{t('componentUi.retellConfig.maxCallDuration')} ({Math.round(maxCallDurationMs / 60000)} min)</Label>
                  <Slider
                    value={[maxCallDurationMs]}
                    onValueChange={([v]) => setMaxCallDurationMs(v)}
                    min={60000}
                    max={7200000}
                    step={60000}
                    className="mt-4"
                    disabled={!canEdit}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Label className="text-base">{t('componentUi.retellConfig.voicemailDetection')}</Label>
                  <p className="text-sm text-muted-foreground">{t('componentUi.retellConfig.voicemailDetectionDesc')}</p>
                </div>
                <Switch checked={enableVoicemailDetection} onCheckedChange={setEnableVoicemailDetection} disabled={!canEdit} />
              </div>

              <div>
                <Label>{t('componentUi.retellConfig.webhookUrl')}</Label>
                <Input
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://your-server.com/webhook"
                  className="mt-2"
                  disabled={!canEdit}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  {t('componentUi.retellConfig.webhookDesc')}
                </p>
              </div>

              {/* Phone Numbers Info */}
              {phoneNumbers && phoneNumbers.length > 0 && (
                <div>
                  <Label className="text-base font-medium">{t('componentUi.retellConfig.phoneNumbers')}</Label>
                  <div className="grid grid-cols-1 gap-2 mt-2">
                    {phoneNumbers.map((pn: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between p-3 rounded-lg border bg-muted/50">
                        <div>
                          <p className="font-mono text-sm">{pn.phone_number}</p>
                          {pn.phone_number_pretty && (
                            <p className="text-xs text-muted-foreground">{pn.phone_number_pretty}</p>
                          )}
                        </div>
                        {pn.agent_id && (
                          <Badge variant="outline" className="text-xs">
                            Agent: {pn.agent_id.substring(0, 8)}...
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ─── Section 5: Privacy & Security ─── */}
        <AccordionItem value="privacy" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-6 hover:no-underline">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <Shield className="h-5 w-5 text-red-500" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold">{t('componentUi.retellConfig.privacy')}</h3>
                <p className="text-sm text-muted-foreground">{t('componentUi.retellConfig.privacyDesc')}</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Label className="text-base">{t('componentUi.retellConfig.excludeSensitiveData')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('componentUi.retellConfig.excludeSensitiveDataDesc')}
                  </p>
                </div>
                <Switch checked={optOutSensitiveData} onCheckedChange={setOptOutSensitiveData} disabled={!canEdit} />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ─── Section 6: Info ─── */}
        <AccordionItem value="info" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-6 hover:no-underline">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <Settings2 className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold">{t('componentUi.retellConfig.info')}</h3>
                <p className="text-sm text-muted-foreground">{t('componentUi.retellConfig.infoDesc')}</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">{t('componentUi.retellConfig.agentId')}</p>
                <p className="font-mono text-sm truncate">{platformAgentId}</p>
              </div>
              {config?.agent?.agent_name && (
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">{t('componentUi.retellConfig.nameLabel')}</p>
                  <p className="font-medium">{config.agent.agent_name}</p>
                </div>
              )}
              {config?.llm?.llm_id && (
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">{t('componentUi.retellConfig.llmId')}</p>
                  <p className="font-mono text-sm truncate">{config.llm.llm_id}</p>
                </div>
              )}
              {config?.agent?.response_engine?.type && (
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">{t('componentUi.retellConfig.responseEngine')}</p>
                  <p className="font-medium">{config.agent.response_engine.type}</p>
                </div>
              )}
              {voiceId && (
                <div className="p-3 rounded-lg bg-muted/50 col-span-2">
                  <p className="text-xs text-muted-foreground">{t('componentUi.retellConfig.voiceIdLabel')}</p>
                  <p className="font-mono text-sm">{voiceId}</p>
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* ─── Global Save Button ─── */}
      {canEdit && (
        <div className="flex items-center gap-3 p-4 rounded-lg border bg-card sticky bottom-4">
          <Button onClick={handleSaveAgentSettings} disabled={isSaving} className="flex-1">
            {updateAgent.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Save className="h-4 w-4 mr-2" />
            {t('componentUi.retellConfig.saveAgentConfig')}
          </Button>
          {config?.llm && (
            <Button onClick={handleSaveLLMSettings} disabled={isSaving} variant="secondary" className="flex-1">
              {updateLLM.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Save className="h-4 w-4 mr-2" />
              {t('componentUi.retellConfig.saveLlm')}
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );
}
