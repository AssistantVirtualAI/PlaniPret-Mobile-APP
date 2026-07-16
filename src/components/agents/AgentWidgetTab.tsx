import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Palette, Save, Upload, Image } from 'lucide-react';
import { AgentSettings } from '@/hooks/useAgentSettings';

interface AgentWidgetTabProps {
  agent: AgentSettings;
  onUpdate: (updates: Partial<AgentSettings>) => void;
  isUpdating: boolean;
}

export const AgentWidgetTab = ({ agent, onUpdate, isUpdating }: AgentWidgetTabProps) => {
  const [formData, setFormData] = useState({
    avatar_url: agent.avatar_url || '',
    widget_layout: agent.widget_layout || 'original',
    description: agent.description || '',
    branding_url: agent.branding_url || '',
  });

  const [themeConfig, setThemeConfig] = useState({
    primaryColor: (agent.theme_config as any)?.primaryColor || '#8B5CF6',
    secondaryColor: (agent.theme_config as any)?.secondaryColor || '#06b6d4',
    textColor: (agent.theme_config as any)?.textColor || '#ffffff',
    borderRadius: (agent.theme_config as any)?.borderRadius || '8',
  });

  const handleSave = () => {
    onUpdate({
      avatar_url: formData.avatar_url,
      widget_layout: formData.widget_layout,
      description: formData.description,
      branding_url: formData.branding_url,
      theme_config: themeConfig,
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Image className="h-5 w-5" />
            Avatar & Apparence
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="avatar">URL de l'avatar</Label>
            <div className="flex gap-2">
              <Input
                id="avatar"
                value={formData.avatar_url}
                onChange={(e) => setFormData({ ...formData, avatar_url: e.target.value })}
                placeholder="https://exemple.com/avatar.png"
              />
              <Button variant="outline" disabled>
                <Upload className="h-4 w-4" />
              </Button>
            </div>
            {formData.avatar_url && (
              <div className="mt-2">
                <img 
                  src={formData.avatar_url} 
                  alt="Avatar preview" 
                  className="h-16 w-16 rounded-full object-cover border"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Disposition du widget</Label>
            <Select
              value={formData.widget_layout}
              onValueChange={(value) => setFormData({ ...formData, widget_layout: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="original">Original</SelectItem>
                <SelectItem value="minimal">Minimal</SelectItem>
                <SelectItem value="full">Full</SelectItem>
                <SelectItem value="compact">Compact</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Description de l'agent affichée aux utilisateurs..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="branding">Image de marque (URL)</Label>
            <Input
              id="branding"
              value={formData.branding_url}
              onChange={(e) => setFormData({ ...formData, branding_url: e.target.value })}
              placeholder="https://exemple.com/logo.png"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Thème
          </CardTitle>
          <CardDescription>
            Personnalisez les couleurs du widget
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Couleur primaire</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={themeConfig.primaryColor}
                  onChange={(e) => setThemeConfig({ ...themeConfig, primaryColor: e.target.value })}
                  className="w-12 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={themeConfig.primaryColor}
                  onChange={(e) => setThemeConfig({ ...themeConfig, primaryColor: e.target.value })}
                  className="font-mono"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Couleur secondaire</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={themeConfig.secondaryColor}
                  onChange={(e) => setThemeConfig({ ...themeConfig, secondaryColor: e.target.value })}
                  className="w-12 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={themeConfig.secondaryColor}
                  onChange={(e) => setThemeConfig({ ...themeConfig, secondaryColor: e.target.value })}
                  className="font-mono"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Couleur du texte</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={themeConfig.textColor}
                  onChange={(e) => setThemeConfig({ ...themeConfig, textColor: e.target.value })}
                  className="w-12 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={themeConfig.textColor}
                  onChange={(e) => setThemeConfig({ ...themeConfig, textColor: e.target.value })}
                  className="font-mono"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Border radius (px)</Label>
              <Input
                type="number"
                value={themeConfig.borderRadius}
                onChange={(e) => setThemeConfig({ ...themeConfig, borderRadius: e.target.value })}
                min="0"
                max="24"
              />
            </div>
          </div>

          <div className="p-4 border rounded-lg" style={{ 
            backgroundColor: themeConfig.primaryColor + '20',
            borderRadius: `${themeConfig.borderRadius}px`
          }}>
            <p className="text-sm text-muted-foreground mb-2">Aperçu du thème</p>
            <div 
              className="p-3 text-sm"
              style={{ 
                backgroundColor: themeConfig.primaryColor,
                color: themeConfig.textColor,
                borderRadius: `${themeConfig.borderRadius}px`
              }}
            >
              Message de l'agent
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={isUpdating} className="w-full">
        <Save className="h-4 w-4 mr-2" />
        Enregistrer les modifications
      </Button>
    </div>
  );
};
