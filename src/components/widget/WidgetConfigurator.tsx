import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare } from 'lucide-react';

export interface WidgetConfig {
  position: 'bottom-right' | 'bottom-left';
  primaryColor: string;
  welcomeMessage: string;
  agentName: string;
  agentAvatar?: string;
}

interface WidgetConfiguratorProps {
  config: WidgetConfig;
  onChange: (config: WidgetConfig) => void;
}

export const WidgetConfigurator = ({ config, onChange }: WidgetConfiguratorProps) => {
  const updateConfig = (key: keyof WidgetConfig, value: string) => {
    onChange({ ...config, [key]: value });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Configuration Form */}
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader>
          <CardTitle>Configuration du Widget</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Position</Label>
            <Select
              value={config.position}
              onValueChange={(v) => updateConfig('position', v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bottom-right">Bas droite</SelectItem>
                <SelectItem value="bottom-left">Bas gauche</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Couleur principale</Label>
            <div className="flex gap-2">
              <Input
                type="color"
                value={config.primaryColor}
                onChange={(e) => updateConfig('primaryColor', e.target.value)}
                className="w-14 h-10 p-1"
              />
              <Input
                value={config.primaryColor}
                onChange={(e) => updateConfig('primaryColor', e.target.value)}
                placeholder="#8B5CF6"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Nom de l'agent</Label>
            <Input
              value={config.agentName}
              onChange={(e) => updateConfig('agentName', e.target.value)}
              placeholder="Assistant IA"
            />
          </div>

          <div className="space-y-2">
            <Label>Message d'accueil</Label>
            <Textarea
              value={config.welcomeMessage}
              onChange={(e) => updateConfig('welcomeMessage', e.target.value)}
              placeholder="Bonjour ! Comment puis-je vous aider ?"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>URL Avatar (optionnel)</Label>
            <Input
              value={config.agentAvatar || ''}
              onChange={(e) => updateConfig('agentAvatar', e.target.value)}
              placeholder="https://example.com/avatar.png"
            />
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader>
          <CardTitle>Aperçu</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative h-[400px] bg-muted/30 rounded-lg overflow-hidden">
            {/* Simulated website */}
            <div className="absolute inset-0 p-4">
              <div className="h-4 w-32 bg-muted rounded mb-4" />
              <div className="h-2 w-full bg-muted/50 rounded mb-2" />
              <div className="h-2 w-3/4 bg-muted/50 rounded mb-2" />
              <div className="h-2 w-5/6 bg-muted/50 rounded" />
            </div>

            {/* Widget button */}
            <div
              className={`absolute bottom-4 ${
                config.position === 'bottom-right' ? 'right-4' : 'left-4'
              }`}
            >
              <button
                className="w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-110"
                style={{ backgroundColor: config.primaryColor }}
              >
                <MessageSquare className="h-6 w-6 text-white" />
              </button>
            </div>

            {/* Widget popup preview */}
            <div
              className={`absolute bottom-20 ${
                config.position === 'bottom-right' ? 'right-4' : 'left-4'
              } w-80 bg-card rounded-lg shadow-xl border border-border overflow-hidden`}
            >
              <div
                className="p-4 text-white"
                style={{ backgroundColor: config.primaryColor }}
              >
                <div className="flex items-center gap-3">
                  {config.agentAvatar ? (
                    <img
                      src={config.agentAvatar}
                      alt="Agent"
                      className="w-10 h-10 rounded-full"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                      <MessageSquare className="h-5 w-5" />
                    </div>
                  )}
                  <div>
                    <p className="font-semibold">{config.agentName || 'Assistant'}</p>
                    <p className="text-xs opacity-80">En ligne</p>
                  </div>
                </div>
              </div>
              <div className="p-4">
                <div className="bg-muted/50 rounded-lg p-3 text-sm">
                  {config.welcomeMessage || 'Bonjour ! Comment puis-je vous aider ?'}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
