import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building, Building2, Palette, Users, Plug, Webhook, CreditCard, BarChart3, Languages, Shield, FileText, BookOpen, KeySquare, Download } from 'lucide-react';
import { OrganizationsTab } from '@/components/settings/OrganizationsTab';
import { AgencyTab } from '@/components/settings/AgencyTab';
import { WhiteLabelTab } from '@/components/settings/WhiteLabelTab';
import { MembersTab } from '@/components/settings/MembersTab';
import { IntegrationsTab } from '@/components/settings/IntegrationsTab';
import { WebhooksTab } from '@/components/settings/WebhooksTab';
import { SubscriptionTab } from '@/components/settings/SubscriptionTab';
import { UsageTab } from '@/components/settings/UsageTab';
import { TranslationTab } from '@/components/settings/TranslationTab';
import { PrivacyTab } from '@/components/settings/PrivacyTab';
import { AuditLogsTab } from '@/components/settings/AuditLogsTab';
import { SecurityStatus } from '@/components/settings/SecurityStatus';
import { DocumentationTab } from '@/components/settings/DocumentationTab';
import { useTranslation } from '@/hooks/useTranslation';
import { RolesPermissionsTab } from '@/components/settings/RolesPermissionsTab';
import { SecurityAuditTab } from '@/components/settings/SecurityAuditTab';
import { DataExportTab } from '@/components/settings/DataExportTab';
import { usePermissions } from '@/hooks/usePermissions';

const Settings = () => {
  const { t } = useTranslation();
  const { can, role, isSuperAdmin } = usePermissions();

  const canSeeAdminTabs = isSuperAdmin || role === 'org_admin' || role === 'manager' || can('manage:organization') || can('manage:roles');
  const canSeeExports = isSuperAdmin || role === 'org_admin';

  return (
    <AppLayout>
      <div className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 gradient-text">{t('settings.title')}</h1>
          <p className="text-muted-foreground text-lg">
            {t('settings.description')}
          </p>
        </div>

        <Tabs defaultValue="agency" className="space-y-6">
          <TabsList className="glass-card flex-wrap h-auto gap-1 p-2">
            <TabsTrigger value="agency" className="gap-2">
              <Building className="w-4 h-4" />
              <span className="hidden sm:inline">{t('settings.tabs.agency')}</span>
            </TabsTrigger>
            {isSuperAdmin && (
              <TabsTrigger value="organizations" className="gap-2">
                <Building2 className="w-4 h-4" />
                <span className="hidden sm:inline">{t('settings.tabs.organizations')}</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="whitelabel" className="gap-2">
              <Palette className="w-4 h-4" />
              <span className="hidden sm:inline">{t('settings.tabs.whitelabel')}</span>
            </TabsTrigger>
            <TabsTrigger value="members" className="gap-2">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">{t('settings.tabs.members')}</span>
            </TabsTrigger>
            <TabsTrigger value="integrations" className="gap-2">
              <Plug className="w-4 h-4" />
              <span className="hidden sm:inline">{t('settings.tabs.integrations')}</span>
            </TabsTrigger>
            <TabsTrigger value="webhooks" className="gap-2">
              <Webhook className="w-4 h-4" />
              <span className="hidden sm:inline">{t('settings.tabs.webhooks')}</span>
            </TabsTrigger>
            <TabsTrigger value="subscription" className="gap-2">
              <CreditCard className="w-4 h-4" />
              <span className="hidden sm:inline">{t('settings.tabs.subscription')}</span>
            </TabsTrigger>
            <TabsTrigger value="usage" className="gap-2">
              <BarChart3 className="w-4 h-4" />
              <span className="hidden sm:inline">{t('settings.tabs.usage')}</span>
            </TabsTrigger>
            <TabsTrigger value="translation" className="gap-2">
              <Languages className="w-4 h-4" />
              <span className="hidden sm:inline">{t('settings.tabs.translation')}</span>
            </TabsTrigger>
            <TabsTrigger value="privacy" className="gap-2">
              <Shield className="w-4 h-4" />
              <span className="hidden sm:inline">{t('settings.tabs.privacy')}</span>
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-2">
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">{t('settings.tabs.audit')}</span>
            </TabsTrigger>
            <TabsTrigger value="documentation" className="gap-2">
              <BookOpen className="w-4 h-4" />
              <span className="hidden sm:inline">{t('settings.tabs.documentation')}</span>
            </TabsTrigger>

            {canSeeAdminTabs && (
              <TabsTrigger value="roles" className="gap-2">
                <KeySquare className="w-4 h-4" />
                <span className="hidden sm:inline">{t('settings.tabs.roles')}</span>
              </TabsTrigger>
            )}
            {canSeeAdminTabs && (
              <TabsTrigger value="securityAudit" className="gap-2">
                <Shield className="w-4 h-4" />
                <span className="hidden sm:inline">{t('settings.tabs.securityAudit')}</span>
              </TabsTrigger>
            )}
            {canSeeExports && (
              <TabsTrigger value="exports" className="gap-2">
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">{t('settings.tabs.exports')}</span>
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="agency"><AgencyTab /></TabsContent>
          {isSuperAdmin && <TabsContent value="organizations"><OrganizationsTab /></TabsContent>}
          <TabsContent value="whitelabel"><WhiteLabelTab /></TabsContent>
          <TabsContent value="members"><MembersTab /></TabsContent>
          <TabsContent value="integrations"><IntegrationsTab /></TabsContent>
          <TabsContent value="webhooks"><WebhooksTab /></TabsContent>
          <TabsContent value="subscription"><SubscriptionTab /></TabsContent>
          <TabsContent value="usage"><UsageTab /></TabsContent>
          <TabsContent value="translation"><TranslationTab /></TabsContent>
          <TabsContent value="privacy">
            <div className="space-y-6">
              <SecurityStatus />
              <PrivacyTab />
            </div>
          </TabsContent>
          <TabsContent value="audit"><AuditLogsTab /></TabsContent>
          <TabsContent value="documentation"><DocumentationTab /></TabsContent>

          {canSeeAdminTabs && <TabsContent value="roles"><RolesPermissionsTab /></TabsContent>}
          {canSeeAdminTabs && <TabsContent value="securityAudit"><SecurityAuditTab /></TabsContent>}
          {canSeeExports && <TabsContent value="exports"><DataExportTab /></TabsContent>}
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Settings;