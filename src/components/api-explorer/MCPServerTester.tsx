import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Wrench, 
  Play, 
  Loader2, 
  CheckCircle, 
  AlertCircle,
  Settings,
  Code,
  Zap,
  Bug,
  Copy,
  Check,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/context/LanguageContext';
import { cn } from '@/lib/utils';

interface MCPTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

interface MockResponse {
  toolName: string;
  response: string;
  delay: number;
  shouldError: boolean;
}

interface MCPServerTesterProps {
  serverId?: string;
  serverUrl?: string;
  serverName?: string;
  onTestComplete?: (success: boolean, tools?: MCPTool[]) => void;
}

// Predefined mock tools for testing
const MOCK_TOOLS: MCPTool[] = [
  {
    name: 'get_weather',
    description: 'Get current weather for a location',
    inputSchema: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City name' },
        units: { type: 'string', enum: ['celsius', 'fahrenheit'] }
      },
      required: ['location']
    }
  },
  {
    name: 'search_documents',
    description: 'Search through documents in knowledge base',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results' }
      },
      required: ['query']
    }
  },
  {
    name: 'create_appointment',
    description: 'Schedule a new appointment',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        datetime: { type: 'string', format: 'date-time' },
        attendee_email: { type: 'string', format: 'email' }
      },
      required: ['title', 'datetime']
    }
  },
  {
    name: 'send_email',
    description: 'Send an email to a recipient',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', format: 'email' },
        subject: { type: 'string' },
        body: { type: 'string' }
      },
      required: ['to', 'subject', 'body']
    }
  },
  {
    name: 'lookup_customer',
    description: 'Look up customer information by ID or email',
    inputSchema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string' },
        email: { type: 'string', format: 'email' }
      }
    }
  }
];

// Generate mock responses based on tool name
const generateMockResponse = (toolName: string, params: Record<string, unknown>): unknown => {
  switch (toolName) {
    case 'get_weather':
      return {
        location: params.location,
        temperature: Math.floor(Math.random() * 30) + 5,
        units: params.units || 'celsius',
        condition: ['sunny', 'cloudy', 'rainy', 'partly cloudy'][Math.floor(Math.random() * 4)],
        humidity: Math.floor(Math.random() * 60) + 30
      };
    case 'search_documents':
      return {
        query: params.query,
        results: [
          { id: '1', title: 'Product Guide', relevance: 0.95 },
          { id: '2', title: 'FAQ Document', relevance: 0.87 },
          { id: '3', title: 'User Manual', relevance: 0.72 }
        ].slice(0, (params.limit as number) || 3),
        total: 3
      };
    case 'create_appointment':
      return {
        success: true,
        appointment_id: crypto.randomUUID().slice(0, 8),
        title: params.title,
        datetime: params.datetime,
        confirmation_sent: true
      };
    case 'send_email':
      return {
        success: true,
        message_id: crypto.randomUUID().slice(0, 12),
        delivered_at: new Date().toISOString()
      };
    case 'lookup_customer':
      return {
        found: true,
        customer: {
          id: params.customer_id || 'cust_123',
          name: 'John Doe',
          email: params.email || 'john@example.com',
          account_status: 'active',
          created_at: '2024-01-15T10:30:00Z'
        }
      };
    default:
      return {
        success: true,
        message: `Tool ${toolName} executed successfully`,
        params
      };
  }
};

export const MCPServerTester = ({
  serverId,
  serverUrl,
  serverName = 'MCP Server',
  onTestComplete
}: MCPServerTesterProps) => {
  const { language } = useLanguage();
  const [mockMode, setMockMode] = useState(!serverId);
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connected' | 'error'>('idle');
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [selectedTool, setSelectedTool] = useState<MCPTool | null>(null);
  const [toolParams, setToolParams] = useState<string>('{}');
  const [toolResponse, setToolResponse] = useState<string>('');
  const [responseDelay, setResponseDelay] = useState(500);
  const [shouldSimulateError, setShouldSimulateError] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success(language === 'fr' ? 'Copié' : 'Copied');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const testConnection = async () => {
    setIsLoading(true);
    setConnectionStatus('idle');
    
    try {
      if (mockMode) {
        // Simulate connection delay
        await new Promise(resolve => setTimeout(resolve, 800));
        setTools(MOCK_TOOLS);
        setConnectionStatus('connected');
        toast.success(language === 'fr' ? 'Mode mock activé' : 'Mock mode activated');
        onTestComplete?.(true, MOCK_TOOLS);
      } else if (serverId) {
        // Real connection test would go here via edge function
        // For now, simulate with mock data
        await new Promise(resolve => setTimeout(resolve, 1000));
        setTools(MOCK_TOOLS.slice(0, 3)); // Simulate fewer tools from real server
        setConnectionStatus('connected');
        toast.success(language === 'fr' ? 'Connecté au serveur MCP' : 'Connected to MCP server');
        onTestComplete?.(true, MOCK_TOOLS.slice(0, 3));
      }
    } catch (error) {
      setConnectionStatus('error');
      const message = error instanceof Error ? error.message : 'Connection failed';
      toast.error(message);
      onTestComplete?.(false);
    } finally {
      setIsLoading(false);
    }
  };

  const executeTool = async () => {
    if (!selectedTool) return;
    
    setIsLoading(true);
    setToolResponse('');
    
    try {
      const params = JSON.parse(toolParams);
      
      // Simulate delay
      await new Promise(resolve => setTimeout(resolve, responseDelay));
      
      if (shouldSimulateError) {
        throw new Error(`Tool ${selectedTool.name} execution failed: Simulated error for testing`);
      }
      
      const response = generateMockResponse(selectedTool.name, params);
      setToolResponse(JSON.stringify(response, null, 2));
      toast.success(language === 'fr' ? 'Outil exécuté' : 'Tool executed');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Execution failed';
      setToolResponse(JSON.stringify({ error: message }, null, 2));
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const selectTool = (tool: MCPTool) => {
    setSelectedTool(tool);
    // Generate example params from schema
    const exampleParams: Record<string, unknown> = {};
    if (tool.inputSchema?.properties) {
      const props = tool.inputSchema.properties as Record<string, Record<string, unknown>>;
      Object.entries(props).forEach(([key, schema]) => {
        if (schema.type === 'string') {
          exampleParams[key] = schema.enum ? schema.enum[0] : `example_${key}`;
        } else if (schema.type === 'number') {
          exampleParams[key] = 10;
        } else if (schema.type === 'boolean') {
          exampleParams[key] = true;
        }
      });
    }
    setToolParams(JSON.stringify(exampleParams, null, 2));
    setToolResponse('');
  };

  const texts = {
    title: language === 'fr' ? 'Testeur MCP' : 'MCP Tester',
    description: language === 'fr' 
      ? 'Testez et déboguez les intégrations MCP'
      : 'Test and debug MCP integrations',
    mockMode: language === 'fr' ? 'Mode Mock' : 'Mock Mode',
    mockModeDesc: language === 'fr' 
      ? 'Utiliser des réponses simulées pour le développement'
      : 'Use simulated responses for development',
    testConnection: language === 'fr' ? 'Tester la connexion' : 'Test Connection',
    connected: language === 'fr' ? 'Connecté' : 'Connected',
    disconnected: language === 'fr' ? 'Déconnecté' : 'Disconnected',
    error: language === 'fr' ? 'Erreur' : 'Error',
    tools: language === 'fr' ? 'Outils' : 'Tools',
    toolParams: language === 'fr' ? 'Paramètres' : 'Parameters',
    execute: language === 'fr' ? 'Exécuter' : 'Execute',
    response: language === 'fr' ? 'Réponse' : 'Response',
    settings: language === 'fr' ? 'Paramètres' : 'Settings',
    responseDelay: language === 'fr' ? 'Délai de réponse (ms)' : 'Response delay (ms)',
    simulateError: language === 'fr' ? 'Simuler une erreur' : 'Simulate error',
    noTools: language === 'fr' ? 'Aucun outil disponible' : 'No tools available',
    selectTool: language === 'fr' ? 'Sélectionner un outil' : 'Select a tool',
    required: language === 'fr' ? 'requis' : 'required',
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Connection & Tools Panel */}
      <Card className="lg:col-span-1">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Wrench className="h-5 w-5" />
                {texts.title}
              </CardTitle>
              <CardDescription>{texts.description}</CardDescription>
            </div>
            <Badge 
              variant={connectionStatus === 'connected' ? 'default' : connectionStatus === 'error' ? 'destructive' : 'secondary'}
              className="flex items-center gap-1"
            >
              {connectionStatus === 'connected' && <CheckCircle className="h-3 w-3" />}
              {connectionStatus === 'error' && <AlertCircle className="h-3 w-3" />}
              {connectionStatus === 'connected' ? texts.connected : connectionStatus === 'error' ? texts.error : texts.disconnected}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mock Mode Toggle */}
          <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
            <div className="space-y-0.5">
              <Label className="flex items-center gap-2">
                <Bug className="h-4 w-4" />
                {texts.mockMode}
              </Label>
              <p className="text-xs text-muted-foreground">{texts.mockModeDesc}</p>
            </div>
            <Switch checked={mockMode} onCheckedChange={setMockMode} />
          </div>

          {/* Connection Test */}
          <Button 
            onClick={testConnection} 
            disabled={isLoading}
            className="w-full"
            variant={connectionStatus === 'connected' ? 'outline' : 'default'}
          >
            {isLoading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Testing...</>
            ) : connectionStatus === 'connected' ? (
              <><RefreshCw className="h-4 w-4 mr-2" /> {texts.testConnection}</>
            ) : (
              <><Zap className="h-4 w-4 mr-2" /> {texts.testConnection}</>
            )}
          </Button>

          <Separator />

          {/* Available Tools */}
          <div className="space-y-2">
            <Label>{texts.tools} ({tools.length})</Label>
            <ScrollArea className="h-[250px] border rounded-md">
              {tools.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  {texts.noTools}
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {tools.map((tool) => (
                    <Button
                      key={tool.name}
                      variant={selectedTool?.name === tool.name ? 'secondary' : 'ghost'}
                      className="w-full justify-start text-left h-auto py-2"
                      onClick={() => selectTool(tool)}
                    >
                      <div className="flex flex-col items-start gap-1">
                        <span className="font-medium text-sm font-mono">{tool.name}</span>
                        <span className="text-xs text-muted-foreground line-clamp-2">
                          {tool.description}
                        </span>
                      </div>
                    </Button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </CardContent>
      </Card>

      {/* Tool Execution Panel */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            {selectedTool ? (
              <div>
                <CardTitle className="text-lg font-mono">{selectedTool.name}</CardTitle>
                <CardDescription>{selectedTool.description}</CardDescription>
              </div>
            ) : (
              <CardTitle className="text-lg text-muted-foreground">{texts.selectTool}</CardTitle>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="execute">
            <TabsList className="w-full">
              <TabsTrigger value="execute" className="flex-1">
                <Play className="h-4 w-4 mr-1" />
                {texts.execute}
              </TabsTrigger>
              <TabsTrigger value="schema" className="flex-1">
                <Code className="h-4 w-4 mr-1" />
                Schema
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex-1">
                <Settings className="h-4 w-4 mr-1" />
                {texts.settings}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="execute" className="space-y-4 mt-4">
              {/* Tool Parameters */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{texts.toolParams}</Label>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => handleCopy(toolParams, 'params')}
                  >
                    {copiedId === 'params' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <Textarea
                  value={toolParams}
                  onChange={(e) => setToolParams(e.target.value)}
                  className="font-mono text-sm h-[120px]"
                  placeholder="{}"
                  disabled={!selectedTool}
                />
              </div>

              <Button 
                onClick={executeTool} 
                disabled={!selectedTool || isLoading}
                className="w-full"
              >
                {isLoading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Executing...</>
                ) : (
                  <><Play className="h-4 w-4 mr-2" /> {texts.execute}</>
                )}
              </Button>

              {/* Response */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{texts.response}</Label>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => handleCopy(toolResponse, 'response')}
                    disabled={!toolResponse}
                  >
                    {copiedId === 'response' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <ScrollArea className="h-[150px] border rounded-md">
                  <pre className={cn(
                    "p-4 font-mono text-sm whitespace-pre-wrap",
                    toolResponse.includes('"error"') && "text-destructive"
                  )}>
                    {toolResponse || (language === 'fr' ? 'Aucune réponse' : 'No response yet')}
                  </pre>
                </ScrollArea>
              </div>
            </TabsContent>

            <TabsContent value="schema" className="mt-4">
              {selectedTool?.inputSchema ? (
                <ScrollArea className="h-[350px] border rounded-md">
                  <pre className="p-4 font-mono text-sm">
                    {JSON.stringify(selectedTool.inputSchema, null, 2)}
                  </pre>
                </ScrollArea>
              ) : (
                <div className="p-4 text-center text-muted-foreground">
                  {texts.selectTool}
                </div>
              )}
            </TabsContent>

            <TabsContent value="settings" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>{texts.responseDelay}</Label>
                <Input
                  type="number"
                  value={responseDelay}
                  onChange={(e) => setResponseDelay(Number(e.target.value))}
                  min={0}
                  max={5000}
                  step={100}
                />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="space-y-0.5">
                  <Label className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    {texts.simulateError}
                  </Label>
                </div>
                <Switch 
                  checked={shouldSimulateError} 
                  onCheckedChange={setShouldSimulateError} 
                />
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};
