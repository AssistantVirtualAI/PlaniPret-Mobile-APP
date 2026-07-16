import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { useCreatePlatformAgent, VoiceSettings, TurnSettings, ConversationSettings, LLMSettings, ASRSettings } from '@/hooks/useCreatePlatformAgent';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { PlatformVoiceSelector } from './PlatformVoiceSelector';
import { PromptEditor } from './PromptEditor';
import { AGENT_TEMPLATES, AgentTemplate } from '@/components/agent-builder/AgentTemplates';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/useTranslation';
import { useAllowedPlatforms } from '@/hooks/useAllowedPlatforms';
import {
  ChevronLeft,
  ChevronRight,
  Zap,
  Bot,
  Phone,
  MessageSquare,
  Sparkles,
  Volume2,
  Settings,
  Check,
  Loader2,
  AlertCircle,
  FileText,
  Clock,
  Mic,
  Brain,
} from 'lucide-react';

type Platform = 'elevenlabs' | 'vapi' | 'retell';

interface WizardStep {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const WIZARD_STEPS: WizardStep[] = [
  { id: 'platform', title: 'Platform', description: 'Choose your AI platform', icon: Zap },
  { id: 'template', title: 'Template', description: 'Start from a template or scratch', icon: FileText },
  { id: 'prompt', title: 'Prompt', description: 'Configure agent personality', icon: MessageSquare },
  { id: 'voice', title: 'Voice', description: 'Select and configure voice', icon: Volume2 },
  { id: 'settings', title: 'Settings', description: 'Advanced configuration', icon: Settings },
  { id: 'review', title: 'Review', description: 'Review and create', icon: Check },
];

const PLATFORMS = [
  {
    id: 'elevenlabs' as Platform,
    name: 'ElevenLabs',
    description: 'High-quality conversational AI with natural voices',
    icon: Zap,
    color: 'from-primary to-secondary',
    features: ['Natural voices', 'Low latency', 'Multi-language'],
  },
  {
    id: 'vapi' as Platform,
    name: 'Vapi',
    description: 'Voice AI platform with advanced call handling',
    icon: Phone,
    color: 'from-secondary to-accent',
    features: ['Call routing', 'Function calling', 'Custom voices'],
  },
  {
    id: 'retell' as Platform,
    name: 'Retell AI',
    description: 'Enterprise-grade voice agents',
    icon: Bot,
    color: 'from-accent to-primary',
    features: ['Enterprise ready', 'Analytics', 'Custom LLM'],
  },
];

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
  { code: 'pt', name: 'Português' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'zh', name: '中文' },
];

interface CreateAgentWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateAgentWizard({ open, onOpenChange }: CreateAgentWizardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { selectedOrgId } = useOrganization();
  const { createAgent, isCreating, progress } = useCreatePlatformAgent();
  const { isAllowed } = useAllowedPlatforms();
  const visiblePlatforms = PLATFORMS.filter((p) => isAllowed(p.id));

  // Wizard state
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null);
  const [agentName, setAgentName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [firstMessage, setFirstMessage] = useState('');
  const [language, setLanguage] = useState('en');
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>({
    voice_id: '',
    model_id: 'eleven_turbo_v2_5',
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0,
    speed: 1,
  });
  const [turnSettings, setTurnSettings] = useState<TurnSettings>({
    turn_timeout: 10,
    silence_end_call_timeout: 30,
    turn_eagerness: 'normal',
  });
  const [conversationSettings, setConversationSettings] = useState<ConversationSettings>({
    max_duration_seconds: 600,
  });
  const [llmSettings, setLlmSettings] = useState<LLMSettings>({
    model: 'gpt-4o-mini',
    temperature: 0.7,
    max_tokens: 1000,
  });
  const [asrSettings, setAsrSettings] = useState<ASRSettings>({
    provider: 'elevenlabs',
    quality: 'high',
  });
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  // Check if platform integration exists
  const { data: integrations } = useQuery({
    queryKey: ['platform-integrations', selectedOrgId],
    queryFn: async () => {
      if (!selectedOrgId) return [];
      const { data, error } = await supabase
        .from('organization_integrations')
        .select('platform, is_active')
        .eq('organization_id', selectedOrgId)
        .eq('is_active', true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedOrgId,
  });

  // Fetch clients for assignment
  const { data: clients } = useQuery({
    queryKey: ['clients-for-agent', selectedOrgId],
    queryFn: async () => {
      if (!selectedOrgId) return [];
      const { data, error } = await supabase
        .from('clients')
        .select('id, name')
        .eq('organization_id', selectedOrgId)
        .eq('status', 'active')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedOrgId,
  });

  const hasIntegration = (platform: Platform) => {
    return integrations?.some((i) => i.platform === platform && i.is_active);
  };

  const handleTemplateSelect = (template: AgentTemplate | null) => {
    setSelectedTemplate(template);
    if (template) {
      setSystemPrompt(template.systemPrompt);
      setFirstMessage(template.firstMessage);
      setAgentName(template.name);
      if (template.voiceSettings) {
        setVoiceSettings({
          voice_id: template.voiceSettings.voice_id || '',
          model_id: template.voiceSettings.model_id || 'eleven_turbo_v2_5',
          stability: template.voiceSettings.stability ?? 0.5,
          similarity_boost: template.voiceSettings.similarity_boost ?? 0.75,
          style: template.voiceSettings.style ?? 0,
          speed: template.voiceSettings.speed ?? 1,
        });
      }
      if (template.turnSettings) {
        setTurnSettings({
          turn_timeout: template.turnSettings.turn_timeout || 10,
          silence_end_call_timeout: 30,
          turn_eagerness: template.turnSettings.turn_eagerness || 'normal',
        });
      }
    }
  };

  const canProceed = useMemo(() => {
    switch (currentStep) {
      case 0: return selectedPlatform && hasIntegration(selectedPlatform);
      case 1: return true; // Template is optional
      case 2: return systemPrompt.trim().length > 10;
      case 3: return voiceSettings.voice_id;
      case 4: return true; // Settings have defaults
      case 5: return agentName.trim().length > 0;
      default: return false;
    }
  }, [currentStep, selectedPlatform, systemPrompt, voiceSettings, agentName]);

  const handleNext = () => {
    if (currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleCreate = async () => {
    if (!selectedPlatform || !selectedOrgId) return;

    try {
      const result = await createAgent({
        platform: selectedPlatform,
        name: agentName,
        systemPrompt,
        firstMessage,
        voiceSettings,
        language,
        turnSettings,
        conversationSettings,
        llmSettings,
        asrSettings,
        clientId: selectedClientId || undefined,
      });

      onOpenChange(false);
      navigate(`/agent-settings/${result.agentId}`);
    } catch (error) {
      // Error handled by hook
    }
  };

  const resetWizard = () => {
    setCurrentStep(0);
    setSelectedPlatform(null);
    setSelectedTemplate(null);
    setAgentName('');
    setSystemPrompt('');
    setFirstMessage('');
    setLanguage('en');
    setVoiceSettings({
      voice_id: '',
      model_id: 'eleven_turbo_v2_5',
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0,
      speed: 1,
    });
    setSelectedClientId(null);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetWizard();
    }
    onOpenChange(newOpen);
  };

  const renderStepContent = () => {
    switch (currentStep) {
      // Step 0: Platform Selection
      case 0:
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h3 className="text-xl font-semibold">Choose Your Platform</h3>
              <p className="text-muted-foreground">
                Select the AI platform where your agent will be created
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {visiblePlatforms.map((platform) => {
                const hasInt = hasIntegration(platform.id);
                return (
                  <Card
                    key={platform.id}
                    className={cn(
                      'cursor-pointer transition-all relative overflow-hidden',
                      selectedPlatform === platform.id && 'ring-2 ring-primary',
                      !hasInt && 'opacity-60'
                    )}
                    onClick={() => hasInt && setSelectedPlatform(platform.id)}
                  >
                    <div className={cn('absolute inset-0 opacity-10 bg-gradient-to-br', platform.color)} />
                    <CardHeader className="relative">
                      <div className="flex items-center justify-between">
                        <div className={cn('p-2 rounded-lg bg-gradient-to-br', platform.color)}>
                          <platform.icon className="h-6 w-6 text-primary-foreground" />
                        </div>
                        {selectedPlatform === platform.id && (
                          <Check className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <CardTitle className="mt-4">{platform.name}</CardTitle>
                      <CardDescription>{platform.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="relative space-y-3">
                      <div className="flex flex-wrap gap-1">
                        {platform.features.map((f) => (
                          <Badge key={f} variant="secondary" className="text-xs">
                            {f}
                          </Badge>
                        ))}
                      </div>
                      {!hasInt && (
                        <div className="flex items-center gap-2 text-sm text-warning">
                          <AlertCircle className="h-4 w-4" />
                          <span>Integration required</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            {selectedPlatform && !hasIntegration(selectedPlatform) && (
              <div className="text-center">
                <Button variant="outline" onClick={() => navigate('/integrations')}>
                  Configure Integration
                </Button>
              </div>
            )}
          </div>
        );

      // Step 1: Template Selection
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h3 className="text-xl font-semibold">Choose a Template</h3>
              <p className="text-muted-foreground">
                Start with a pre-configured template or create from scratch
              </p>
            </div>
            <ScrollArea className="h-[400px] pr-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Blank template */}
                <Card
                  className={cn(
                    'cursor-pointer transition-all border-dashed',
                    !selectedTemplate && 'ring-2 ring-primary'
                  )}
                  onClick={() => handleTemplateSelect(null)}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="p-2 rounded-lg bg-muted">
                        <Sparkles className="h-6 w-6 text-muted-foreground" />
                      </div>
                      {!selectedTemplate && <Check className="h-5 w-5 text-primary" />}
                    </div>
                    <CardTitle className="mt-4">Start from Scratch</CardTitle>
                    <CardDescription>
                      Create a fully customized agent
                    </CardDescription>
                  </CardHeader>
                </Card>

                {/* Pre-built templates */}
                {AGENT_TEMPLATES.map((template) => (
                  <Card
                    key={template.id}
                    className={cn(
                      'cursor-pointer transition-all',
                      selectedTemplate?.id === template.id && 'ring-2 ring-primary'
                    )}
                    onClick={() => handleTemplateSelect(template)}
                  >
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className={cn('p-2 rounded-lg', template.color)}>
                          <span className="text-xl">{template.icon}</span>
                        </div>
                        {selectedTemplate?.id === template.id && (
                          <Check className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <CardTitle className="mt-4">{template.name}</CardTitle>
                      <CardDescription className="line-clamp-2">
                        {template.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-1">
                        {template.tags?.slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </div>
        );

      // Step 2: Prompt Configuration
      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h3 className="text-xl font-semibold">Configure Your Agent</h3>
              <p className="text-muted-foreground">
                Define the personality and behavior of your agent
              </p>
            </div>
            <PromptEditor
              systemPrompt={systemPrompt}
              firstMessage={firstMessage}
              onSystemPromptChange={setSystemPrompt}
              onFirstMessageChange={setFirstMessage}
              language={language}
              platform={selectedPlatform || 'elevenlabs'}
              organizationId={selectedOrgId || undefined}
              voiceSettings={voiceSettings}
              turnSettings={turnSettings}
              onVoiceSettingsChange={(settings) => setVoiceSettings({ ...voiceSettings, ...settings })}
              onTurnSettingsChange={(settings) => setTurnSettings({ ...turnSettings, ...settings })}
            />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((lang) => (
                      <SelectItem key={lang.code} value={lang.code}>
                        {lang.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        );

      // Step 3: Voice Selection
      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h3 className="text-xl font-semibold">Select Voice</h3>
              <p className="text-muted-foreground">
                Choose and configure the voice for your agent
              </p>
            </div>
            {selectedPlatform && selectedOrgId && (
              <PlatformVoiceSelector
                platform={selectedPlatform}
                organizationId={selectedOrgId}
                selectedVoiceSettings={voiceSettings}
                onSelect={setVoiceSettings}
              />
            )}
          </div>
        );

      // Step 4: Advanced Settings
      case 4:
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h3 className="text-xl font-semibold">Advanced Settings</h3>
              <p className="text-muted-foreground">
                Fine-tune your agent's behavior
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Turn Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Turn Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label>Turn Timeout</Label>
                      <span className="text-sm text-muted-foreground">{turnSettings.turn_timeout}s</span>
                    </div>
                    <Slider
                      value={[turnSettings.turn_timeout || 10]}
                      onValueChange={([v]) => setTurnSettings({ ...turnSettings, turn_timeout: v })}
                      min={5}
                      max={30}
                      step={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label>Silence Timeout</Label>
                      <span className="text-sm text-muted-foreground">{turnSettings.silence_end_call_timeout}s</span>
                    </div>
                    <Slider
                      value={[turnSettings.silence_end_call_timeout || 30]}
                      onValueChange={([v]) => setTurnSettings({ ...turnSettings, silence_end_call_timeout: v })}
                      min={10}
                      max={120}
                      step={5}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Response Speed</Label>
                    <Select
                      value={turnSettings.turn_eagerness || 'normal'}
                      onValueChange={(v) => setTurnSettings({ ...turnSettings, turn_eagerness: v as 'eager' | 'normal' | 'relaxed' })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="eager">Fast (may interrupt)</SelectItem>
                        <SelectItem value="normal">Balanced</SelectItem>
                        <SelectItem value="relaxed">Patient (waits)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* LLM Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Brain className="h-4 w-4" />
                    LLM Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Model</Label>
                    <Select
                      value={llmSettings.model || 'gpt-4o-mini'}
                      onValueChange={(v) => setLlmSettings({ ...llmSettings, model: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gpt-4o">GPT-4o (Highest quality)</SelectItem>
                        <SelectItem value="gpt-4o-mini">GPT-4o Mini (Balanced)</SelectItem>
                        <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                        <SelectItem value="claude-3-5-sonnet">Claude 3.5 Sonnet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label>Temperature</Label>
                      <span className="text-sm text-muted-foreground">{llmSettings.temperature}</span>
                    </div>
                    <Slider
                      value={[(llmSettings.temperature || 0.7) * 100]}
                      onValueChange={([v]) => setLlmSettings({ ...llmSettings, temperature: v / 100 })}
                      max={100}
                      step={5}
                    />
                    <p className="text-xs text-muted-foreground">
                      Higher = more creative, Lower = more focused
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label>Max Tokens</Label>
                      <span className="text-sm text-muted-foreground">{llmSettings.max_tokens}</span>
                    </div>
                    <Slider
                      value={[llmSettings.max_tokens || 1000]}
                      onValueChange={([v]) => setLlmSettings({ ...llmSettings, max_tokens: v })}
                      min={100}
                      max={4000}
                      step={100}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* ASR Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Mic className="h-4 w-4" />
                    Speech Recognition
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Provider</Label>
                    <Select
                      value={asrSettings.provider || 'elevenlabs'}
                      onValueChange={(v) => setAsrSettings({ ...asrSettings, provider: v as 'elevenlabs' | 'deepgram' | 'google' })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
                        <SelectItem value="deepgram">Deepgram</SelectItem>
                        <SelectItem value="google">Google</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Quality</Label>
                    <Select
                      value={asrSettings.quality || 'high'}
                      onValueChange={(v) => setAsrSettings({ ...asrSettings, quality: v as 'high' | 'standard' })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high">High Quality</SelectItem>
                        <SelectItem value="standard">Standard</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Conversation Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Conversation
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label>Max Duration</Label>
                      <span className="text-sm text-muted-foreground">{Math.floor((conversationSettings.max_duration_seconds || 600) / 60)} min</span>
                    </div>
                    <Slider
                      value={[conversationSettings.max_duration_seconds || 600]}
                      onValueChange={([v]) => setConversationSettings({ ...conversationSettings, max_duration_seconds: v })}
                      min={60}
                      max={3600}
                      step={60}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        );

      // Step 5: Review
      case 5:
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h3 className="text-xl font-semibold">Review & Create</h3>
              <p className="text-muted-foreground">
                Review your configuration and create the agent
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Agent Name */}
              <Card className="md:col-span-2">
                <CardContent className="p-4">
                  <Label className="text-base font-medium">Agent Name</Label>
                  <Input
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    placeholder="My Voice Agent"
                    className="mt-2"
                  />
                </CardContent>
              </Card>

              {/* Client Assignment */}
              {clients && clients.length > 0 && (
                <Card className="md:col-span-2">
                  <CardContent className="p-4">
                    <Label className="text-base font-medium">Assign to Client (Optional)</Label>
                    <Select
                      value={selectedClientId || ''}
                      onValueChange={(v) => setSelectedClientId(v || null)}
                    >
                      <SelectTrigger className="mt-2">
                        <SelectValue placeholder="No client assigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">No client assigned</SelectItem>
                        {clients.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>
              )}

              {/* Summary Cards */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Platform</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    {PLATFORMS.find((p) => p.id === selectedPlatform)?.icon && (
                      <Zap className="h-4 w-4 text-primary" />
                    )}
                    <span className="font-medium">
                      {PLATFORMS.find((p) => p.id === selectedPlatform)?.name}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Template</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="font-medium">
                    {selectedTemplate?.name || 'Custom'}
                  </span>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Language</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="font-medium">
                    {LANGUAGES.find((l) => l.code === language)?.name}
                  </span>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Voice</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="font-medium">
                    {voiceSettings.voice_id ? 'Selected' : 'Not selected'}
                  </span>
                </CardContent>
              </Card>

              {/* Prompt Preview */}
              <Card className="md:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">System Prompt</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {systemPrompt || 'No prompt configured'}
                  </p>
                </CardContent>
              </Card>

              <Card className="md:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">First Message</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {firstMessage || 'No first message configured'}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] overflow-hidden flex flex-col p-0">
        {/* Progress Header */}
        <div className="shrink-0 p-6 border-b">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Create New Agent</h2>
            <Badge variant="secondary">
              Step {currentStep + 1} of {WIZARD_STEPS.length}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {WIZARD_STEPS.map((step, idx) => (
              <div key={step.id} className="flex items-center flex-1">
                <div
                  className={cn(
                    'flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all',
                    idx < currentStep && 'bg-primary border-primary text-primary-foreground',
                    idx === currentStep && 'border-primary text-primary',
                    idx > currentStep && 'border-muted text-muted-foreground'
                  )}
                >
                  {idx < currentStep ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <step.icon className="h-4 w-4" />
                  )}
                </div>
                {idx < WIZARD_STEPS.length - 1 && (
                  <div
                    className={cn(
                      'flex-1 h-0.5 mx-2',
                      idx < currentStep ? 'bg-primary' : 'bg-muted'
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content - Scrollable area */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.15 }}
                >
                  {renderStepContent()}
                </motion.div>
              </AnimatePresence>
            </div>
          </ScrollArea>
        </div>

        {/* Footer */}
        <div className="p-6 border-t flex items-center justify-between">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentStep === 0 || isCreating}
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Previous
          </Button>

          {isCreating && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {progress}
            </div>
          )}

          {currentStep < WIZARD_STEPS.length - 1 ? (
            <Button onClick={handleNext} disabled={!canProceed}>
              Next
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleCreate}
              disabled={!canProceed || isCreating}
              className="bg-gradient-to-r from-primary to-secondary"
            >
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Create Agent
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
