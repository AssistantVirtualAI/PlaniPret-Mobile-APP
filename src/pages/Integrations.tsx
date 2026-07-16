import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, CheckCircle, XCircle, Loader2, TestTube, Clock, ExternalLink } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Info, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { useToast } from '@/hooks/use-toast';
import { useLocation, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { useTranslation } from '@/hooks/useTranslation';
import { useAllowedPlatforms } from '@/hooks/useAllowedPlatforms';

const twilioHelpHref =
  "https://www.twilio.com/console";

const getPlatforms = (t: (key: string) => string) => [
  {
    name: 'OpenAI',
    value: 'openai',
    description: t('integrations.platforms.openai'),
    icon: '🤖',
  },
  {
    name: 'Vapi',
    value: 'vapi',
    description: t('integrations.platforms.vapi'),
    icon: '🎙️',
  },
  {
    name: 'Retell',
    value: 'retell',
    description: t('integrations.platforms.retell'),
    icon: '📞',
  },
  {
    name: 'ElevenLabs',
    value: 'elevenlabs',
    description: t('integrations.platforms.elevenlabs'),
    icon: '🔊',
  },
  {
    name: 'Twilio',
    value: 'twilio',
    description: t('integrations.platforms.twilio'),
    icon: '📱',
    fields: ['accountSid', 'authToken'],
    managementUrl: '/twilio-management',
  },
];

export default function Integrations() {
  const { t, language } = useTranslation();
  const { selectedOrgId } = useOrganization();
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [agentId, setAgentId] = useState('');
  const [accountSid, setAccountSid] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [testingPlatform, setTestingPlatform] = useState<string | null>(null);

  const searchParams = new URLSearchParams(location.search);
  const fromAgents = searchParams.get('from') === 'agents';
  const { isAllowed } = useAllowedPlatforms();
  const platforms = getPlatforms(t).filter((p) => isAllowed(p.value));
  const dateLocale = language === 'fr' ? fr : enUS;

  // Fetch integrations - works with or without organization
  const { data: integrations = [], refetch } = useQuery({
    queryKey: ['integrations', selectedOrgId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      let query = (supabase as any)
        .from('organization_integrations_safe')
        .select('*')
        .eq('user_id', user.id);

      if (selectedOrgId) {
        query = query.eq('organization_id', selectedOrgId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const testIntegration = async (platform: string) => {
    setTestingPlatform(platform);
    try {
      const { data, error } = await supabase.functions.invoke('test-integration', {
        body: { platform },
      });

      if (error) throw error;

      await refetch();

      if (data?.success) {
        toast({
          title: t('integrations.messages.connectionSuccess'),
          description: t('integrations.messages.connectionWorking'),
        });
      } else {
        toast({
          title: t('integrations.messages.connectionFailed'),
          description: data?.error || t('integrations.messages.connectionFailed'),
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('Test integration error:', error);
      toast({
        title: t('integrations.messages.testError'),
        description: error.message || t('integrations.messages.cannotTest'),
        variant: 'destructive',
      });
    } finally {
      setTestingPlatform(null);
    }
  };

  const handleSave = async () => {
    const isTwilio = selectedPlatform === 'twilio';
    const hasRequiredFields = isTwilio ? (accountSid && authToken) : apiKey;
    
    if (!selectedPlatform || !hasRequiredFields) {
      toast({
        title: t('common.error'),
        description: t('integrations.messages.fillRequired'),
        variant: 'destructive',
      });
      return;
    }

    try {
      setSaving(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: t('common.error'),
          description: t('integrations.messages.mustBeLoggedIn'),
          variant: 'destructive',
        });
        return;
      }

      const existingIntegration = integrations.find(
        (int) => int.platform === selectedPlatform
      );

      // For Twilio, we store accountSid in api_key and authToken in agent_id
      const apiKeyToSave = selectedPlatform === 'twilio' ? accountSid : apiKey;
      const agentIdToSave = selectedPlatform === 'twilio' ? authToken : (agentId || null);

      let integrationId: string;

      if (existingIntegration) {
        const { error } = await supabase
          .from('organization_integrations')
          .update({
            api_key: apiKeyToSave,
            agent_id: agentIdToSave,
            updated_at: new Date().toISOString(),
            test_status: 'pending',
          })
          .eq('id', existingIntegration.id);

        if (error) throw error;
        integrationId = existingIntegration.id;
      } else {
        const { data, error } = await supabase
          .from('organization_integrations')
          .insert({
            organization_id: selectedOrgId || null,
            user_id: user.id,
            platform: selectedPlatform,
            api_key: apiKeyToSave,
            agent_id: agentIdToSave,
            is_active: true,
            test_status: 'pending',
          })
          .select('id')
          .single();

        if (error) throw error;
        integrationId = data.id;
      }

      toast({
        title: t('integrations.messages.saved'),
        description: t('integrations.messages.testingConnection'),
      });

      setSelectedPlatform(null);
      setApiKey('');
      setAgentId('');
      setAccountSid('');
      setAuthToken('');
      await refetch();

      // Auto-test the integration
      await testIntegration(selectedPlatform);

    } catch (error: any) {
      console.error('Integration save error:', error);
      toast({
        title: t('integrations.messages.saveError'),
        description: error.message || t('integrations.messages.cannotSave'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const getIntegrationStatus = (platform: string) => {
    return integrations.find((int) => int.platform === platform);
  };

  const getTestStatusBadge = (status: string | null) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">{t('integrations.status.connected')}</Badge>;
      case 'failed':
        return <Badge variant="destructive">{t('integrations.status.error')}</Badge>;
      case 'pending':
        return <Badge variant="secondary">{t('integrations.status.pending')}</Badge>;
      default:
        return <Badge variant="outline">{t('integrations.status.notTested')}</Badge>;
    }
  };

  const maskAgentId = (id: string | null) => {
    if (!id) return null;
    if (id.length <= 8) return id;
    return `${id.slice(0, 4)}...${id.slice(-4)}`;
  };

  return (
    <AppLayout>
      <div className="p-8 space-y-6">
        {fromAgents && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>{t('integrations.configureIntegration')}</span>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => navigate('/agents')}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('integrations.backToAgents')}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div>
          <h1 className="text-3xl font-bold gradient-text mb-2">{t('integrations.title')}</h1>
          <p className="text-muted-foreground">
            {t('integrations.description')}
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {platforms.map((platform) => {
            const integration = getIntegrationStatus(platform.value);
            const isConfigured = !!integration;
            const isTesting = testingPlatform === platform.value;

            return (
              <Card key={platform.value} className="glass-card">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-4xl">{platform.icon}</span>
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {platform.name}
                          {isConfigured && getTestStatusBadge(integration.test_status)}
                        </CardTitle>
                        <CardDescription>{platform.description}</CardDescription>
                      </div>
                    </div>
                    {isConfigured ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {isConfigured ? (
                    <div className="space-y-3">
                      <div className="text-sm text-muted-foreground space-y-1">
                        {integration.agent_id && (
                          <p className="flex items-center gap-1">
                            <span>Agent ID:</span>
                            <code className="bg-muted px-1 rounded text-xs">
                              {maskAgentId(integration.agent_id)}
                            </code>
                          </p>
                        )}
                        <p className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>
                            {t('integrations.configuredOn')} {format(new Date(integration.updated_at || integration.created_at), 'dd MMM yyyy', { locale: dateLocale })}
                          </span>
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => testIntegration(platform.value)}
                          disabled={isTesting}
                        >
                          {isTesting ? (
                            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                          ) : (
                            <TestTube className="w-4 h-4 mr-1" />
                          )}
                          {t('integrations.actions.test')}
                        </Button>
                          <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedPlatform(platform.value);
                            if (platform.value === 'twilio') {
                              setAccountSid(integration.api_key || '');
                              setAuthToken(integration.agent_id || '');
                            } else {
                              setAgentId(integration.agent_id || '');
                            }
                          }}
                        >
                          {t('integrations.actions.reconfigure')}
                        </Button>
                        {platform.value === 'twilio' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate('/twilio-management')}
                          >
                            <ExternalLink className="w-4 h-4 mr-1" />
                            {t('integrations.actions.manage')}
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <Button
                      onClick={() => setSelectedPlatform(platform.value)}
                      className="w-full gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      {t('integrations.actions.addIntegration')}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Dialog
          open={!!selectedPlatform}
          onOpenChange={(open) => !open && setSelectedPlatform(null)}
        >
          <DialogContent>
            <DialogHeader>
            <DialogTitle>
              {t('integrations.modal.configure')} {platforms.find((p) => p.value === selectedPlatform)?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {selectedPlatform === 'twilio' ? (
              <>
                <div>
                  <Label htmlFor="accountSid">{t('integrations.modal.accountSid')} *</Label>
                  <Input
                    id="accountSid"
                    type="password"
                    value={accountSid}
                    onChange={(e) => setAccountSid(e.target.value)}
                    placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t('integrations.twilio.helpLine')}{" "}
                    <a
                      href={twilioHelpHref}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-4"
                    >
                      {t('integrations.twilio.openConsole')}
                    </a>
                    .
                  </p>
                </div>
                <div>
                  <Label htmlFor="authToken">{t('integrations.modal.authToken')} *</Label>
                  <Input
                    id="authToken"
                    type="password"
                    value={authToken}
                    onChange={(e) => setAuthToken(e.target.value)}
                    placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label htmlFor="apiKey">{t('integrations.modal.apiKey')} *</Label>
                  <Input
                    id="apiKey"
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                  />
                </div>
                <div>
                  <Label htmlFor="agentId">{t('integrations.modal.agentId')}</Label>
                  <Input
                    id="agentId"
                    value={agentId}
                    onChange={(e) => setAgentId(e.target.value)}
                    placeholder="agent_xxx"
                  />
                </div>
              </>
            )}
            <div className="flex gap-2">
              <Button
                onClick={handleSave}
                disabled={saving || (selectedPlatform === 'twilio' ? (!accountSid || !authToken) : !apiKey)}
                className="flex-1"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t('common.loading')}
                  </>
                ) : (
                    t('integrations.actions.saveAndTest')
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
