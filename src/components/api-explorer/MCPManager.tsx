import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Plus, 
  Server, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  Wrench,
  ExternalLink,
  RefreshCw,
  Shield,
  Settings,
  Edit,
  Download,
  Cloud,
  Plug
} from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/context/LanguageContext';
import { useAllAgents } from '@/hooks/useAllAgents';
import { useAgentMCPServers, MCPServerInput, MCPTool, MCPServer } from '@/hooks/useAgentMCPServers';
import { supabase } from '@/integrations/supabase/client';

interface MCPManagerProps {
  defaultAgentId?: string;
}

interface PlatformMCPConfig {
  tools?: Array<{
    name: string;
    description?: string;
    type?: string;
    url?: string;
  }>;
  client_tools?: Array<{
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  }>;
  functions?: Array<{
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  }>;
}

export const MCPManager = ({ defaultAgentId }: MCPManagerProps) => {
  const { language } = useLanguage();
  const { data: agentsData, isLoading: loadingAgents } = useAllAgents();
  const [selectedAgentId, setSelectedAgentId] = useState<string>(defaultAgentId || '');
  const { mcpServers, isLoading, addMCPServer, updateMCPServer, deleteMCPServer, toggleMCPServer, testConnection, listTools } = useAgentMCPServers(selectedAgentId);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showToolsModal, setShowToolsModal] = useState(false);
  const [editingServer, setEditingServer] = useState<MCPServer | null>(null);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [loadingTools, setLoadingTools] = useState(false);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const [connectionResults, setConnectionResults] = useState<Record<string, { success: boolean; error?: string }>>({});
  const [activeTab, setActiveTab] = useState<'local' | 'platform'>('local');
  const [fetchingPlatform, setFetchingPlatform] = useState(false);
  const [platformMCPConfig, setPlatformMCPConfig] = useState<PlatformMCPConfig | null>(null);

  const selectedAgent = agentsData?.agents.find(a => a.id === selectedAgentId);

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

  const handleEditServer = async () => {
    if (!editingServer) return;
    await updateMCPServer.mutateAsync({
      id: editingServer.id,
      name: formData.name,
      description: formData.description,
      server_url: formData.server_url,
      server_type: formData.server_type,
      auth_type: formData.auth_type,
      auth_config: formData.auth_config,
      tools_enabled: formData.tools_enabled,
    });
    setShowEditModal(false);
    setEditingServer(null);
    resetForm();
  };

  const openEditModal = (server: MCPServer) => {
    setEditingServer(server);
    setFormData({
      name: server.name,
      description: server.description || '',
      server_url: server.server_url,
      server_type: server.server_type,
      auth_type: server.auth_type,
      auth_config: server.auth_config,
      tools_enabled: server.tools_enabled,
    });
    setShowEditModal(true);
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
    
    if (result.success) {
      toast.success(language === 'fr' ? 'Connexion réussie' : 'Connection successful');
    } else {
      toast.error(result.error || (language === 'fr' ? 'Échec de connexion' : 'Connection failed'));
    }
  };

  const handleViewTools = async (serverId: string) => {
    setSelectedServerId(serverId);
    setLoadingTools(true);
    setShowToolsModal(true);
    const fetchedTools = await listTools(serverId);
    setTools(fetchedTools);
    setLoadingTools(false);
  };

  const getAgentPlatformInfo = async (agentId: string) => {
    // IMPORTANT: never fetch platform API keys client-side.
    const { data: agent } = await supabase
      .from('agents_safe')
      .select('platform_agent_id, platform, organization_id')
      .eq('id', agentId)
      .single();

    return agent || null;
  };

  const fetchPlatformMCPConfig = async () => {
    if (!selectedAgent) return;
    
    setFetchingPlatform(true);
    try {
      const agent = await getAgentPlatformInfo(selectedAgentId);

      if (!agent?.platform_agent_id || !agent?.organization_id) {
        toast.error(language === 'fr' ? 'Agent non configuré' : 'Agent not configured');
        return;
      }

      let functionName = 'connector-proxy';
      let body: Record<string, unknown> = {};
      
      switch (agent.platform) {
        case 'elevenlabs':
          functionName = 'elevenlabs-convai-agent-config';
          body = {
            action: 'get',
            agentId: agent.platform_agent_id,
            organizationId: agent.organization_id,
          };
          break;
        case 'vapi':
          functionName = 'vapi-proxy';
          body = {
            action: 'get_assistant',
            assistantId: agent.platform_agent_id,
            organizationId: agent.organization_id,
          };
          break;
        case 'retell':
          functionName = 'retell-proxy';
          body = {
            action: 'get_agent',
            agentId: agent.platform_agent_id,
            organizationId: agent.organization_id,
          };
          break;
      }

      const { data, error } = await supabase.functions.invoke(functionName, { body });

      if (error) throw error;
      
      // Extract MCP/Tools config from platform response
      let mcpConfig: PlatformMCPConfig | null = null;
      
      if (agent.platform === 'elevenlabs') {
        mcpConfig = {
          tools: data?.agent?.platform_settings?.tools || data?.agent?.client_tools,
          client_tools: data?.agent?.client_tools,
        };
      } else if (agent.platform === 'vapi') {
        mcpConfig = {
          functions: data?.assistant?.functions || data?.functions,
          tools: data?.assistant?.tools || data?.tools,
        };
      } else if (agent.platform === 'retell') {
        mcpConfig = {
          functions: data?.agent?.functions || data?.functions,
        };
      }
      
      setPlatformMCPConfig(mcpConfig);
      setActiveTab('platform');
      toast.success(language === 'fr' ? 'Configuration MCP récupérée' : 'MCP configuration fetched');
    } catch (error) {
      console.error('Error fetching platform MCP config:', error);
      toast.error(language === 'fr' ? 'Erreur lors de la récupération' : 'Failed to fetch configuration');
    } finally {
      setFetchingPlatform(false);
    }
  };

  const texts = {
    title: language === 'fr' ? 'Configuration MCP' : 'MCP Configuration',
    description: language === 'fr' 
      ? 'Gérez les serveurs MCP et synchronisez avec les plateformes'
      : 'Manage MCP servers and sync with platforms',
    selectAgent: language === 'fr' ? 'Sélectionner un agent' : 'Select an agent',
    addServer: language === 'fr' ? 'Ajouter Serveur MCP' : 'Add MCP Server',
    editServer: language === 'fr' ? 'Modifier Serveur' : 'Edit Server',
    noServers: language === 'fr' ? 'Aucun serveur MCP configuré' : 'No MCP servers configured',
    noAgent: language === 'fr' ? 'Sélectionnez un agent pour voir les serveurs MCP' : 'Select an agent to view MCP servers',
    serverName: language === 'fr' ? 'Nom du serveur' : 'Server Name',
    serverUrl: language === 'fr' ? 'URL du serveur' : 'Server URL',
    serverType: language === 'fr' ? 'Type' : 'Type',
    authType: language === 'fr' ? 'Authentification' : 'Authentication',
    testConnection: language === 'fr' ? 'Tester' : 'Test',
    viewTools: language === 'fr' ? 'Voir outils' : 'View Tools',
    connected: language === 'fr' ? 'Connecté' : 'Connected',
    failed: language === 'fr' ? 'Échec' : 'Failed',
    toolsEnabled: language === 'fr' ? 'outils activés' : 'tools enabled',
    availableTools: language === 'fr' ? 'Outils disponibles' : 'Available Tools',
    noToolsFound: language === 'fr' ? 'Aucun outil trouvé' : 'No tools found',
    authNone: language === 'fr' ? 'Aucune' : 'None',
    authBearer: language === 'fr' ? 'Bearer Token' : 'Bearer Token',
    authApiKey: language === 'fr' ? 'Clé API' : 'API Key',
    authBasic: language === 'fr' ? 'Basic Auth' : 'Basic Auth',
    localServers: language === 'fr' ? 'Serveurs Locaux' : 'Local Servers',
    platformConfig: language === 'fr' ? 'Config Plateforme' : 'Platform Config',
    fetchFromPlatform: language === 'fr' ? 'Récupérer de la plateforme' : 'Fetch from Platform',
    platformTools: language === 'fr' ? 'Outils de la Plateforme' : 'Platform Tools',
  };

  if (loadingAgents) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Agent Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
        <div className="flex-1 w-full sm:w-auto">
          <Label>{texts.selectAgent}</Label>
          <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder={texts.selectAgent} />
            </SelectTrigger>
            <SelectContent>
              {agentsData?.agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  <div className="flex items-center gap-2">
                    <span>{agent.name}</span>
                    <Badge variant="outline" className="text-xs">{agent.platform}</Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {selectedAgentId && (
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => setShowAddModal(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              {texts.addServer}
            </Button>
            <Button 
              variant="outline" 
              onClick={fetchPlatformMCPConfig}
              disabled={fetchingPlatform}
              className="gap-2"
            >
              {fetchingPlatform ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {texts.fetchFromPlatform}
            </Button>
          </div>
        )}
      </div>

      {/* No Agent Selected */}
      {!selectedAgentId && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Server className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">{texts.noAgent}</p>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      {selectedAgentId && (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'local' | 'platform')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="local" className="gap-2">
              <Settings className="h-4 w-4" />
              {texts.localServers}
              {mcpServers.length > 0 && (
                <Badge variant="secondary" className="ml-1">{mcpServers.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="platform" className="gap-2">
              <Cloud className="h-4 w-4" />
              {texts.platformConfig}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="local" className="space-y-4 mt-4">
            {/* No Servers */}
            {!isLoading && mcpServers.length === 0 && (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Server className="h-12 w-12 text-muted-foreground mb-4" />
                  <h4 className="text-lg font-medium mb-2">{texts.noServers}</h4>
                  <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
                    {language === 'fr' 
                      ? 'Ajoutez un serveur MCP pour étendre les capacités de votre agent'
                      : 'Add an MCP server to extend your agent\'s capabilities'}
                  </p>
                  <Button onClick={() => setShowAddModal(true)} variant="outline" className="gap-2">
                    <Plus className="h-4 w-4" />
                    {texts.addServer}
                  </Button>
                </CardContent>
              </Card>
            )}

            {isLoading && (
              <div className="space-y-4">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
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
                              {server.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                            {connectionResults[server.id] && (
                              connectionResults[server.id].success ? (
                                <Badge variant="outline" className="text-green-600 border-green-600">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  {texts.connected}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-destructive border-destructive">
                                  <XCircle className="h-3 w-3 mr-1" />
                                  {texts.failed}
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
                          {server.tools_enabled.length} {texts.toolsEnabled}
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex gap-2 flex-wrap">
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
                          <Plug className="h-4 w-4" />
                        )}
                        {texts.testConnection}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewTools(server.id)}
                        className="gap-2"
                      >
                        <Wrench className="h-4 w-4" />
                        {texts.viewTools}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditModal(server)}
                        className="gap-2"
                      >
                        <Edit className="h-4 w-4" />
                        Edit
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
          </TabsContent>

          <TabsContent value="platform" className="space-y-4 mt-4">
            {!platformMCPConfig && !fetchingPlatform && (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Cloud className="h-12 w-12 text-muted-foreground mb-4" />
                  <h4 className="text-lg font-medium mb-2">
                    {language === 'fr' ? 'Aucune configuration récupérée' : 'No configuration fetched'}
                  </h4>
                  <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
                    {language === 'fr' 
                      ? 'Cliquez sur "Récupérer de la plateforme" pour voir les outils configurés'
                      : 'Click "Fetch from Platform" to see configured tools'}
                  </p>
                  <Button 
                    variant="outline" 
                    onClick={fetchPlatformMCPConfig}
                    disabled={fetchingPlatform}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    {texts.fetchFromPlatform}
                  </Button>
                </CardContent>
              </Card>
            )}

            {fetchingPlatform && (
              <Card>
                <CardContent className="py-8">
                  <div className="flex items-center justify-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <span>{language === 'fr' ? 'Récupération en cours...' : 'Fetching...'}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {platformMCPConfig && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Wrench className="h-4 w-4" />
                    {texts.platformTools}
                  </CardTitle>
                  <CardDescription>
                    {language === 'fr' 
                      ? 'Outils et fonctions configurés sur la plateforme'
                      : 'Tools and functions configured on the platform'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-3">
                      {/* Tools */}
                      {(platformMCPConfig.tools || []).map((tool, index) => (
                        <div key={`tool-${index}`} className="p-3 rounded-lg bg-muted/50 border">
                          <div className="flex items-center gap-2 mb-1">
                            <Wrench className="h-4 w-4 text-primary" />
                            <span className="font-medium">{tool.name}</span>
                            <Badge variant="outline" className="text-xs">Tool</Badge>
                          </div>
                          {tool.description && (
                            <p className="text-sm text-muted-foreground">{tool.description}</p>
                          )}
                        </div>
                      ))}
                      
                      {/* Client Tools */}
                      {(platformMCPConfig.client_tools || []).map((tool, index) => (
                        <div key={`client-tool-${index}`} className="p-3 rounded-lg bg-muted/50 border">
                          <div className="flex items-center gap-2 mb-1">
                            <Wrench className="h-4 w-4 text-primary" />
                            <span className="font-medium">{tool.name}</span>
                            <Badge variant="outline" className="text-xs">Client Tool</Badge>
                          </div>
                          {tool.description && (
                            <p className="text-sm text-muted-foreground">{tool.description}</p>
                          )}
                        </div>
                      ))}
                      
                      {/* Functions */}
                      {(platformMCPConfig.functions || []).map((func, index) => (
                        <div key={`func-${index}`} className="p-3 rounded-lg bg-muted/50 border">
                          <div className="flex items-center gap-2 mb-1">
                            <Settings className="h-4 w-4 text-primary" />
                            <span className="font-medium">{func.name}</span>
                            <Badge variant="outline" className="text-xs">Function</Badge>
                          </div>
                          {func.description && (
                            <p className="text-sm text-muted-foreground">{func.description}</p>
                          )}
                        </div>
                      ))}
                      
                      {!platformMCPConfig.tools?.length && 
                       !platformMCPConfig.client_tools?.length && 
                       !platformMCPConfig.functions?.length && (
                        <div className="text-center py-8 text-muted-foreground">
                          {language === 'fr' ? 'Aucun outil configuré sur la plateforme' : 'No tools configured on platform'}
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Add Server Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{texts.addServer}</DialogTitle>
            <DialogDescription>
              {language === 'fr' 
                ? 'Ajoutez un serveur MCP pour étendre les capacités de votre agent'
                : 'Add an MCP server to extend your agent\'s capabilities'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{texts.serverName}</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="My MCP Server"
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>{texts.serverUrl}</Label>
              <Input
                value={formData.server_url}
                onChange={(e) => setFormData({ ...formData, server_url: e.target.value })}
                placeholder="https://my-mcp-server.com/mcp"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{texts.serverType}</Label>
                <Select
                  value={formData.server_type}
                  onValueChange={(value: 'http' | 'sse' | 'websocket') => setFormData({ ...formData, server_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="http">HTTP</SelectItem>
                    <SelectItem value="sse">SSE</SelectItem>
                    <SelectItem value="websocket">WebSocket</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{texts.authType}</Label>
                <Select
                  value={formData.auth_type}
                  onValueChange={(value: 'none' | 'bearer' | 'api_key' | 'basic') => setFormData({ ...formData, auth_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{texts.authNone}</SelectItem>
                    <SelectItem value="bearer">{texts.authBearer}</SelectItem>
                    <SelectItem value="api_key">{texts.authApiKey}</SelectItem>
                    <SelectItem value="basic">{texts.authBasic}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formData.auth_type === 'bearer' && (
              <div className="space-y-2">
                <Label>Bearer Token</Label>
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
                  <Label>Header Name</Label>
                  <Input
                    value={formData.auth_config?.header || 'X-API-Key'}
                    onChange={(e) => setFormData({ ...formData, auth_config: { ...formData.auth_config, header: e.target.value } })}
                    placeholder="X-API-Key"
                  />
                </div>
                <div className="space-y-2">
                  <Label>API Key</Label>
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
                  <Label>Username</Label>
                  <Input
                    value={formData.auth_config?.username || ''}
                    onChange={(e) => setFormData({ ...formData, auth_config: { ...formData.auth_config, username: e.target.value } })}
                    placeholder="Username"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
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
              Cancel
            </Button>
            <Button 
              onClick={handleAddServer} 
              disabled={!formData.name || !formData.server_url || addMCPServer.isPending}
            >
              {addMCPServer.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {texts.addServer}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Server Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{texts.editServer}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{texts.serverName}</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="My MCP Server"
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>{texts.serverUrl}</Label>
              <Input
                value={formData.server_url}
                onChange={(e) => setFormData({ ...formData, server_url: e.target.value })}
                placeholder="https://my-mcp-server.com/mcp"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{texts.serverType}</Label>
                <Select
                  value={formData.server_type}
                  onValueChange={(value: 'http' | 'sse' | 'websocket') => setFormData({ ...formData, server_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="http">HTTP</SelectItem>
                    <SelectItem value="sse">SSE</SelectItem>
                    <SelectItem value="websocket">WebSocket</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{texts.authType}</Label>
                <Select
                  value={formData.auth_type}
                  onValueChange={(value: 'none' | 'bearer' | 'api_key' | 'basic') => setFormData({ ...formData, auth_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{texts.authNone}</SelectItem>
                    <SelectItem value="bearer">{texts.authBearer}</SelectItem>
                    <SelectItem value="api_key">{texts.authApiKey}</SelectItem>
                    <SelectItem value="basic">{texts.authBasic}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formData.auth_type === 'bearer' && (
              <div className="space-y-2">
                <Label>Bearer Token</Label>
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
                  <Label>Header Name</Label>
                  <Input
                    value={formData.auth_config?.header || 'X-API-Key'}
                    onChange={(e) => setFormData({ ...formData, auth_config: { ...formData.auth_config, header: e.target.value } })}
                    placeholder="X-API-Key"
                  />
                </div>
                <div className="space-y-2">
                  <Label>API Key</Label>
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
                  <Label>Username</Label>
                  <Input
                    value={formData.auth_config?.username || ''}
                    onChange={(e) => setFormData({ ...formData, auth_config: { ...formData.auth_config, username: e.target.value } })}
                    placeholder="Username"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
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
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleEditServer} 
              disabled={!formData.name || !formData.server_url || updateMCPServer.isPending}
            >
              {updateMCPServer.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tools Modal */}
      <Dialog open={showToolsModal} onOpenChange={setShowToolsModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{texts.availableTools}</DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="h-[400px]">
            {loadingTools ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : tools.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {texts.noToolsFound}
              </div>
            ) : (
              <div className="space-y-3 p-1">
                {tools.map((tool, index) => (
                  <div key={index} className="p-3 rounded-lg bg-muted/50 border">
                    <div className="flex items-center gap-2 mb-1">
                      <Wrench className="h-4 w-4 text-primary" />
                      <span className="font-medium">{tool.name}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{tool.description}</p>
                    {tool.inputSchema && (
                      <details className="mt-2">
                        <summary className="text-xs text-primary cursor-pointer">View Schema</summary>
                        <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-x-auto">
                          {JSON.stringify(tool.inputSchema, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowToolsModal(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
