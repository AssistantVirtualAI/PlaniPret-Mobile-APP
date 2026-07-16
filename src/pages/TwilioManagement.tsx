import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, Loader2, AlertCircle, BarChart3 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { TwilioPhoneNumbersTab } from '@/components/twilio/TwilioPhoneNumbersTab';
import { TwilioAppsTab } from '@/components/twilio/TwilioAppsTab';
import { TwilioUsageTab } from '@/components/twilio/TwilioUsageTab';
import { TwilioCallsTab } from '@/components/twilio/TwilioCallsTab';
import { TwilioAnalyticsPanel } from '@/components/twilio/TwilioAnalyticsPanel';
import { useTwilioIntegration } from '@/hooks/useTwilioIntegration';
import { useTranslation } from '@/hooks/useTranslation';

export default function TwilioManagement() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isConfigured, checkingConfig } = useTwilioIntegration();

  if (checkingConfig) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (!isConfigured) {
    return (
      <AppLayout>
        <div className="p-8 space-y-6">
          <Button variant="ghost" onClick={() => navigate('/integrations')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('twilio.backToIntegrations')}
          </Button>

          <Alert variant="destructive">
            <AlertCircle className="w-4 h-4" />
            <AlertTitle>{t('twilio.notConfiguredTitle')}</AlertTitle>
            <AlertDescription className="mt-2">
              {t('twilio.notConfiguredDesc')}
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-4"
                onClick={() => navigate('/integrations')}
              >
                {t('twilio.goToIntegrations')}
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate('/integrations')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('twilio.backToIntegrations')}
            </Button>
            <div>
              <h1 className="text-3xl font-bold gradient-text flex items-center gap-3">
                <Phone className="w-8 h-8" />
                {t('twilio.title')}
              </h1>
              <p className="text-muted-foreground mt-1">
                {t('twilio.description')}
              </p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="numbers" className="space-y-6">
          <TabsList>
            <TabsTrigger value="numbers">{t('twilio.tabs.phoneNumbers')}</TabsTrigger>
            <TabsTrigger value="apps">{t('twilio.tabs.twimlApps')}</TabsTrigger>
            <TabsTrigger value="calls">{t('twilio.tabs.calls')}</TabsTrigger>
            <TabsTrigger value="analytics">{t('twilio.tabs.analytics')}</TabsTrigger>
            <TabsTrigger value="usage">{t('twilio.tabs.usage')}</TabsTrigger>
          </TabsList>

          <TabsContent value="numbers">
            <TwilioPhoneNumbersTab />
          </TabsContent>

          <TabsContent value="apps">
            <TwilioAppsTab />
          </TabsContent>

          <TabsContent value="calls">
            <TwilioCallsTab />
          </TabsContent>

          <TabsContent value="analytics">
            <TwilioAnalyticsPanel />
          </TabsContent>

          <TabsContent value="usage">
            <TwilioUsageTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
