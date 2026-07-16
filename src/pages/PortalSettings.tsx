import { useState, useEffect } from 'react';
import { usePortal } from '@/hooks/usePortalAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Settings, Volume2, Sparkles, Mic, Zap, Clock, MessageSquare, Save, Loader2, RefreshCw, Users, Plus, Edit, Trash2, Key, UserPlus, Shield, CheckCircle, XCircle, Eye, EyeOff, Globe, Brain, Settings2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { GlowBadge } from '@/components/portal/GlowBadge';
import { VoiceSelector } from '@/components/agents/VoiceSelector';
import { toast } from 'sonner';
import { RetellFullConfigTab } from '@/components/agents/RetellFullConfigTab';
import { VapiAPISections } from '@/components/vapi/VapiAPISections';
import { ElevenLabsAPISections } from '@/components/elevenlabs/ElevenLabsAPISections';
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
  TTS_MODELS,
} from '@/types/elevenlabs-full';
import type { TTSSettings, ASRSettings, TurnSettings, ConversationSettings, LLMSettings } from '@/types/elevenlabs-full';

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  login_id: string | null;
  status: string;
  created_at: string;
  last_login_at: string | null;
}

const PortalSettings = () => {
  const { session, hasEditAccess } = usePortal();
  const canEdit = hasEditAccess();
  const platform = session?.platform;
  const isElevenLabs = platform === 'elevenlabs' || (!platform || (platform !== 'retell' && platform !== 'vapi'));

  const agentId = session?.platformAgentId || session?.agentId;

  // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
  const { data: config, isLoading, refetch } = useElevenLabsFullAgentConfig({
    agentId: agentId || null,
    organizationId: session?.organizationId,
    enabled: !!agentId && !!session?.organizationId && canEdit && isElevenLabs,
  });

  const updateTTS = useUpdateTTSSettings();
  const updateASR = useUpdateASRSettings();
  const updateTurn = useUpdateTurnSettings();
  const updateConversation = useUpdateConversationSettings();
  const updateAdvanced = useUpdateAgentAdvancedSettings();
  const updatePrompt = useUpdatePrompt();
  const updateLLM = useUpdateLLMSettings();

  // Members state
  const [members, setMembers] = useState<Member[]>([]);
  const [isMembersLoading, setIsMembersLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addName, setAddName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addLoginId, setAddLoginId] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addRole, setAddRole] = useState('member');
  const [isAdding, setIsAdding] = useState(false);
  const [showAddPassword, setShowAddPassword] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetMemberId, setResetMemberId] = useState('');
  const [resetMemberName, setResetMemberName] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingMember, setDeletingMember] = useState<Member | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ElevenLabs settings state
  const [ttsSettings, setTtsSettings] = useState<TTSSettings>({
    voice_id: '',
    model_id: 'eleven_turbo_v2_5',
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0,
    speed: 1,
  });
  const [asrSettings, setAsrSettings] = useState<ASRSettings>({ quality: 'high', keywords: [] });
  const [turnSettings, setTurnSettings] = useState<TurnSettings>({ turn_timeout: 10, silence_end_call_timeout: 30, turn_eagerness: 'normal' });
  const [conversationSettings, setConversationSettings] = useState<ConversationSettings>({ max_duration_seconds: 600, client_events: ['transcript', 'audio'] });
  const [language, setLanguage] = useState('fr');
  const [disableFirstMessageInterruption, setDisableFirstMessageInterruption] = useState(false);
  const [llmSettings, setLlmSettings] = useState<LLMSettings>({ temperature: 0.7, max_tokens: 1000 });
  const [prompt, setPrompt] = useState('');
  const [firstMessage, setFirstMessage] = useState('');
  const [keywords, setKeywords] = useState('');

  // Fetch members
  useEffect(() => {
    if (session && canEdit) fetchMembers();
  }, [session, canEdit]);

  // Sync ElevenLabs config to local state
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

  const fetchMembers = async () => {
    if (!session) return;
    setIsMembersLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('client-auth', {
        body: { action: 'get-members', client_id: session.clientId }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setMembers(data?.members || []);
    } catch (error) {
      console.error('Error fetching members:', error);
    } finally {
      setIsMembersLoading(false);
    }
  };

  // Member handlers
  const handleAddMember = async () => {
    if (!session) return;
    setIsAdding(true);
    try {
      const { data, error } = await supabase.functions.invoke('client-auth', {
        body: { action: 'admin-add-member', client_id: session.clientId, name: addName, email: addEmail, login_id: addLoginId, password: addPassword, role: addRole }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Member added successfully');
      setShowAddModal(false);
      setAddName(''); setAddEmail(''); setAddLoginId(''); setAddPassword(''); setAddRole('member');
      fetchMembers();
    } catch (error: any) {
      toast.error(error.message || 'Error while adding');
    } finally {
      setIsAdding(false);
    }
  };

  const handleEditMember = async () => {
    if (!editingMember) return;
    setIsEditing(true);
    try {
      const { data, error } = await supabase.functions.invoke('client-auth', {
        body: { action: 'admin-update-member', member_id: editingMember.id, name: editName, email: editEmail, role: editRole, status: editStatus }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Member updated');
      setShowEditModal(false);
      setEditingMember(null);
      fetchMembers();
    } catch (error: any) {
      toast.error(error.message || 'Error while updating');
    } finally {
      setIsEditing(false);
    }
  };

  const handleResetPassword = async () => {
    setIsResetting(true);
    try {
      const { data, error } = await supabase.functions.invoke('client-auth', {
        body: { action: 'admin-reset-member-password', member_id: resetMemberId, new_password: resetPassword }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Password reset');
      setShowResetModal(false);
      setResetPassword('');
    } catch (error: any) {
      toast.error(error.message || 'Error while resetting');
    } finally {
      setIsResetting(false);
    }
  };

  const handleDeleteMember = async () => {
    if (!deletingMember) return;
    setIsDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('client-auth', {
        body: { action: 'admin-delete-member', member_id: deletingMember.id }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Member deleted');
      setShowDeleteDialog(false);
      setDeletingMember(null);
      fetchMembers();
    } catch (error: any) {
      toast.error(error.message || 'Error while deleting');
    } finally {
      setIsDeleting(false);
    }
  };

  const openEditModal = (member: Member) => {
    setEditingMember(member);
    setEditName(member.name);
    setEditEmail(member.email);
    setEditRole(member.role);
    setEditStatus(member.status);
    setShowEditModal(true);
  };

  const openResetModal = (member: Member) => {
    setResetMemberId(member.id);
    setResetMemberName(member.name);
    setResetPassword('');
    setShowResetModal(true);
  };

  // ElevenLabs save handlers
  const handleSaveTTS = () => { if (agentId) updateTTS.mutate({ agentId, ttsSettings }); };
  const handleSaveASR = () => {
    if (!agentId) return;
    const keywordsArray = keywords.split(',').map(k => k.trim()).filter(Boolean);
    updateASR.mutate({ agentId, asrSettings: { ...asrSettings, keywords: keywordsArray } });
  };
  const handleSaveTurn = () => { if (agentId) updateTurn.mutate({ agentId, turnSettings }); };
  const handleSavePrompt = () => { if (agentId) updatePrompt.mutate({ agentId, prompt, firstMessage }); };
  const handleSaveConversation = () => { if (agentId) updateConversation.mutate({ agentId, conversationSettings }); };
  const handleSaveAdvanced = () => { if (agentId) updateAdvanced.mutate({ agentId, agentAdvancedSettings: { language, disable_first_message_interruptions: disableFirstMessageInterruption } }); };
  const handleSaveLLM = () => { if (agentId) updateLLM.mutate({ agentId, llmSettings }); };

  // --- CONDITIONAL RETURNS BELOW (after all hooks) ---

  if (!canEdit) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-24">
        <div className="w-24 h-24 rounded-2xl bg-muted/20 flex items-center justify-center mb-6">
          <Settings className="h-12 w-12 text-muted-foreground/30" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Access denied</h2>
        <p className="text-muted-foreground">You do not have permission to access this page</p>
      </motion.div>
    );
  }

  // Retell platform
  if (platform === 'retell' && session?.organizationId) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <PortalPageHeader icon={Settings} title="Configuration" description={session?.agentName} gradient="pink-orange" />
        <RetellFullConfigTab
          agentId={session.agentId}
          platformAgentId={session.platformAgentId || null}
          organizationId={session.organizationId}
        />
      </motion.div>
    );
  }

  // Vapi platform
  if (platform === 'vapi' && session?.organizationId) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <PortalPageHeader icon={Settings} title="Configuration" description={session?.agentName} gradient="pink-orange" />
        <VapiAPISections
          organizationId={session.organizationId}
          assistantId={session.platformAgentId}
          canEdit={canEdit}
        />
      </motion.div>
    );
  }

  // ElevenLabs platform (default)
  const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.1 } } };
  const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

  if (isLoading) {
    return (
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
        <PortalPageHeader icon={Settings} title="Configuration" description={session?.agentName} gradient="pink-orange" />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      <div className="flex items-center justify-between">
        <PortalPageHeader icon={Settings} title="Configuration" description={session?.agentName} gradient="pink-orange" />
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Actualiser
        </Button>
      </div>

      <Accordion type="multiple" defaultValue={['prompt', 'voice']} className="space-y-4">
        {/* Prompt & First Message */}
        <AccordionItem value="prompt" className="border rounded-lg bg-card/50 backdrop-blur-sm border-border/30">
          <AccordionTrigger className="px-6 hover:no-underline">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-pink-500/10"><MessageSquare className="h-5 w-5 text-pink-500" /></div>
              <div className="text-left">
                <h3 className="font-semibold">Prompt & Premier Message</h3>
                <p className="text-sm text-muted-foreground">Instructions et message de bienvenue</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            <div className="space-y-6">
              <div>
                <Label>System Prompt</Label>
                <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={6} className="mt-2 font-mono text-sm" placeholder="You are an AI assistant..." />
              </div>
              <div>
                <Label>First Message</Label>
                <Textarea value={firstMessage} onChange={(e) => setFirstMessage(e.target.value)} rows={2} className="mt-2" placeholder="Hello, how can I help you?" />
              </div>
              <Button onClick={handleSavePrompt} disabled={updatePrompt.isPending} className="gap-2 bg-gradient-to-r from-pink-500 to-purple-500">
                {updatePrompt.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Prompt
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Voice & TTS */}
        <AccordionItem value="voice" className="border rounded-lg bg-card/50 backdrop-blur-sm border-border/30">
          <AccordionTrigger className="px-6 hover:no-underline">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Volume2 className="h-5 w-5 text-primary" /></div>
              <div className="text-left">
                <h3 className="font-semibold">Voice & TTS</h3>
                <p className="text-sm text-muted-foreground">Speech synthesis and characteristics</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            <div className="space-y-6">
              <div>
                <Label className="text-base font-medium mb-4 block">Select a voice</Label>
                <VoiceSelector selectedVoiceId={ttsSettings.voice_id} onSelect={(voice) => setTtsSettings(prev => ({ ...prev, voice_id: voice.voice_id }))} organizationId={session?.organizationId} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>TTS Model</Label>
                  <Select value={ttsSettings.model_id || 'eleven_turbo_v2_5'} onValueChange={(v) => setTtsSettings(prev => ({ ...prev, model_id: v }))}>
                    <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                    <SelectContent>{TTS_MODELS.map(model => (<SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Speed ({ttsSettings.speed?.toFixed(1)}x)</Label>
                  <Slider value={[ttsSettings.speed || 1]} onValueChange={([v]) => setTtsSettings(prev => ({ ...prev, speed: v }))} min={0.5} max={2} step={0.1} className="mt-4" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <Label>Stability ({Math.round((ttsSettings.stability || 0.5) * 100)}%)</Label>
                  <Slider value={[ttsSettings.stability || 0.5]} onValueChange={([v]) => setTtsSettings(prev => ({ ...prev, stability: v }))} min={0} max={1} step={0.01} className="mt-4" />
                </div>
                <div>
                  <Label>Similarity ({Math.round((ttsSettings.similarity_boost || 0.75) * 100)}%)</Label>
                  <Slider value={[ttsSettings.similarity_boost || 0.75]} onValueChange={([v]) => setTtsSettings(prev => ({ ...prev, similarity_boost: v }))} min={0} max={1} step={0.01} className="mt-4" />
                </div>
                <div>
                  <Label>Style ({Math.round((ttsSettings.style || 0) * 100)}%)</Label>
                  <Slider value={[ttsSettings.style || 0]} onValueChange={([v]) => setTtsSettings(prev => ({ ...prev, style: v }))} min={0} max={1} step={0.01} className="mt-4" />
                </div>
              </div>
              <Button onClick={handleSaveTTS} disabled={updateTTS.isPending} className="gap-2 bg-gradient-to-r from-primary to-purple-500">
                {updateTTS.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Voice
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ASR */}
        <AccordionItem value="asr" className="border rounded-lg bg-card/50 backdrop-blur-sm border-border/30">
          <AccordionTrigger className="px-6 hover:no-underline">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10"><Mic className="h-5 w-5 text-purple-500" /></div>
              <div className="text-left">
                <h3 className="font-semibold">Speech Recognition (ASR)</h3>
                <p className="text-sm text-muted-foreground">Transcription settings</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            <div className="space-y-6">
              <div>
                <Label>Quality</Label>
                <Select value={asrSettings.quality || 'high'} onValueChange={(v: any) => setAsrSettings(prev => ({ ...prev, quality: v }))}>
                  <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High (recommended)</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Custom keywords</Label>
                <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="mot1, mot2, mot3..." className="mt-2" />
                <p className="text-xs text-muted-foreground mt-2">Separate keywords with commas.</p>
              </div>
              <Button onClick={handleSaveASR} disabled={updateASR.isPending} className="gap-2">
                {updateASR.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save ASR
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Turn Settings */}
        <AccordionItem value="turn" className="border rounded-lg bg-card/50 backdrop-blur-sm border-border/30">
          <AccordionTrigger className="px-6 hover:no-underline">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/10"><Clock className="h-5 w-5 text-orange-500" /></div>
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
                    <Card key={option.value} className={`p-4 cursor-pointer transition-all ${turnSettings.turn_eagerness === option.value ? 'border-primary bg-primary/5' : 'hover:border-primary/50'}`} onClick={() => setTurnSettings(prev => ({ ...prev, turn_eagerness: option.value as any }))}>
                      <h4 className="font-medium">{option.label}</h4>
                      <p className="text-xs text-muted-foreground mt-1">{option.description}</p>
                    </Card>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>Turn timeout ({turnSettings.turn_timeout}s)</Label>
                  <Slider value={[turnSettings.turn_timeout || 10]} onValueChange={([v]) => setTurnSettings(prev => ({ ...prev, turn_timeout: v }))} min={5} max={30} step={1} className="mt-4" />
                </div>
                <div>
                  <Label>End call on silence ({turnSettings.silence_end_call_timeout}s)</Label>
                  <Slider value={[turnSettings.silence_end_call_timeout || 30]} onValueChange={([v]) => setTurnSettings(prev => ({ ...prev, silence_end_call_timeout: v }))} min={10} max={120} step={5} className="mt-4" />
                </div>
              </div>
              <Button onClick={handleSaveTurn} disabled={updateTurn.isPending} className="gap-2">
                {updateTurn.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Turns
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Conversation Settings */}
        <AccordionItem value="conversation" className="border rounded-lg bg-card/50 backdrop-blur-sm border-border/30">
          <AccordionTrigger className="px-6 hover:no-underline">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10"><Settings2 className="h-5 w-5 text-green-500" /></div>
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
                <Slider value={[conversationSettings.max_duration_seconds || 600]} onValueChange={([v]) => setConversationSettings(prev => ({ ...prev, max_duration_seconds: v }))} min={60} max={3600} step={60} className="mt-4" />
              </div>
              <div>
                <Label className="mb-3 block">Client Events</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {ELEVENLABS_CLIENT_EVENTS.map(event => (
                    <div key={event.id} className="flex items-start gap-3 p-3 rounded-lg border">
                      <Checkbox
                        checked={conversationSettings.client_events?.includes(event.id)}
                        onCheckedChange={(checked) => {
                          setConversationSettings(prev => ({
                            ...prev,
                            client_events: checked
                              ? [...(prev.client_events || []), event.id]
                              : (prev.client_events || []).filter(e => e !== event.id),
                          }));
                        }}
                      />
                      <div>
                        <p className="text-sm font-medium">{event.name}</p>
                        <p className="text-xs text-muted-foreground">{event.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <Button onClick={handleSaveConversation} disabled={updateConversation.isPending} className="gap-2">
                {updateConversation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Conversation
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* LLM Settings */}
        <AccordionItem value="llm" className="border rounded-lg bg-card/50 backdrop-blur-sm border-border/30">
          <AccordionTrigger className="px-6 hover:no-underline">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/10"><Brain className="h-5 w-5 text-cyan-500" /></div>
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
                  <Slider value={[llmSettings.temperature || 0.7]} onValueChange={([v]) => setLlmSettings(prev => ({ ...prev, temperature: v }))} min={0} max={2} step={0.1} className="mt-4" />
                  <p className="text-xs text-muted-foreground mt-2">Lower = more predictable, higher = more creative</p>
                </div>
                <div>
                  <Label>Max Tokens</Label>
                  <Input type="number" value={llmSettings.max_tokens || 1000} onChange={(e) => setLlmSettings(prev => ({ ...prev, max_tokens: parseInt(e.target.value) || 1000 }))} className="mt-2" min={100} max={32000} />
                  <p className="text-xs text-muted-foreground mt-2">Maximum tokens per response</p>
                </div>
              </div>
              <Button onClick={handleSaveLLM} disabled={updateLLM.isPending} className="gap-2">
                {updateLLM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save LLM
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Language & Advanced */}
        <AccordionItem value="advanced" className="border rounded-lg bg-card/50 backdrop-blur-sm border-border/30">
          <AccordionTrigger className="px-6 hover:no-underline">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10"><Globe className="h-5 w-5 text-amber-500" /></div>
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
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent>{ELEVENLABS_LANGUAGES.map(lang => (<SelectItem key={lang.code} value={lang.code}>{lang.name}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg border">
                <div>
                  <p className="font-medium text-sm">Disable first message interruption</p>
                  <p className="text-xs text-muted-foreground mt-1">The user will not be able to interrupt the welcome message</p>
                </div>
                <Switch checked={disableFirstMessageInterruption} onCheckedChange={setDisableFirstMessageInterruption} />
              </div>
              <Button onClick={handleSaveAdvanced} disabled={updateAdvanced.isPending} className="gap-2">
                {updateAdvanced.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Advanced
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Members */}
        <AccordionItem value="members" className="border rounded-lg bg-card/50 backdrop-blur-sm border-border/30">
          <AccordionTrigger className="px-6 hover:no-underline">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Users className="h-5 w-5 text-primary" /></div>
              <div className="text-left">
                <h3 className="font-semibold">Members ({members.length})</h3>
                <p className="text-sm text-muted-foreground">Manage portal access</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button onClick={() => setShowAddModal(true)} className="gap-2"><UserPlus className="h-4 w-4" />Add member</Button>
              </div>
              {isMembersLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
              ) : members.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">No members added</p>
                  <Button variant="outline" className="mt-4 gap-2" onClick={() => setShowAddModal(true)}><Plus className="h-4 w-4" />Add first member</Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Login ID</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last login</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">{member.name}</TableCell>
                        <TableCell>{member.email}</TableCell>
                        <TableCell><code className="text-xs bg-muted px-2 py-1 rounded">{member.login_id || '-'}</code></TableCell>
                        <TableCell><GlowBadge variant={member.role === 'admin' ? 'warning' : 'secondary'}>{member.role === 'admin' ? 'Admin' : 'Member'}</GlowBadge></TableCell>
                        <TableCell>
                          {member.status === 'active' ? <span className="flex items-center gap-1 text-green-500"><CheckCircle className="h-4 w-4" />Active</span> : <span className="flex items-center gap-1 text-red-500"><XCircle className="h-4 w-4" />Inactive</span>}
                        </TableCell>
                        <TableCell>{member.last_login_at ? new Date(member.last_login_at).toLocaleDateString('en-US') : 'Never'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => openEditModal(member)}><Edit className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => openResetModal(member)}><Key className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => { setDeletingMember(member); setShowDeleteDialog(true); }}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* ElevenLabs Extended API */}
      {session?.organizationId && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold mb-4">Extended ElevenLabs API</h2>
          <ElevenLabsAPISections organizationId={session.organizationId} canEdit={canEdit} voiceId={ttsSettings.voice_id} />
        </div>
      )}

      {/* Tips */}
      <motion.div variants={itemVariants}>
        <Card className="bg-gradient-to-br from-primary/5 via-purple-500/5 to-pink-500/5 border-border/30">
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center shrink-0">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2">AI Tip<Zap className="h-3 w-3 text-yellow-400" /></h3>
                <p className="text-sm text-muted-foreground">
                  For best results, keep stability between 0.3 and 0.7. Use keywords to improve recognition of specific terms.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Modals */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add member</DialogTitle>
            <DialogDescription>Create a new member account to access the portal</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Name *</Label><Input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="John Smith" /></div>
            <div className="space-y-2"><Label>Email *</Label><Input type="email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} placeholder="john@example.com" /></div>
            <div className="space-y-2"><Label>Login ID *</Label><Input value={addLoginId} onChange={(e) => setAddLoginId(e.target.value)} placeholder="john.smith" /></div>
            <div className="space-y-2">
              <Label>Password * (min. 8 characters)</Label>
              <div className="relative">
                <Input type={showAddPassword ? 'text' : 'password'} value={addPassword} onChange={(e) => setAddPassword(e.target.value)} placeholder="••••••••" />
                <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3" onClick={() => setShowAddPassword(!showAddPassword)}>
                  {showAddPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={addRole} onValueChange={setAddRole}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="member">Member (read only)</SelectItem><SelectItem value="admin">Admin (full management)</SelectItem></SelectContent></Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button onClick={handleAddMember} disabled={isAdding || !addName || !addEmail || !addLoginId || addPassword.length < 8}>
              {isAdding && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit member</DialogTitle><DialogDescription>Edit information for {editingMember?.name}</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Name</Label><Input value={editName} onChange={(e) => setEditName(e.target.value)} /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} /></div>
            <div className="space-y-2"><Label>Role</Label><Select value={editRole} onValueChange={setEditRole}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="member">Member</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>Status</Label><Select value={editStatus} onValueChange={setEditStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>Cancel</Button>
            <Button onClick={handleEditMember} disabled={isEditing}>{isEditing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showResetModal} onOpenChange={setShowResetModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reset password</DialogTitle><DialogDescription>New password for {resetMemberName}</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>New password (min. 8 characters)</Label>
              <div className="relative">
                <Input type={showResetPassword ? 'text' : 'password'} value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} placeholder="••••••••" />
                <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3" onClick={() => setShowResetPassword(!showResetPassword)}>
                  {showResetPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetModal(false)}>Cancel</Button>
            <Button onClick={handleResetPassword} disabled={isResetting || resetPassword.length < 8}>{isResetting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Reset</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete member?</AlertDialogTitle><AlertDialogDescription>Are you sure you want to delete {deletingMember?.name}? This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteMember} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
};

export default PortalSettings;
