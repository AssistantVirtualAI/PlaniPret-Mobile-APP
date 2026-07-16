import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Palette, Globe, Mail, Lock, Shield, Eye } from 'lucide-react';
import { ImageUploader } from '@/components/saas/ImageUploader';
import { useOrganization } from '@/context/OrganizationContext';
import { useBillingConfig } from '@/hooks/useBillingConfig';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { BrandingPreview } from './BrandingPreview';

const colorPresets = [
  { name: 'Violet', value: '#8B5CF6' },
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Green', value: '#10B981' },
  { name: 'Orange', value: '#F59E0B' },
  { name: 'Red', value: '#EF4444' },
  { name: 'Pink', value: '#EC4899' },
];

const loadingIcons = [
  { name: 'Infinity', value: 'infinity' },
  { name: 'Spinner', value: 'spinner' },
  { name: 'Dots', value: 'dots' },
  { name: 'Pulse', value: 'pulse' },
];

interface WhiteLabelConfig {
  favicon_url: string;
  logo_url: string;
  website_title: string;
  primary_color: string;
  loading_icon: string;
  loading_icon_size: string;
  domain: string;
  backend_domain: string;
  email_domain: string;
  email_sender: string;
  email_sender_name: string;
  email_logo_url: string;
  // Client portal overrides
  client_portal_primary_color: string;
  client_portal_logo_url: string;
  client_portal_favicon_url: string;
  client_portal_title: string;
}

interface PlatformBranding {
  id?: string;
  primary_color: string;
  logo_url: string;
  favicon_url: string;
  website_title: string;
  client_portal_primary_color: string;
  client_portal_logo_url: string;
  client_portal_favicon_url: string;
  client_portal_title: string;
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-16 h-10 p-1 cursor-pointer"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-32 font-mono"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {colorPresets.map((preset) => (
          <Button
            key={preset.value}
            variant="outline"
            size="sm"
            onClick={() => onChange(preset.value)}
            className="gap-2"
            type="button"
          >
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: preset.value }} />
            {preset.name}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function WhiteLabelTab() {
  const { selectedOrgId, refreshOrganization, isSuperAdmin } = useOrganization();
  const { currentPlan } = useBillingConfig();
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingPlatform, setIsSavingPlatform] = useState(false);

  const [config, setConfig] = useState<WhiteLabelConfig>({
    favicon_url: '',
    logo_url: '',
    website_title: '',
    primary_color: '#8B5CF6',
    loading_icon: 'infinity',
    loading_icon_size: 'md',
    domain: '',
    backend_domain: '',
    email_domain: '',
    email_sender: '',
    email_sender_name: '',
    email_logo_url: '',
    client_portal_primary_color: '',
    client_portal_logo_url: '',
    client_portal_favicon_url: '',
    client_portal_title: '',
  });

  const [platform, setPlatform] = useState<PlatformBranding>({
    primary_color: '#8B5CF6',
    logo_url: '',
    favicon_url: '',
    website_title: '',
    client_portal_primary_color: '',
    client_portal_logo_url: '',
    client_portal_favicon_url: '',
    client_portal_title: '',
  });

  useEffect(() => {
    if (selectedOrgId) loadOrgData();
  }, [selectedOrgId]);

  useEffect(() => {
    if (isSuperAdmin) loadPlatformBranding();
  }, [isSuperAdmin]);

  const loadOrgData = async () => {
    if (!selectedOrgId) return;
    const { data, error } = await supabase
      .from('organizations')
      .select('id,favicon_url,logo_url,website_title,primary_color,loading_icon,loading_icon_size,domain,email_domain,email_sender,email_sender_name,email_logo_url,client_portal_primary_color,client_portal_logo_url,client_portal_favicon_url,client_portal_title')
      .eq('id', selectedOrgId)
      .single();

    if (!error && data) {
      setConfig({
        favicon_url: data.favicon_url || '',
        logo_url: data.logo_url || '',
        website_title: data.website_title || '',
        primary_color: data.primary_color || '#8B5CF6',
        loading_icon: data.loading_icon || 'infinity',
        loading_icon_size: data.loading_icon_size || 'md',
        domain: data.domain || '',
        backend_domain: '',
        email_domain: data.email_domain || '',
        email_sender: data.email_sender || '',
        email_sender_name: data.email_sender_name || '',
        email_logo_url: data.email_logo_url || '',
        client_portal_primary_color: (data as any).client_portal_primary_color || '',
        client_portal_logo_url: (data as any).client_portal_logo_url || '',
        client_portal_favicon_url: (data as any).client_portal_favicon_url || '',
        client_portal_title: (data as any).client_portal_title || '',
      });
    }
  };

  const loadPlatformBranding = async () => {
    const { data } = await supabase.from('platform_branding').select('*').limit(1).maybeSingle();
    if (data) {
      setPlatform({
        id: (data as any).id,
        primary_color: (data as any).primary_color || '#8B5CF6',
        logo_url: (data as any).logo_url || '',
        favicon_url: (data as any).favicon_url || '',
        website_title: (data as any).website_title || '',
        client_portal_primary_color: (data as any).client_portal_primary_color || '',
        client_portal_logo_url: (data as any).client_portal_logo_url || '',
        client_portal_favicon_url: (data as any).client_portal_favicon_url || '',
        client_portal_title: (data as any).client_portal_title || '',
      });
    }
  };

  const isGrowthOrHigher = ['growth', 'ultimate'].includes(currentPlan?.id || '');
  const isUltimatePlan = currentPlan?.id === 'ultimate';

  const handleSave = async () => {
    if (!selectedOrgId) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from('organizations').update(config).eq('id', selectedOrgId);
      if (error) throw error;
      toast.success('Configuration saved');
      refreshOrganization();
    } catch (error: any) {
      toast.error(error.message || 'Error saving');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePlatform = async () => {
    setIsSavingPlatform(true);
    try {
      const payload = {
        primary_color: platform.primary_color || null,
        logo_url: platform.logo_url || null,
        favicon_url: platform.favicon_url || null,
        website_title: platform.website_title || null,
        client_portal_primary_color: platform.client_portal_primary_color || null,
        client_portal_logo_url: platform.client_portal_logo_url || null,
        client_portal_favicon_url: platform.client_portal_favicon_url || null,
        client_portal_title: platform.client_portal_title || null,
      };
      if (platform.id) {
        const { error } = await supabase
          .from('platform_branding')
          .update(payload)
          .eq('id', platform.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('platform_branding')
          .insert({ ...payload, singleton: true })
          .select()
          .single();
        if (error) throw error;
        setPlatform((p) => ({ ...p, id: (data as any).id }));
      }
      toast.success('Global white label saved');
    } catch (error: any) {
      toast.error(error.message || 'Error saving');
    } finally {
      setIsSavingPlatform(false);
    }
  };

  // Effective preview values (org override → falls back to platform)
  const adminPreviewColor = config.primary_color || platform.primary_color || '#8B5CF6';
  const adminPreviewLogo = config.logo_url || platform.logo_url || undefined;
  const adminPreviewTitle = config.website_title || platform.website_title || 'Admin Portal';

  const clientPreviewColor =
    config.client_portal_primary_color ||
    platform.client_portal_primary_color ||
    config.primary_color ||
    platform.primary_color ||
    '#8B5CF6';
  const clientPreviewLogo =
    config.client_portal_logo_url ||
    platform.client_portal_logo_url ||
    config.logo_url ||
    platform.logo_url ||
    undefined;
  const clientPreviewTitle =
    config.client_portal_title ||
    platform.client_portal_title ||
    config.website_title ||
    'Client Portal';

  return (
    <div className="space-y-6">
      {/* Super Admin: Platform-wide branding */}
      {isSuperAdmin && (
        <Card className="glass-card border-primary/30">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle>Global White Label (Super Admin)</CardTitle>
                <CardDescription>
                  Sets the default branding for the entire platform. Each organization can override it.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <Tabs defaultValue="admin">
              <TabsList>
                <TabsTrigger value="admin">Admin Portal</TabsTrigger>
                <TabsTrigger value="client">Client Portal</TabsTrigger>
              </TabsList>
              <TabsContent value="admin" className="space-y-4 pt-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <ImageUploader
                    label="Logo"
                    currentUrl={platform.logo_url}
                    organizationId={selectedOrgId || ''}
                    folder="platform"
                    onUpload={(url) => setPlatform({ ...platform, logo_url: url })}
                    onRemove={() => setPlatform({ ...platform, logo_url: '' })}
                    aspectRatio="wide"
                  />
                  <ImageUploader
                    label="Favicon"
                    currentUrl={platform.favicon_url}
                    organizationId={selectedOrgId || ''}
                    folder="platform"
                    onUpload={(url) => setPlatform({ ...platform, favicon_url: url })}
                    onRemove={() => setPlatform({ ...platform, favicon_url: '' })}
                    aspectRatio="favicon"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Site Title</Label>
                  <Input
                    value={platform.website_title}
                    onChange={(e) => setPlatform({ ...platform, website_title: e.target.value })}
                    placeholder="My Platform"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Primary Color</Label>
                  <ColorPicker
                    value={platform.primary_color}
                    onChange={(v) => setPlatform({ ...platform, primary_color: v })}
                  />
                </div>
              </TabsContent>
              <TabsContent value="client" className="space-y-4 pt-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <ImageUploader
                    label="Client portal logo"
                    currentUrl={platform.client_portal_logo_url}
                    organizationId={selectedOrgId || ''}
                    folder="platform"
                    onUpload={(url) => setPlatform({ ...platform, client_portal_logo_url: url })}
                    onRemove={() => setPlatform({ ...platform, client_portal_logo_url: '' })}
                    aspectRatio="wide"
                  />
                  <ImageUploader
                    label="Client portal favicon"
                    currentUrl={platform.client_portal_favicon_url}
                    organizationId={selectedOrgId || ''}
                    folder="platform"
                    onUpload={(url) => setPlatform({ ...platform, client_portal_favicon_url: url })}
                    onRemove={() => setPlatform({ ...platform, client_portal_favicon_url: '' })}
                    aspectRatio="favicon"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Client portal title</Label>
                  <Input
                    value={platform.client_portal_title}
                    onChange={(e) => setPlatform({ ...platform, client_portal_title: e.target.value })}
                    placeholder="Client Area"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Client portal color</Label>
                  <ColorPicker
                    value={platform.client_portal_primary_color || platform.primary_color}
                    onChange={(v) => setPlatform({ ...platform, client_portal_primary_color: v })}
                  />
                </div>
              </TabsContent>
            </Tabs>
            <Button onClick={handleSavePlatform} disabled={isSavingPlatform} className="w-full">
              {isSavingPlatform ? 'Saving...' : 'Save global branding'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Per-organization branding */}
      <Card className="glass-card">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent to-secondary flex items-center justify-center">
              <Palette className="w-6 h-6 text-white" />
            </div>
            <div>
              <CardTitle>White Label</CardTitle>
              <CardDescription>Customize the appearance for your organization</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <Tabs defaultValue="admin">
            <TabsList>
              <TabsTrigger value="admin">Admin Portal</TabsTrigger>
              <TabsTrigger value="client">Client Portal</TabsTrigger>
            </TabsList>

            <TabsContent value="admin" className="space-y-6 pt-4">
              <div className="grid md:grid-cols-2 gap-4">
                <ImageUploader
                  label="Logo"
                  currentUrl={config.logo_url}
                  organizationId={selectedOrgId || ''}
                  folder="branding"
                  onUpload={(url) => setConfig({ ...config, logo_url: url })}
                  onRemove={() => setConfig({ ...config, logo_url: '' })}
                  aspectRatio="wide"
                />
                <ImageUploader
                  label="Favicon"
                  currentUrl={config.favicon_url}
                  organizationId={selectedOrgId || ''}
                  folder="branding"
                  onUpload={(url) => setConfig({ ...config, favicon_url: url })}
                  onRemove={() => setConfig({ ...config, favicon_url: '' })}
                  aspectRatio="favicon"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="websiteTitle">Website Title</Label>
                <Input
                  id="websiteTitle"
                  value={config.website_title}
                  onChange={(e) => setConfig({ ...config, website_title: e.target.value })}
                  placeholder="My Application"
                />
              </div>

              <div className="space-y-2">
                <Label>Primary Color</Label>
                <ColorPicker
                  value={config.primary_color}
                  onChange={(v) => setConfig({ ...config, primary_color: v })}
                />
              </div>
            </TabsContent>

            <TabsContent value="client" className="space-y-6 pt-4">
              <p className="text-sm text-muted-foreground">
                Customize the portal appearance your clients see. Empty fields fall back to the
                admin portal brand.
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <ImageUploader
                  label="Client portal logo"
                  currentUrl={config.client_portal_logo_url}
                  organizationId={selectedOrgId || ''}
                  folder="client-branding"
                  onUpload={(url) => setConfig({ ...config, client_portal_logo_url: url })}
                  onRemove={() => setConfig({ ...config, client_portal_logo_url: '' })}
                  aspectRatio="wide"
                />
                <ImageUploader
                  label="Client portal favicon"
                  currentUrl={config.client_portal_favicon_url}
                  organizationId={selectedOrgId || ''}
                  folder="client-branding"
                  onUpload={(url) => setConfig({ ...config, client_portal_favicon_url: url })}
                  onRemove={() => setConfig({ ...config, client_portal_favicon_url: '' })}
                  aspectRatio="favicon"
                />
              </div>

              <div className="space-y-2">
                <Label>Client portal title</Label>
                <Input
                  value={config.client_portal_title}
                  onChange={(e) => setConfig({ ...config, client_portal_title: e.target.value })}
                  placeholder="Client Area"
                />
              </div>

              <div className="space-y-2">
                <Label>Client portal color</Label>
                <ColorPicker
                  value={config.client_portal_primary_color || config.primary_color}
                  onChange={(v) => setConfig({ ...config, client_portal_primary_color: v })}
                />
              </div>
            </TabsContent>
          </Tabs>

          <Separator />

          {/* Loading Icon */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Loading icon</Label>
              <Select
                value={config.loading_icon}
                onValueChange={(value) => setConfig({ ...config, loading_icon: value })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {loadingIcons.map((icon) => (
                    <SelectItem key={icon.value} value={icon.value}>{icon.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Icon size</Label>
              <Select
                value={config.loading_icon_size}
                onValueChange={(value) => setConfig({ ...config, loading_icon_size: value })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sm">Small</SelectItem>
                  <SelectItem value="md">Medium</SelectItem>
                  <SelectItem value="lg">Large</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Live preview */}
      <Card className="glass-card">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Eye className="w-6 h-6 text-primary" />
            <div>
              <CardTitle>Live preview</CardTitle>
              <CardDescription>
                Preview how portals will look with your current settings.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Admin Portal</div>
              <BrandingPreview
                surface="admin"
                primaryColor={adminPreviewColor}
                logoUrl={adminPreviewLogo}
                title={adminPreviewTitle}
              />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Client Portal</div>
              <BrandingPreview
                surface="client"
                primaryColor={clientPreviewColor}
                logoUrl={clientPreviewLogo}
                title={clientPreviewTitle}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Domains */}
      <Card className="glass-card">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Globe className="w-6 h-6 text-primary" />
            <div>
              <CardTitle>Custom domains</CardTitle>
              <CardDescription>Configure your domains</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="frontendDomain">Frontend domain</Label>
            <Input
              id="frontendDomain"
              value={config.domain}
              onChange={(e) => setConfig({ ...config, domain: e.target.value })}
              placeholder="app.yourdomain.com"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="backendDomain">Backend domain</Label>
              {!isUltimatePlan && (
                <Badge variant="secondary" className="text-xs">
                  <Lock className="w-3 h-3 mr-1" />Plan Ultimate
                </Badge>
              )}
            </div>
            <Input
              id="backendDomain"
              value={config.backend_domain}
              onChange={(e) => setConfig({ ...config, backend_domain: e.target.value })}
              placeholder="api.yourdomain.com"
              disabled={!isUltimatePlan}
            />
          </div>
        </CardContent>
      </Card>

      {/* Email Whitelabeling */}
      <Card className="glass-card">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Mail className="w-6 h-6 text-primary" />
            <div className="flex items-center gap-2">
              <CardTitle>Email Whitelabeling</CardTitle>
              {!isGrowthOrHigher && (
                <Badge variant="secondary" className="text-xs">
                  <Lock className="w-3 h-3 mr-1" />Plan Growth+
                </Badge>
              )}
            </div>
          </div>
          <CardDescription>Customize emails sent to your clients</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Sending domain</Label>
              <Input
                value={config.email_domain}
                onChange={(e) => setConfig({ ...config, email_domain: e.target.value })}
                placeholder="mail.yourdomain.com"
                disabled={!isGrowthOrHigher}
              />
            </div>
            <div className="space-y-2">
              <Label>Sender address</Label>
              <Input
                value={config.email_sender}
                onChange={(e) => setConfig({ ...config, email_sender: e.target.value })}
                placeholder="noreply@yourdomain.com"
                disabled={!isGrowthOrHigher}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Sender name</Label>
            <Input
              value={config.email_sender_name}
              onChange={(e) => setConfig({ ...config, email_sender_name: e.target.value })}
              placeholder="Your Company"
              disabled={!isGrowthOrHigher}
            />
          </div>

          <ImageUploader
            label="Logo Email"
            currentUrl={config.email_logo_url}
            organizationId={selectedOrgId || ''}
            folder="email"
            onUpload={(url) => setConfig({ ...config, email_logo_url: url })}
            onRemove={() => setConfig({ ...config, email_logo_url: '' })}
            aspectRatio="wide"
          />

          {isGrowthOrHigher && (
            <Button variant="outline" onClick={() => navigate('/email-templates')}>
              Manage email templates
            </Button>
          )}
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={isSaving} className="w-full">
        {isSaving ? 'Saving...' : 'Save changes'}
      </Button>
    </div>
  );
}
