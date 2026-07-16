import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useAgentMCPServers, MCPServerInput, MCPTool } from '@/hooks/useAgentMCPServers';
import { useTranslation } from '@/hooks/useTranslation';
import { 
  Plus, 
  Server, 
  Trash2, 
  Settings, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  Wrench,
  ExternalLink,
  RefreshCw,
  Shield
} from 'lucide-react';

interface AgentMCPConfigTabProps {
  agentId: string;
}

export function AgentMCPConfigTab({ agentId }: AgentMCPConfigTabProps) {
  const { t } = useTranslation();
  const { mcpServers, isLoading, addMCPServer, updateMCPServer, deleteMCPServer, toggleMCPServer, testConnection, listTools } = useAgentMCPServers(agentId);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [showToolsModal, setShowToolsModal] = useState(false);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [loadingTools, setLoadingTools] = useState(false);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const [connectionResults, setConnectionResults] = useState<Record<string, { success: boolean; error?: string }>>({});

  const [formData, setFormData] = useState<MCPServerInput>({
    name: '',
    description: '',
    server_url: '',
    server_type: 'http',
    auth_type: 'none',
    auth_config: {},
    tools_enabled: [],
  });

  const handleAddServer = async () => {
    await addMCPServer.mutateAsync(formData);
    setShowAddModal(false);
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      server_url: '',
      server_type: 'http',
      auth_type: 'none',
      auth_config: {},
      tools_enabled: [],
    });
  };

  const handleTestConnection = async (serverId: string) => {
    setTestingConnection(serverId);
    const result = await testConnection(serverId);
    setConnectionResults(prev => ({ ...prev, [serverId]: result }));
    setTestingConnection(null);
  };

  const handleViewTools = async (serverId: string) => {
    setSelectedServerId(serverId);
    setLoadingTools(true);
    setShowToolsModal(true);
    const fetchedTools = await listTools(serverId);
    setTools(fetchedTools);
    setLoadingTools(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{t('mcp.title')}</h3>
          <p className="text-sm text-muted-foreground">{t('mcp.description')}</p>
        </div>
        <Button onClick={() => setShowAddModal(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          {t('mcp.addServer')}
        </Button>
      </div>

      {/* Empty State */}
      {mcpServers.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Server className="h-12 w-12 text-muted-foreground mb-4" />
            <h4 className="text-lg font-medium mb-2">{t('mcp.noServers')}</h4>
            <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
              {t('mcp.noServersDescription')}
            </p>
            <Button onClick={() => setShowAddModal(true)} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              {t('mcp.addFirstServer')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Server List */}
      <div className="grid gap-4">
        {mcpServers.map((server) => (
          <Card key={server.id} className={!server.is_active ? 'opacity-60' : ''}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${server.is_active ? 'bg-primary/10' : 'bg-muted'}`}>
                    <Server className={`h-5 w-5 ${server.is_active ? 'text-primary' : 'text-muted-foreground'}`} />
                  </div>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {server.name}
                      <Badge variant={server.is_active ? 'default' : 'secondary'}>
                        {server.is_active ? t('common.active') : t('common.inactive')}
                      </Badge>
                      {connectionResults[server.id] && (
                        connectionResults[server.id].success ? (
                          <Badge variant="outline" className="text-green-600 border-green-600">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            {t('mcp.connected')}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-destructive border-destructive">
                            <XCircle className="h-3 w-3 mr-1" />
                            {t('mcp.connectionFailed')}
                          </Badge>
                        )
                      )}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {server.description || server.server_url}
                    </CardDescription>
                  </div>
                </div>
                <Switch
                  checked={server.is_active}
                  onCheckedChange={(checked) => toggleMCPServer.mutate({ id: server.id, is_active: checked })}
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 mb-4">
                <Badge variant="outline">{server.server_type.toUpperCase()}</Badge>
                <Badge variant="outline" className="gap-1">
                  <Shield className="h-3 w-3" />
                  {server.auth_type}
                </Badge>
                {server.tools_enabled.length > 0 && (
                  <Badge variant="secondary">
                    {server.tools_enabled.length} {t('mcp.toolsEnabled')}
                  </Badge>
                )}
              </div>
              
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestConnection(server.id)}
                  disabled={testingConnection === server.id}
                  className="gap-2"
                >
                  {testingConnection === server.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {t('mcp.testConnection')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleViewTools(server.id)}
                  className="gap-2"
                >
                  <Wrench className="h-4 w-4" />
                  {t('mcp.viewTools')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(server.server_url, '_blank')}
                  className="gap-2"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteMCPServer.mutate(server.id)}
                  className="text-destructive hover:text-destructive gap-2 ml-auto"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add Server Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('mcp.addServer')}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('mcp.serverName')}</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="My MCP Server"
              />
            </div>

            <div className="space-y-2">
              <Label>{t('mcp.description')}</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('mcp.serverUrl')}</Label>
              <Input
                value={formData.server_url}
                onChange={(e) => setFormData({ ...formData, server_url: e.target.value })}
                placeholder="https://my-mcp-server.com/mcp"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('mcp.serverType')}</Label>
                <Select
                  value={formData.server_type}
                  onValueChange={(value: 'http' | 'sse' | 'websocket') => setFormData({ ...formData, server_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="http">HTTP</SelectItem>
                    <SelectItem value="sse">SSE (Server-Sent Events)</SelectItem>
                    <SelectItem value="websocket">WebSocket</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('mcp.authType')}</Label>
                <Select
                  value={formData.auth_type}
                  onValueChange={(value: 'none' | 'bearer' | 'api_key' | 'basic') => setFormData({ ...formData, auth_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('mcp.authNone')}</SelectItem>
                    <SelectItem value="bearer">{t('mcp.authBearer')}</SelectItem>
                    <SelectItem value="api_key">{t('mcp.authApiKey')}</SelectItem>
                    <SelectItem value="basic">{t('mcp.authBasic')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formData.auth_type === 'bearer' && (
              <div className="space-y-2">
                <Label>{t('mcp.bearerToken')}</Label>
                <Input
                  type="password"
                  value={formData.auth_config?.token || ''}
                  onChange={(e) => setFormData({ ...formData, auth_config: { token: e.target.value } })}
                  placeholder="Enter bearer token"
                />
              </div>
            )}

            {formData.auth_type === 'api_key' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('mcp.apiKeyHeader')}</Label>
                  <Input
                    value={formData.auth_config?.header || 'X-API-Key'}
                    onChange={(e) => setFormData({ ...formData, auth_config: { ...formData.auth_config, header: e.target.value } })}
                    placeholder="X-API-Key"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('mcp.apiKeyValue')}</Label>
                  <Input
                    type="password"
                    value={formData.auth_config?.key || ''}
                    onChange={(e) => setFormData({ ...formData, auth_config: { ...formData.auth_config, key: e.target.value } })}
                    placeholder="Enter API key"
                  />
                </div>
              </div>
            )}

            {formData.auth_type === 'basic' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('mcp.username')}</Label>
                  <Input
                    value={formData.auth_config?.username || ''}
                    onChange={(e) => setFormData({ ...formData, auth_config: { ...formData.auth_config, username: e.target.value } })}
                    placeholder="Username"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('mcp.password')}</Label>
                  <Input
                    type="password"
                    value={formData.auth_config?.password || ''}
                    onChange={(e) => setFormData({ ...formData, auth_config: { ...formData.auth_config, password: e.target.value } })}
                    placeholder="Password"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              onClick={handleAddServer} 
              disabled={!formData.name || !formData.server_url || addMCPServer.isPending}
            >
              {addMCPServer.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('mcp.addServer')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tools Modal */}
      <Dialog open={showToolsModal} onOpenChange={setShowToolsModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('mcp.availableTools')}</DialogTitle>
          </DialogHeader>
          
          {loadingTools ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : tools.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('mcp.noToolsFound')}
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {tools.map((tool) => (
                <Card key={tool.name} className="p-4">
                  <div className="flex items-start gap-3">
                    <Wrench className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <h4 className="font-medium">{tool.name}</h4>
                      <p className="text-sm text-muted-foreground">{tool.description}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
