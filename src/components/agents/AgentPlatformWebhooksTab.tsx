import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useAgentPlatformWebhooks, PLATFORM_WEBHOOK_EVENTS, PlatformWebhookInput } from '@/hooks/useAgentPlatformWebhooks';
import { useTranslation } from '@/hooks/useTranslation';
import { 
  Webhook, 
  Copy, 
  Check, 
  Plus, 
  Trash2, 
  Settings,
  ExternalLink,
  AlertCircle,
  Clock,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

interface AgentPlatformWebhooksTabProps {
  agentId: string;
  platform?: string;
}

const PLATFORM_INFO = {
  elevenlabs: {
    name: 'ElevenLabs',
    color: 'bg-purple-500',
    docsUrl: 'https://elevenlabs.io/docs/conversational-ai/customization/webhooks',
  },
  vapi: {
    name: 'Vapi',
    color: 'bg-blue-500',
    docsUrl: 'https://docs.vapi.ai/webhooks',
  },
  retell: {
    name: 'Retell',
    color: 'bg-green-500',
    docsUrl: 'https://docs.retellai.com/features/post-call-webhook',
  },
};

export function AgentPlatformWebhooksTab({ agentId, platform: initialPlatform }: AgentPlatformWebhooksTabProps) {
  const { t } = useTranslation();
  const { 
    webhooks, 
    isLoading, 
    addWebhook, 
    updateWebhook, 
    deleteWebhook, 
    toggleWebhook,
    generateWebhookUrl 
  } = useAgentPlatformWebhooks(agentId);
  
  const [selectedPlatform, setSelectedPlatform] = useState<'elevenlabs' | 'vapi' | 'retell'>(
    (initialPlatform as 'elevenlabs' | 'vapi' | 'retell') || 'elevenlabs'
  );
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [formData, setFormData] = useState<PlatformWebhookInput>({
    platform: 'elevenlabs',
    webhook_url: '',
    webhook_secret: '',
    events: [],
  });

  const currentWebhook = webhooks.find(w => w.platform === selectedPlatform);
  const webhookUrl = generateWebhookUrl(selectedPlatform);

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedUrl(true);
    toast.success(t('webhooks.urlCopied'));
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleConfigureWebhook = () => {
    if (currentWebhook) {
      setFormData({
        platform: currentWebhook.platform,
        webhook_url: currentWebhook.webhook_url,
        webhook_secret: currentWebhook.webhook_secret || '',
        events: currentWebhook.events,
      });
    } else {
      setFormData({
        platform: selectedPlatform,
        webhook_url: '',
        webhook_secret: '',
        events: [],
      });
    }
    setShowConfigModal(true);
  };

  const handleSaveWebhook = async () => {
    if (currentWebhook) {
      await updateWebhook.mutateAsync({ id: currentWebhook.id, ...formData });
    } else {
      await addWebhook.mutateAsync(formData);
    }
    setShowConfigModal(false);
  };

  const handleDeleteWebhook = async () => {
    if (currentWebhook) {
      await deleteWebhook.mutateAsync(currentWebhook.id);
    }
  };

  const toggleEvent = (eventId: string) => {
    setFormData(prev => ({
      ...prev,
      events: prev.events.includes(eventId)
        ? prev.events.filter(e => e !== eventId)
        : [...prev.events, eventId],
    }));
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold">{t('webhooks.platformWebhooks')}</h3>
        <p className="text-sm text-muted-foreground">{t('webhooks.platformWebhooksDescription')}</p>
      </div>

      {/* Platform Tabs */}
      <Tabs value={selectedPlatform} onValueChange={(v) => setSelectedPlatform(v as typeof selectedPlatform)}>
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          {Object.entries(PLATFORM_INFO).map(([key, info]) => {
            const hasWebhook = webhooks.some(w => w.platform === key);
            return (
              <TabsTrigger key={key} value={key} className="gap-2">
                <div className={`w-2 h-2 rounded-full ${info.color}`} />
                {info.name}
                {hasWebhook && <Check className="h-3 w-3 text-green-500" />}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {Object.keys(PLATFORM_INFO).map((platform) => (
          <TabsContent key={platform} value={platform} className="space-y-4">
            {/* Your Webhook URL Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('webhooks.yourWebhookUrl')}</CardTitle>
                <CardDescription>
                  {t('webhooks.webhookUrlDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    value={webhookUrl}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button variant="outline" onClick={handleCopyUrl} className="shrink-0">
                    {copiedUrl ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {t('webhooks.copyUrlInstructions')}
                </p>
              </CardContent>
            </Card>

            {/* Current Configuration */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{t('webhooks.configuration')}</CardTitle>
                    <CardDescription>
                      {currentWebhook
                        ? `${currentWebhook.events.length} events configured`
                        : t('webhooks.notConfigured')
                      }
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {currentWebhook && (
                      <Switch
                        checked={currentWebhook.is_active}
                        onCheckedChange={(checked) => toggleWebhook.mutate({ id: currentWebhook.id, is_active: checked })}
                      />
                    )}
                    <Button variant="outline" onClick={handleConfigureWebhook} className="gap-2">
                      <Settings className="h-4 w-4" />
                      {currentWebhook ? t('common.edit') : t('webhooks.configure')}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {currentWebhook && (
                <CardContent>
                  <div className="space-y-4">
                    {/* Status */}
                    <div className="flex items-center gap-4">
                      <Badge variant={currentWebhook.is_active ? 'default' : 'secondary'}>
                        {currentWebhook.is_active ? t('common.active') : t('common.inactive')}
                      </Badge>
                      {currentWebhook.last_triggered_at && (
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {t('webhooks.lastTriggered')}: {new Date(currentWebhook.last_triggered_at).toLocaleString()}
                        </span>
                      )}
                      {currentWebhook.error_count > 0 && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {currentWebhook.error_count} {t('webhooks.errors')}
                        </Badge>
                      )}
                    </div>

                    {/* Events */}
                    <div>
                      <Label className="mb-2 block">{t('webhooks.subscribedEvents')}</Label>
                      <div className="flex flex-wrap gap-2">
                        {currentWebhook.events.map((event) => (
                          <Badge key={event} variant="outline">{event}</Badge>
                        ))}
                      </div>
                    </div>

                    {/* Outgoing URL */}
                    {currentWebhook.webhook_url && (
                      <div>
                        <Label className="mb-2 block">{t('webhooks.forwardingTo')}</Label>
                        <code className="text-sm bg-muted px-2 py-1 rounded">{currentWebhook.webhook_url}</code>
                      </div>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Documentation Link */}
            <Card className="bg-muted/50">
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="font-medium">{t('webhooks.needHelp')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('webhooks.viewDocs')}
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  onClick={() => window.open(PLATFORM_INFO[platform as keyof typeof PLATFORM_INFO].docsUrl, '_blank')}
                  className="gap-2"
                >
                  <ExternalLink className="h-4 w-4" />
                  {t('webhooks.viewDocumentation')}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Configure Modal */}
      <Dialog open={showConfigModal} onOpenChange={setShowConfigModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {t('webhooks.configureWebhook')} - {PLATFORM_INFO[selectedPlatform].name}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Forward URL */}
            <div className="space-y-2">
              <Label>{t('webhooks.forwardingUrl')}</Label>
              <Input
                value={formData.webhook_url}
                onChange={(e) => setFormData({ ...formData, webhook_url: e.target.value })}
                placeholder="https://your-server.com/webhook"
              />
              <p className="text-xs text-muted-foreground">
                {t('webhooks.forwardingUrlDescription')}
              </p>
            </div>

            {/* Secret */}
            <div className="space-y-2">
              <Label>{t('webhooks.signingSecret')}</Label>
              <Input
                type="password"
                value={formData.webhook_secret}
                onChange={(e) => setFormData({ ...formData, webhook_secret: e.target.value })}
                placeholder={t('webhooks.signingSecretPlaceholder')}
              />
            </div>

            {/* Events */}
            <div className="space-y-2">
              <Label>{t('webhooks.selectEvents')}</Label>
              <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                {PLATFORM_WEBHOOK_EVENTS[selectedPlatform].map((event) => (
                  <label
                    key={event.id}
                    className="flex items-start gap-3 p-3 hover:bg-muted/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={formData.events.includes(event.id)}
                      onCheckedChange={() => toggleEvent(event.id)}
                    />
                    <div>
                      <p className="font-medium text-sm">{event.name}</p>
                      <p className="text-xs text-muted-foreground">{event.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="flex justify-between">
            {currentWebhook && (
              <Button 
                variant="destructive" 
                onClick={handleDeleteWebhook}
                disabled={deleteWebhook.isPending}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t('common.delete')}
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => setShowConfigModal(false)}>
                {t('common.cancel')}
              </Button>
              <Button 
                onClick={handleSaveWebhook}
                disabled={addWebhook.isPending || updateWebhook.isPending}
              >
                {(addWebhook.isPending || updateWebhook.isPending) && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {t('common.save')}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
