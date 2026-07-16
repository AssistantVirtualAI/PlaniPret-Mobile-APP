import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Building, Copy, Shield, Trash2, Lock, Eye, EyeOff, Brain, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { ImageUploader } from '@/components/saas/ImageUploader';
import { useOrganization } from '@/context/OrganizationContext';
import { useBillingConfig } from '@/hooks/useBillingConfig';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/useTranslation';

interface OrgConfig {
  name: string;
  logo_dashboard_url: string;
  logo_login_url: string;
  gdpr_enabled: boolean;
  hipaa_enabled: boolean;
  api_key: string;
}

export function AgencyTab() {
  const { t } = useTranslation();
  const { selectedOrg, selectedOrgId, refreshOrganization } = useOrganization();
  const { currentPlan } = useBillingConfig();
  const [isSaving, setIsSaving] = useState(false);
  const [config, setConfig] = useState<OrgConfig>({
    name: '',
    logo_dashboard_url: '',
    logo_login_url: '',
    gdpr_enabled: false,
    hipaa_enabled: false,
    api_key: '',
  });

  // Load full organization data (excluding sensitive fields like openai_api_key)
  useEffect(() => {
    if (selectedOrgId) {
      loadOrgData();
    }
  }, [selectedOrgId]);

  const loadOrgData = async () => {
    if (!selectedOrgId) return;
    const { data, error } = await supabase
      .from('organizations')
      .select('id, name, logo_dashboard_url, logo_login_url, gdpr_enabled, hipaa_enabled, api_key')
      .eq('id', selectedOrgId)
      .single();

    if (!error && data) {
      setConfig({
        name: data.name || '',
        logo_dashboard_url: data.logo_dashboard_url || '',
        logo_login_url: data.logo_login_url || '',
        gdpr_enabled: data.gdpr_enabled || false,
        hipaa_enabled: data.hipaa_enabled || false,
        api_key: data.api_key || '',
      });
    }
  };

  const isUltimatePlan = currentPlan?.id === 'ultimate';

  const handleSave = async () => {
    if (!selectedOrgId) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({
          name: config.name,
          logo_dashboard_url: config.logo_dashboard_url,
          logo_login_url: config.logo_login_url,
          gdpr_enabled: config.gdpr_enabled,
          hipaa_enabled: config.hipaa_enabled,
        })
        .eq('id', selectedOrgId);

      if (error) throw error;
      toast.success(t('settings.agency.saved'));
      refreshOrganization();
    } catch (error: any) {
      toast.error(error.message || t('settings.agency.saveError'));
    } finally {
      setIsSaving(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success(t('settings.agency.copied'));
  };

  return (
    <div className="space-y-6">
      <Card className="glass-card">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Building className="w-6 h-6 text-white" />
            </div>
            <div>
              <CardTitle>{t('settings.agency.title')}</CardTitle>
              <CardDescription>{t('settings.agency.description')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Logos */}
          <div className="grid md:grid-cols-2 gap-6">
            <ImageUploader
              label={t('settings.agency.logoDashboard')}
              currentUrl={config.logo_dashboard_url}
              organizationId={selectedOrgId || ''}
              folder="logos"
              onUpload={(url) => setConfig({ ...config, logo_dashboard_url: url })}
              onRemove={() => setConfig({ ...config, logo_dashboard_url: '' })}
              aspectRatio="wide"
            />
            <ImageUploader
              label={t('settings.agency.logoLogin')}
              currentUrl={config.logo_login_url}
              organizationId={selectedOrgId || ''}
              folder="logos"
              onUpload={(url) => setConfig({ ...config, logo_login_url: url })}
              onRemove={() => setConfig({ ...config, logo_login_url: '' })}
              aspectRatio="wide"
            />
          </div>

          <Separator />

          {/* Nom agence */}
          <div className="space-y-2">
            <Label htmlFor="agencyName">{t('settings.agency.agencyName')}</Label>
            <Input
              id="agencyName"
              value={config.name}
              onChange={(e) => setConfig({ ...config, name: e.target.value })}
              className="bg-background/50"
            />
          </div>

          {/* Workspace ID */}
          <div className="space-y-2">
            <Label>{t('settings.agency.workspaceId')}</Label>
            <div className="flex gap-2">
              <Input
                value={selectedOrgId || ''}
                disabled
                className="bg-muted font-mono text-sm"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(selectedOrgId || '')}
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* ChatDash API Key */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>{t('settings.agency.apiKey')}</Label>
              {!isUltimatePlan && (
                <Badge variant="secondary" className="text-xs">
                  <Lock className="w-3 h-3 mr-1" />
                  {t('settings.agency.ultimatePlan')}
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                value={config.api_key || '••••••••••••••••'}
                disabled
                className="bg-muted font-mono text-sm"
              />
              {isUltimatePlan && config.api_key && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(config.api_key)}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          <Separator />

          {/* GDPR Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>{t('settings.agency.gdpr')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('settings.agency.gdprDesc')}
              </p>
            </div>
            <Switch
              checked={config.gdpr_enabled}
              onCheckedChange={(checked) => setConfig({ ...config, gdpr_enabled: checked })}
            />
          </div>

          {/* HIPAA Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2">
                <Label>{t('settings.agency.hipaa')}</Label>
                <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/30">
                  <Shield className="w-3 h-3 mr-1" />
                  {t('settings.agency.getHipaa')}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {t('settings.agency.hipaaDesc')}
              </p>
            </div>
            <Switch
              checked={config.hipaa_enabled}
              onCheckedChange={(checked) => setConfig({ ...config, hipaa_enabled: checked })}
            />
          </div>

          <Button onClick={handleSave} disabled={isSaving} className="w-full">
            {isSaving ? t('settings.agency.saving') : t('settings.agency.save')}
          </Button>
        </CardContent>
      </Card>

      {/* Zone Danger */}
      <Card className="glass-card border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <Trash2 className="w-5 h-5" />
            {t('settings.agency.dangerZone')}
          </CardTitle>
          <CardDescription>{t('settings.agency.dangerDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" className="w-full">
            {t('settings.agency.deleteAgency')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
