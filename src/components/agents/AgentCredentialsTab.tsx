import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Key, Save, Eye, EyeOff, RefreshCw, CheckCircle, ExternalLink } from 'lucide-react';
import { AgentSettings } from '@/hooks/useAgentSettings';
import { ElevenLabsEndpointsCard } from '@/components/elevenlabs/ElevenLabsEndpointsCard';

interface Integration {
  id: string;
  platform: string;
  api_key: string;
  agent_id: string | null;
}

interface AgentCredentialsTabProps {
  agent: AgentSettings;
  integration?: Integration | null;
  onUpdate: (updates: Partial<AgentSettings>) => void;
  onTestConnection: () => void;
  isUpdating: boolean;
  isTesting: boolean;
}

export const AgentCredentialsTab = ({ 
  agent, 
  integration,
  onUpdate, 
  onTestConnection,
  isUpdating,
  isTesting 
}: AgentCredentialsTabProps) => {
  const [showApiKey, setShowApiKey] = useState(false);
  
  // Get agent ID from config or platform_agent_id as fallback
  const config = (agent.config || {}) as Record<string, any>;
  const currentAgentId = config.agent_id || agent.platform_agent_id || '';
  
  const [formData, setFormData] = useState({
    agent_id: currentAgentId,
  });
  
  const [dataSyncEnabled, setDataSyncEnabled] = useState(config.data_sync_enabled || false);
  const [syncInterval, setSyncInterval] = useState(config.sync_interval || '15min');

  // API Key comes from integration (read-only)
  const apiKey = integration?.api_key || '';

  const handleSave = () => {
    onUpdate({
      config: {
        ...config,
        agent_id: formData.agent_id,
        data_sync_enabled: dataSyncEnabled,
        sync_interval: syncInterval,
      },
    });
  };

  const maskApiKey = (key: string) => {
    if (!key) return '';
    if (key.length <= 8) return '••••••••';
    return key.substring(0, 4) + '••••••••' + key.substring(key.length - 4);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Credentials
          </CardTitle>
          <CardDescription>
            Configurez les identifiants de connexion à la plateforme {agent.platform}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="api_key">API Key</Label>
              {integration && (
                <Badge variant="secondary" className="text-xs">
                  Via Intégration {integration.platform}
                </Badge>
              )}
            </div>
            {integration ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="api_key"
                      type={showApiKey ? 'text' : 'password'}
                      value={showApiKey ? apiKey : maskApiKey(apiKey)}
                      readOnly
                      className="pr-10 bg-muted"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowApiKey(!showApiKey)}
                    >
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Cette clé API provient de votre intégration {integration.platform}.{' '}
                  <Link to="/integrations" className="text-primary hover:underline inline-flex items-center gap-1">
                    Modifier dans Intégrations
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </p>
              </div>
            ) : (
              <div className="p-3 border border-dashed rounded-md bg-muted/50">
                <p className="text-sm text-muted-foreground">
                  Aucune intégration liée.{' '}
                  <Link to="/integrations" className="text-primary hover:underline">
                    Configurer une intégration
                  </Link>
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="agent_id">Agent ID</Label>
            <Input
              id="agent_id"
              value={formData.agent_id}
              onChange={(e) => setFormData({ ...formData, agent_id: e.target.value })}
              placeholder="ID de l'agent sur la plateforme"
            />
            <p className="text-xs text-muted-foreground">
              L'identifiant unique de votre agent sur {agent.platform}
            </p>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={isUpdating}>
              <Save className="h-4 w-4 mr-2" />
              Enregistrer
            </Button>
            <Button 
              variant="outline" 
              onClick={onTestConnection}
              disabled={isTesting || !apiKey}
            >
              {isTesting ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Tester la connexion
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data Sync</CardTitle>
          <CardDescription>
            Synchronisation automatique des transcriptions et données
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Auto-sync transcriptions</Label>
              <p className="text-sm text-muted-foreground">
                Synchroniser automatiquement les nouvelles conversations
              </p>
            </div>
            <Switch
              checked={dataSyncEnabled}
              onCheckedChange={setDataSyncEnabled}
            />
          </div>

          {dataSyncEnabled && (
            <div className="space-y-2">
              <Label>Intervalle de synchronisation</Label>
              <Select value={syncInterval} onValueChange={setSyncInterval}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5min">Toutes les 5 minutes</SelectItem>
                  <SelectItem value="15min">Toutes les 15 minutes</SelectItem>
                  <SelectItem value="30min">Toutes les 30 minutes</SelectItem>
                  <SelectItem value="1h">Toutes les heures</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <Button onClick={handleSave} disabled={isUpdating}>
            <Save className="h-4 w-4 mr-2" />
            Enregistrer les paramètres
          </Button>
        </CardContent>
      </Card>

      {/* ElevenLabs Endpoints */}
      {agent.platform === 'elevenlabs' && (
        <ElevenLabsEndpointsCard 
          agentId={formData.agent_id || undefined}
          apiKey={apiKey || undefined}
          showAllEndpoints
        />
      )}
    </div>
  );
};
