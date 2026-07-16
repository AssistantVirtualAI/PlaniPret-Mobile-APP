import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Webhook, 
  Plus, 
  Trash2, 
  Copy, 
  Check, 
  Loader2,
  AlertCircle,
  CheckCircle,
  ExternalLink,
  RefreshCw,
  Settings,
  Edit,
  Download,
  Upload,
  Cloud
} from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/context/LanguageContext';
import { useAllAgents } from '@/hooks/useAllAgents';
import { useAgentPlatformWebhooks, PLATFORM_WEBHOOK_EVENTS, PlatformWebhookInput, PlatformWebhook } from '@/hooks/useAgentPlatformWebhooks';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface WebhookManagerProps {
  defaultAgentId?: string;
}

interface PlatformWebhookConfig {
  url?: string;
  secret?: string;
  events?: string[];
  enabled?: boolean;
  webhooks?: Array<Record<string, any>>; // platform list (e.g. ElevenLabs workspace webhooks)
  // ElevenLabs specific
  webhook_url?: string;
  webhook_events?: string[];
  // Vapi specific
  serverUrl?: string;
  serverUrlSecret?: string;
  // Retell specific
  webhook_url_path?: string;
}

export const WebhookManager = ({ defaultAgentId }: WebhookManagerProps) => {
  const { language } = useLanguage();
  const { data: agentsData, isLoading: loadingAgents } = useAllAgents();
  const [selectedAgentId, setSelectedAgentId] = useState<string>(defaultAgentId || '');
  const { webhooks, isLoading, addWebhook, updateWebhook, deleteWebhook, toggleWebhook, generateWebhookUrl, refetch } = useAgentPlatformWebhooks(selectedAgentId);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showEditPlatformModal, setShowEditPlatformModal] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<PlatformWebhook | null>(null);
  const [editingPlatformWebhook, setEditingPlatformWebhook] = useState<Record<string, any> | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [fetchingPlatformWebhooks, setFetchingPlatformWebhooks] = useState(false);
  const [syncingWebhook, setSyncingWebhook] = useState(false);
  const [deletingPlatformWebhook, setDeletingPlatformWebhook] = useState<string | null>(null);
  const [updatingPlatformWebhook, setUpdatingPlatformWebhook] = useState(false);
  const [platformWebhooks, setPlatformWebhooks] = useState<PlatformWebhookConfig | null>(null);
  const [activeTab, setActiveTab] = useState<'local' | 'platform'>('local');
  const [platformEditForm, setPlatformEditForm] = useState({ name: '', is_disabled: false });
  
  const [formData, setFormData] = useState<PlatformWebhookInput>({
    platform: 'elevenlabs',
    webhook_url: '',
    webhook_secret: '',
    events: [],
  });

  const selectedAgent = agentsData?.agents.find(a => a.id === selectedAgentId);
  const availableEvents = PLATFORM_WEBHOOK_EVENTS[formData.platform] || [];

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success(language === 'fr' ? 'Copié' : 'Copied');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleAddWebhook = async () => {
    await addWebhook.mutateAsync(formData);
    setShowAddModal(false);
    resetForm();
  };

  const handleEditWebhook = async () => {
    if (!editingWebhook) return;
    await updateWebhook.mutateAsync({
      id: editingWebhook.id,
      webhook_url: formData.webhook_url,
      webhook_secret: formData.webhook_secret,
      events: formData.events,
      platform: formData.platform,
    });
    setShowEditModal(false);
    setEditingWebhook(null);
    resetForm();
  };

  const openEditModal = (webhook: PlatformWebhook) => {
    setEditingWebhook(webhook);
    setFormData({
      platform: webhook.platform,
      webhook_url: webhook.webhook_url,
      webhook_secret: webhook.webhook_secret || '',
      events: webhook.events,
    });
    setShowEditModal(true);
  };

  const resetForm = () => {
    setFormData({
      platform: selectedAgent?.platform as 'elevenlabs' | 'vapi' | 'retell' || 'elevenlabs',
      webhook_url: '',
      webhook_secret: '',
      events: [],
    });
  };

  const toggleEvent = (eventId: string) => {
    setFormData(prev => ({
      ...prev,
      events: prev.events.includes(eventId) 
        ? prev.events.filter(e => e !== eventId)
        : [...prev.events, eventId]
    }));
  };

  const getAgentPlatformInfo = async (agentId: string) => {
    // IMPORTANT: never fetch platform API keys client-side.
    const { data: agent } = await supabase
      .from('agents_safe')
      .select('platform, platform_agent_id, organization_id')
      .eq('id', agentId)
      .single();

    return agent || null;
  };

  const fetchPlatformWebhooks = async () => {
    if (!selectedAgent) return;
    
    setFetchingPlatformWebhooks(true);
    try {
      const agent = await getAgentPlatformInfo(selectedAgentId);
      if (!agent?.platform_agent_id || !agent?.organization_id) {
        toast.error(language === 'fr' ? 'Agent non configuré' : 'Agent not configured');
        return;
      }

      // Fetch webhooks from platform based on agent's platform
      let functionName = 'connector-proxy';
      let body: Record<string, unknown> = {};
      
      switch (agent.platform) {
        case 'elevenlabs':
          functionName = 'elevenlabs-convai-agent-config';
          body = {
            action: 'list_workspace_webhooks',
            agentId: agent.platform_agent_id,
            organizationId: agent.organization_id,
          };
          break;
        case 'vapi':
          functionName = 'vapi-proxy';
          body = {
            action: 'get_assistant',
            assistantId: agent.platform_agent_id,
            organizationId: agent.organization_id,
          };
          break;
        case 'retell':
          functionName = 'retell-proxy';
          body = {
            action: 'get_agent',
            agentId: agent.platform_agent_id,
            organizationId: agent.organization_id,
          };
          break;
      }

      const { data, error } = await supabase.functions.invoke(functionName, { body });

      if (error) throw error;
      
      // Extract webhook config from platform response based on platform type
      let webhookConfig: PlatformWebhookConfig | null = null;

      if (agent.platform === 'elevenlabs') {
        webhookConfig = {
          webhooks: data?.webhooks || [],
        };
      } else if (agent.platform === 'vapi') {
        webhookConfig = {
          url: data?.assistant?.serverUrl || data?.serverUrl,
          secret: data?.assistant?.serverUrlSecret || data?.serverUrlSecret,
        };
      } else if (agent.platform === 'retell') {
        webhookConfig = {
          url: data?.agent?.webhook_url || data?.webhook_url,
        };
      }
      
      setPlatformWebhooks(webhookConfig);
      setActiveTab('platform');
      toast.success(language === 'fr' ? 'Configuration webhook récupérée de la plateforme' : 'Webhook configuration fetched from platform');
    } catch (error) {
      console.error('Error fetching platform webhooks:', error);
      toast.error(language === 'fr' ? 'Erreur lors de la récupération depuis la plateforme' : 'Failed to fetch from platform');
    } finally {
      setFetchingPlatformWebhooks(false);
    }
  };

  const syncWebhookToPlatform = async (webhook: PlatformWebhook) => {
    if (!selectedAgent) return;
    
    setSyncingWebhook(true);
    try {
      const agent = await getAgentPlatformInfo(selectedAgentId);
      if (!agent?.platform_agent_id || !agent?.organization_id) {
        toast.error(language === 'fr' ? 'Agent non configuré' : 'Agent not configured');
        return;
      }

      let functionName = 'connector-proxy';
      let body: Record<string, unknown> = {};
      
      switch (agent.platform) {
        case 'elevenlabs':
          functionName = 'elevenlabs-convai-agent-config';
          body = {
            action: 'update',
            agentId: agent.platform_agent_id,
            organizationId: agent.organization_id,
            config: {
              platform_settings: {
                webhook: {
                  url: webhook.webhook_url,
                  events: webhook.events,
                  enabled: webhook.is_active,
                },
              },
            },
          };
          break;
        case 'vapi':
          functionName = 'vapi-proxy';
          body = {
            action: 'update_assistant',
            assistantId: agent.platform_agent_id,
            organizationId: agent.organization_id,
            data: {
              serverUrl: webhook.webhook_url,
              serverUrlSecret: webhook.webhook_secret,
            },
          };
          break;
        case 'retell':
          functionName = 'retell-proxy';
          body = {
            action: 'update_agent',
            agentId: agent.platform_agent_id,
            organizationId: agent.organization_id,
            data: {
              webhook_url: webhook.webhook_url,
            },
          };
          break;
      }

      const { error } = await supabase.functions.invoke(functionName, { body });

      if (error) throw error;
      
      toast.success(language === 'fr' ? 'Webhook synchronisé avec la plateforme' : 'Webhook synced to platform');
    } catch (error) {
      console.error('Error syncing webhook:', error);
      toast.error(language === 'fr' ? 'Erreur lors de la synchronisation' : 'Failed to sync webhook');
    } finally {
      setSyncingWebhook(false);
    }
  };

  const importFromPlatform = async () => {
    if (!platformWebhooks || !selectedAgent) return;
    
    const platform = selectedAgent.platform as 'elevenlabs' | 'vapi' | 'retell';
    const url = platformWebhooks.url || platformWebhooks.webhook_url || platformWebhooks.serverUrl || '';
    
    if (!url) {
      toast.error(language === 'fr' ? 'Aucune URL webhook trouvée sur la plateforme' : 'No webhook URL found on platform');
      return;
    }

    try {
      await addWebhook.mutateAsync({
        platform,
        webhook_url: url,
        webhook_secret: platformWebhooks.secret || platformWebhooks.serverUrlSecret || '',
        events: platformWebhooks.events || platformWebhooks.webhook_events || [],
        is_active: true,
      });
      
      toast.success(language === 'fr' ? 'Webhook importé depuis la plateforme' : 'Webhook imported from platform');
      setActiveTab('local');
    } catch (error) {
      console.error('Error importing webhook:', error);
    }
  };

  const openEditPlatformModal = (wh: Record<string, any>) => {
    setEditingPlatformWebhook(wh);
    setPlatformEditForm({ name: wh.name || '', is_disabled: wh.is_disabled || false });
    setShowEditPlatformModal(true);
  };

  const handleUpdatePlatformWebhook = async () => {
    if (!editingPlatformWebhook || !selectedAgent) return;
    setUpdatingPlatformWebhook(true);
    try {
      const agent = await getAgentPlatformInfo(selectedAgentId);
      if (!agent?.organization_id) {
        toast.error(language === 'fr' ? 'Agent non configuré' : 'Agent not configured');
        return;
      }

      const { error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
        body: {
          action: 'update_workspace_webhook',
          organizationId: agent.organization_id,
          webhookId: editingPlatformWebhook.webhook_id,
          webhookName: platformEditForm.name,
          isDisabled: platformEditForm.is_disabled,
        },
      });

      if (error) throw error;

      toast.success(language === 'fr' ? 'Webhook mis à jour' : 'Webhook updated');
      setShowEditPlatformModal(false);
      setEditingPlatformWebhook(null);
      // Refresh platform webhooks
      fetchPlatformWebhooks();
    } catch (error) {
      console.error('Error updating platform webhook:', error);
      toast.error(language === 'fr' ? 'Erreur lors de la mise à jour' : 'Failed to update webhook');
    } finally {
      setUpdatingPlatformWebhook(false);
    }
  };

  const handleDeletePlatformWebhook = async (webhookId: string) => {
    if (!selectedAgent) return;
    setDeletingPlatformWebhook(webhookId);
    try {
      const agent = await getAgentPlatformInfo(selectedAgentId);
      if (!agent?.organization_id) {
        toast.error(language === 'fr' ? 'Agent non configuré' : 'Agent not configured');
        return;
      }

      const { error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
        body: {
          action: 'delete_workspace_webhook',
          organizationId: agent.organization_id,
          webhookId,
        },
      });

      if (error) throw error;

      toast.success(language === 'fr' ? 'Webhook supprimé' : 'Webhook deleted');
      // Refresh platform webhooks
      fetchPlatformWebhooks();
    } catch (error) {
      console.error('Error deleting platform webhook:', error);
      toast.error(language === 'fr' ? 'Erreur lors de la suppression' : 'Failed to delete webhook');
    } finally {
      setDeletingPlatformWebhook(null);
    }
  };

  const texts = {
    title: language === 'fr' ? 'Gestion des Webhooks' : 'Webhook Management',
    description: language === 'fr' 
      ? 'Configurez les webhooks pour chaque agent et synchronisez avec les plateformes'
      : 'Configure webhooks for each agent and sync with platforms',
    selectAgent: language === 'fr' ? 'Sélectionner un agent' : 'Select an agent',
    addWebhook: language === 'fr' ? 'Ajouter Webhook' : 'Add Webhook',
    editWebhook: language === 'fr' ? 'Modifier Webhook' : 'Edit Webhook',
    platform: language === 'fr' ? 'Plateforme' : 'Platform',
    webhookUrl: language === 'fr' ? 'URL Webhook' : 'Webhook URL',
    webhookSecret: language === 'fr' ? 'Secret' : 'Secret',
    events: language === 'fr' ? 'Événements' : 'Events',
    yourWebhookUrl: language === 'fr' ? 'Votre URL Webhook (pour recevoir)' : 'Your Webhook URL (to receive)',
    fetchFromPlatform: language === 'fr' ? 'Récupérer de la plateforme' : 'Fetch from Platform',
    noWebhooks: language === 'fr' ? 'Aucun webhook configuré' : 'No webhooks configured',
    noAgent: language === 'fr' ? 'Sélectionnez un agent pour voir les webhooks' : 'Select an agent to view webhooks',
    lastTriggered: language === 'fr' ? 'Dernier déclenchement' : 'Last triggered',
    errors: language === 'fr' ? 'Erreurs' : 'Errors',
    platformConfig: language === 'fr' ? 'Configuration Plateforme' : 'Platform Configuration',
    localWebhooks: language === 'fr' ? 'Webhooks Locaux' : 'Local Webhooks',
    platformWebhooks: language === 'fr' ? 'Webhooks Plateforme' : 'Platform Webhooks',
    importFromPlatform: language === 'fr' ? 'Importer depuis la plateforme' : 'Import from Platform',
    syncToPlatform: language === 'fr' ? 'Synchroniser vers la plateforme' : 'Sync to Platform',
    noApiKey: language === 'fr' ? 'Clé API non configurée' : 'API key not configured',
    configureApiKey: language === 'fr' 
      ? 'Configurez la clé API de l\'agent dans les paramètres pour accéder aux webhooks de la plateforme'
      : 'Configure the agent\'s API key in settings to access platform webhooks',
  };

  if (loadingAgents) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Agent Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
        <div className="flex-1 w-full sm:w-auto">
          <Label>{texts.selectAgent}</Label>
          <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder={texts.selectAgent} />
            </SelectTrigger>
            <SelectContent>
              {agentsData?.agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  <div className="flex items-center gap-2">
                    <span>{agent.name}</span>
                    <Badge variant="outline" className="text-xs">{agent.platform}</Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {selectedAgentId && (
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => setShowAddModal(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              {texts.addWebhook}
            </Button>
            <Button 
              variant="outline" 
              onClick={fetchPlatformWebhooks}
              disabled={fetchingPlatformWebhooks}
              className="gap-2"
            >
              {fetchingPlatformWebhooks ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {texts.fetchFromPlatform}
            </Button>
          </div>
        )}
      </div>

      {/* Generated Webhook URL */}
      {selectedAgentId && selectedAgent && (
        <Card className="bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Webhook className="h-4 w-4 text-primary" />
              {texts.yourWebhookUrl}
            </CardTitle>
            <CardDescription>
              {language === 'fr' 
                ? 'Utilisez cette URL dans la configuration de votre plateforme pour recevoir les événements' 
                : 'Use this URL in your platform configuration to receive events'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm bg-muted p-3 rounded-md overflow-x-auto font-mono">
                {generateWebhookUrl(selectedAgent.platform)}
              </code>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => handleCopy(generateWebhookUrl(selectedAgent.platform), 'gen-url')}
              >
                {copiedId === 'gen-url' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs for Local vs Platform Webhooks */}
      {selectedAgentId && (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'local' | 'platform')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="local" className="gap-2">
              <Settings className="h-4 w-4" />
              {texts.localWebhooks}
              {webhooks.length > 0 && (
                <Badge variant="secondary" className="ml-1">{webhooks.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="platform" className="gap-2">
              <Cloud className="h-4 w-4" />
              {texts.platformWebhooks}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="local" className="space-y-4 mt-4">
            {/* Webhooks List */}
            {!isLoading && webhooks.length === 0 && (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Webhook className="h-12 w-12 text-muted-foreground mb-4" />
                  <h4 className="text-lg font-medium mb-2">{texts.noWebhooks}</h4>
                  <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
                    {language === 'fr' 
                      ? 'Ajoutez un webhook pour recevoir des notifications des événements de votre agent'
                      : 'Add a webhook to receive notifications from your agent events'}
                  </p>
                  <Button onClick={() => setShowAddModal(true)} variant="outline" className="gap-2">
                    <Plus className="h-4 w-4" />
                    {texts.addWebhook}
                  </Button>
                </CardContent>
              </Card>
            )}

            {isLoading && (
              <div className="space-y-4">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            )}

            <div className="grid gap-4">
              {webhooks.map((webhook) => (
                <Card key={webhook.id} className={cn("transition-all", !webhook.is_active && 'opacity-60')}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${webhook.is_active ? 'bg-primary/10' : 'bg-muted'}`}>
                          <Webhook className={`h-5 w-5 ${webhook.is_active ? 'text-primary' : 'text-muted-foreground'}`} />
                        </div>
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            {webhook.platform.charAt(0).toUpperCase() + webhook.platform.slice(1)}
                            <Badge variant={webhook.is_active ? 'default' : 'secondary'}>
                              {webhook.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                            {webhook.error_count > 0 && (
                              <Badge variant="destructive" className="gap-1">
                                <AlertCircle className="h-3 w-3" />
                                {webhook.error_count} {texts.errors}
                              </Badge>
                            )}
                          </CardTitle>
                          <CardDescription className="mt-1 font-mono text-xs truncate max-w-md">
                            {webhook.webhook_url}
                          </CardDescription>
                        </div>
                      </div>
                      <Switch
                        checked={webhook.is_active}
                        onCheckedChange={(checked) => toggleWebhook.mutate({ id: webhook.id, is_active: checked })}
                      />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {webhook.events.map((event) => (
                        <Badge key={event} variant="outline" className="text-xs">
                          {event}
                        </Badge>
                      ))}
                    </div>
                    
                    {webhook.last_triggered_at && (
                      <p className="text-xs text-muted-foreground mb-3">
                        {texts.lastTriggered}: {new Date(webhook.last_triggered_at).toLocaleString()}
                      </p>
                    )}
                    
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopy(webhook.webhook_url, webhook.id)}
                        className="gap-2"
                      >
                        {copiedId === webhook.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        Copy URL
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditModal(webhook)}
                        className="gap-2"
                      >
                        <Edit className="h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => syncWebhookToPlatform(webhook)}
                        disabled={syncingWebhook}
                        className="gap-2"
                      >
                        {syncingWebhook ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                        {texts.syncToPlatform}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteWebhook.mutate(webhook.id)}
                        className="text-destructive hover:text-destructive gap-2 ml-auto"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="platform" className="space-y-4 mt-4">
            {!platformWebhooks && !fetchingPlatformWebhooks && (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Cloud className="h-12 w-12 text-muted-foreground mb-4" />
                  <h4 className="text-lg font-medium mb-2">
                    {language === 'fr' ? 'Aucune configuration récupérée' : 'No configuration fetched'}
                  </h4>
                  <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
                    {language === 'fr' 
                      ? 'Cliquez sur "Récupérer de la plateforme" pour voir la configuration webhook actuelle'
                      : 'Click "Fetch from Platform" to see the current webhook configuration'}
                  </p>
                  <Button 
                    variant="outline" 
                    onClick={fetchPlatformWebhooks}
                    disabled={fetchingPlatformWebhooks}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    {texts.fetchFromPlatform}
                  </Button>
                </CardContent>
              </Card>
            )}

            {fetchingPlatformWebhooks && (
              <Card>
                <CardContent className="py-8">
                  <div className="flex items-center justify-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <span>{language === 'fr' ? 'Récupération en cours...' : 'Fetching...'}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {platformWebhooks && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <ExternalLink className="h-4 w-4" />
                        {texts.platformConfig}
                      </CardTitle>
                      <CardDescription>
                        {language === 'fr'
                          ? 'Webhooks existants sur la plateforme'
                          : 'Existing webhooks on the platform'}
                      </CardDescription>
                    </div>
                    {!platformWebhooks.webhooks && (
                      <Button onClick={importFromPlatform} className="gap-2">
                        <Download className="h-4 w-4" />
                        {texts.importFromPlatform}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {/* ElevenLabs: workspace webhooks list */}
                  {Array.isArray(platformWebhooks.webhooks) && (
                    <div className="space-y-3">
                      {platformWebhooks.webhooks.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          {language === 'fr'
                            ? 'Aucun webhook trouvé dans le workspace.'
                            : 'No webhooks found in the workspace.'}
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {platformWebhooks.webhooks.map((wh: any) => (
                            <div key={wh.webhook_id || wh.webhook_url} className="p-3 rounded-lg border bg-card">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium truncate">{wh.name || wh.webhook_id || 'Webhook'}</div>
                                  <code className="block text-xs bg-muted p-2 rounded-md font-mono mt-1 break-all">
                                    {wh.webhook_url}
                                  </code>
                                </div>
                                <div className="flex flex-col items-end gap-2 shrink-0">
                                  <Badge variant={wh.is_disabled ? 'secondary' : 'default'}>
                                    {wh.is_disabled
                                      ? (language === 'fr' ? 'Désactivé' : 'Disabled')
                                      : (language === 'fr' ? 'Actif' : 'Active')}
                                  </Badge>
                                  {wh.auth_type && <Badge variant="outline">{wh.auth_type}</Badge>}
                                </div>
                              </div>
                              {Array.isArray(wh.usage) && wh.usage.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {wh.usage.map((u: any, idx: number) => (
                                    <Badge key={`${wh.webhook_id}-u-${idx}`} variant="outline" className="text-xs">
                                      {u.usage_type || 'usage'}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              {/* Edit/Delete actions for ElevenLabs */}
                              {selectedAgent?.platform === 'elevenlabs' && (
                                <div className="flex gap-2 mt-3 pt-3 border-t">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openEditPlatformModal(wh)}
                                    className="gap-2"
                                  >
                                    <Edit className="h-3 w-3" />
                                    {language === 'fr' ? 'Modifier' : 'Edit'}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeletePlatformWebhook(wh.webhook_id)}
                                    disabled={deletingPlatformWebhook === wh.webhook_id}
                                    className="text-destructive hover:text-destructive gap-2"
                                  >
                                    {deletingPlatformWebhook === wh.webhook_id ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-3 w-3" />
                                    )}
                                    {language === 'fr' ? 'Supprimer' : 'Delete'}
                                  </Button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Fallback: single webhook config */}
                  {!platformWebhooks.webhooks && (
                    <div className="space-y-3">
                      {(platformWebhooks.url || platformWebhooks.webhook_url || platformWebhooks.serverUrl) && (
                        <div>
                          <Label className="text-xs text-muted-foreground">Webhook URL</Label>
                          <code className="block text-sm bg-muted p-2 rounded-md font-mono mt-1 break-all">
                            {platformWebhooks.url || platformWebhooks.webhook_url || platformWebhooks.serverUrl}
                          </code>
                        </div>
                      )}
                      {(platformWebhooks.events || platformWebhooks.webhook_events) && (
                        <div>
                          <Label className="text-xs text-muted-foreground">Events</Label>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {(platformWebhooks.events || platformWebhooks.webhook_events || []).map((event) => (
                              <Badge key={event} variant="outline" className="text-xs">{event}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {platformWebhooks.enabled !== undefined && (
                        <div>
                          <Label className="text-xs text-muted-foreground">Status</Label>
                          <Badge variant={platformWebhooks.enabled ? 'default' : 'secondary'} className="mt-1">
                            {platformWebhooks.enabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* No Agent Selected */}
      {!selectedAgentId && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Webhook className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">{texts.noAgent}</p>
          </CardContent>
        </Card>
      )}

      {/* Add Webhook Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{texts.addWebhook}</DialogTitle>
            <DialogDescription>
              {language === 'fr' 
                ? 'Configurez un nouveau webhook pour recevoir les événements'
                : 'Configure a new webhook to receive events'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{texts.platform}</Label>
              <Select
                value={formData.platform}
                onValueChange={(value: 'elevenlabs' | 'vapi' | 'retell') => 
                  setFormData({ ...formData, platform: value, events: [] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
                  <SelectItem value="vapi">Vapi</SelectItem>
                  <SelectItem value="retell">Retell AI</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{texts.webhookUrl}</Label>
              <Input
                value={formData.webhook_url}
                onChange={(e) => setFormData({ ...formData, webhook_url: e.target.value })}
                placeholder="https://your-server.com/webhook"
              />
            </div>

            <div className="space-y-2">
              <Label>{texts.webhookSecret} (optional)</Label>
              <Input
                type="password"
                value={formData.webhook_secret || ''}
                onChange={(e) => setFormData({ ...formData, webhook_secret: e.target.value })}
                placeholder="Secret for signature verification"
              />
            </div>

            <div className="space-y-2">
              <Label>{texts.events}</Label>
              <ScrollArea className="h-[200px] border rounded-md p-3">
                <div className="space-y-2">
                  {availableEvents.map((event) => (
                    <div key={event.id} className="flex items-start gap-3">
                      <Checkbox
                        id={event.id}
                        checked={formData.events.includes(event.id)}
                        onCheckedChange={() => toggleEvent(event.id)}
                      />
                      <div className="grid gap-1 leading-none">
                        <label htmlFor={event.id} className="text-sm font-medium cursor-pointer">
                          {event.name}
                        </label>
                        <p className="text-xs text-muted-foreground">{event.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAddWebhook} 
              disabled={!formData.webhook_url || formData.events.length === 0 || addWebhook.isPending}
            >
              {addWebhook.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {texts.addWebhook}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Webhook Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{texts.editWebhook}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{texts.webhookUrl}</Label>
              <Input
                value={formData.webhook_url}
                onChange={(e) => setFormData({ ...formData, webhook_url: e.target.value })}
                placeholder="https://your-server.com/webhook"
              />
            </div>

            <div className="space-y-2">
              <Label>{texts.webhookSecret} (optional)</Label>
              <Input
                type="password"
                value={formData.webhook_secret || ''}
                onChange={(e) => setFormData({ ...formData, webhook_secret: e.target.value })}
                placeholder="Secret for signature verification"
              />
            </div>

            <div className="space-y-2">
              <Label>{texts.events}</Label>
              <ScrollArea className="h-[200px] border rounded-md p-3">
                <div className="space-y-2">
                  {PLATFORM_WEBHOOK_EVENTS[formData.platform]?.map((event) => (
                    <div key={event.id} className="flex items-start gap-3">
                      <Checkbox
                        id={`edit-${event.id}`}
                        checked={formData.events.includes(event.id)}
                        onCheckedChange={() => toggleEvent(event.id)}
                      />
                      <div className="grid gap-1 leading-none">
                        <label htmlFor={`edit-${event.id}`} className="text-sm font-medium cursor-pointer">
                          {event.name}
                        </label>
                        <p className="text-xs text-muted-foreground">{event.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleEditWebhook} 
              disabled={!formData.webhook_url || updateWebhook.isPending}
            >
              {updateWebhook.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Platform Webhook Modal (ElevenLabs) */}
      <Dialog open={showEditPlatformModal} onOpenChange={setShowEditPlatformModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {language === 'fr' ? 'Modifier le webhook' : 'Edit Webhook'}
            </DialogTitle>
            <DialogDescription>
              {language === 'fr' 
                ? 'Modifiez le nom et le statut du webhook sur la plateforme.'
                : 'Update the webhook name and status on the platform.'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{language === 'fr' ? 'Nom' : 'Name'}</Label>
              <Input
                value={platformEditForm.name}
                onChange={(e) => setPlatformEditForm({ ...platformEditForm, name: e.target.value })}
                placeholder={language === 'fr' ? 'Nom du webhook' : 'Webhook name'}
              />
            </div>

            <div className="space-y-2">
              <Label>{language === 'fr' ? 'URL (lecture seule)' : 'URL (read-only)'}</Label>
              <code className="block text-sm bg-muted p-2 rounded-md font-mono break-all">
                {editingPlatformWebhook?.webhook_url || '-'}
              </code>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="platform-webhook-disabled">
                {language === 'fr' ? 'Désactiver le webhook' : 'Disable webhook'}
              </Label>
              <Switch
                id="platform-webhook-disabled"
                checked={platformEditForm.is_disabled}
                onCheckedChange={(checked) => setPlatformEditForm({ ...platformEditForm, is_disabled: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditPlatformModal(false)}>
              {language === 'fr' ? 'Annuler' : 'Cancel'}
            </Button>
            <Button 
              onClick={handleUpdatePlatformWebhook} 
              disabled={updatingPlatformWebhook}
            >
              {updatingPlatformWebhook && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {language === 'fr' ? 'Enregistrer' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
