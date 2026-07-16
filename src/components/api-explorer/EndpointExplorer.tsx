import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Play, 
  Copy, 
  Check, 
  Loader2, 
  Code, 
  Send, 
  Clock,
  AlertCircle,
  CheckCircle,
  History,
  Trash2,
  Save,
  FolderOpen
} from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/context/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { 
  type Platform, 
  type PlatformEndpoint,
  getEndpointsForPlatform,
  getUnifiedEndpoints,
  getEndpointUrl,
  getPlatformDisplayName,
  ELEVENLABS_ENDPOINTS,
  VAPI_ENDPOINTS,
  RETELL_ENDPOINTS
} from '@/lib/connectors/endpoints-registry';
import { cn } from '@/lib/utils';

interface RequestHistory {
  id: string;
  endpoint: string;
  platform: Platform;
  action: string;
  payload: string;
  response: string;
  status: 'success' | 'error';
  duration: number;
  timestamp: Date;
}

interface SavedRequest {
  id: string;
  name: string;
  endpoint: string;
  platform: Platform;
  action: string;
  payload: string;
}

interface EndpointExplorerProps {
  defaultPlatform?: Platform;
  agentId?: string;
  apiKey?: string;
}

export const EndpointExplorer = ({ 
  defaultPlatform = 'elevenlabs',
  agentId,
  apiKey 
}: EndpointExplorerProps) => {
  const { language } = useLanguage();
  const [platform, setPlatform] = useState<Platform>(defaultPlatform);
  const [selectedEndpoint, setSelectedEndpoint] = useState<PlatformEndpoint | null>(null);
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [payload, setPayload] = useState<string>('{}');
  const [response, setResponse] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [requestDuration, setRequestDuration] = useState<number | null>(null);
  const [requestStatus, setRequestStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [history, setHistory] = useState<RequestHistory[]>([]);
  const [savedRequests, setSavedRequests] = useState<SavedRequest[]>([]);
  const [activeTab, setActiveTab] = useState<'request' | 'response' | 'history'>('request');

  const endpoints = getEndpointsForPlatform(platform);
  const platformName = getPlatformDisplayName(platform);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success(language === 'fr' ? 'Copié' : 'Copied');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const generateDefaultPayload = useCallback((endpoint: PlatformEndpoint, action?: string) => {
    const payload: Record<string, unknown> = {};
    
    if (endpoint.requiresApiKey && apiKey) {
      payload.apiKey = apiKey;
    } else if (endpoint.requiresApiKey) {
      payload.apiKey = '<YOUR_API_KEY>';
    }
    
    if (endpoint.requiresAgentId && agentId) {
      payload.agentId = agentId;
    } else if (endpoint.requiresAgentId) {
      payload.agentId = '<AGENT_ID>';
    }
    
    if (action || (endpoint.actions?.length && endpoint.actions.length > 0)) {
      payload.action = action || endpoint.actions?.[0] || '';
    }
    
    return JSON.stringify(payload, null, 2);
  }, [agentId, apiKey]);

  const handleEndpointSelect = (endpointId: string) => {
    const endpoint = endpoints.find(e => e.id === endpointId);
    if (endpoint) {
      setSelectedEndpoint(endpoint);
      const firstAction = endpoint.actions?.[0] || '';
      setSelectedAction(firstAction);
      setPayload(generateDefaultPayload(endpoint, firstAction));
      setResponse('');
      setRequestStatus('idle');
      setRequestDuration(null);
    }
  };

  const handleActionSelect = (action: string) => {
    setSelectedAction(action);
    if (selectedEndpoint) {
      const currentPayload = JSON.parse(payload || '{}');
      currentPayload.action = action;
      setPayload(JSON.stringify(currentPayload, null, 2));
    }
  };

  const executeRequest = async () => {
    if (!selectedEndpoint) return;
    
    setIsLoading(true);
    setRequestStatus('idle');
    const startTime = Date.now();
    
    try {
      const parsedPayload = JSON.parse(payload);
      
      const { data, error } = await supabase.functions.invoke(selectedEndpoint.functionName, {
        body: parsedPayload,
      });
      
      const duration = Date.now() - startTime;
      setRequestDuration(duration);
      
      if (error) {
        setResponse(JSON.stringify({ error: error.message }, null, 2));
        setRequestStatus('error');
        addToHistory('error', duration, JSON.stringify({ error: error.message }, null, 2));
      } else {
        setResponse(JSON.stringify(data, null, 2));
        setRequestStatus('success');
        addToHistory('success', duration, JSON.stringify(data, null, 2));
      }
      
      setActiveTab('response');
    } catch (error) {
      const duration = Date.now() - startTime;
      setRequestDuration(duration);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setResponse(JSON.stringify({ error: errorMessage }, null, 2));
      setRequestStatus('error');
      addToHistory('error', duration, JSON.stringify({ error: errorMessage }, null, 2));
      setActiveTab('response');
    } finally {
      setIsLoading(false);
    }
  };

  const addToHistory = (status: 'success' | 'error', duration: number, responseText: string) => {
    if (!selectedEndpoint) return;
    
    const entry: RequestHistory = {
      id: crypto.randomUUID(),
      endpoint: selectedEndpoint.id,
      platform,
      action: selectedAction,
      payload,
      response: responseText,
      status,
      duration,
      timestamp: new Date(),
    };
    
    setHistory(prev => [entry, ...prev].slice(0, 50)); // Keep last 50 requests
  };

  const loadFromHistory = (entry: RequestHistory) => {
    setPlatform(entry.platform);
    const endpoint = getEndpointsForPlatform(entry.platform).find(e => e.id === entry.endpoint);
    if (endpoint) {
      setSelectedEndpoint(endpoint);
      setSelectedAction(entry.action);
      setPayload(entry.payload);
      setResponse(entry.response);
      setRequestStatus(entry.status);
      setActiveTab('request');
    }
  };

  const saveRequest = () => {
    if (!selectedEndpoint) return;
    
    const name = prompt(language === 'fr' ? 'Nom de la requête:' : 'Request name:');
    if (!name) return;
    
    const saved: SavedRequest = {
      id: crypto.randomUUID(),
      name,
      endpoint: selectedEndpoint.id,
      platform,
      action: selectedAction,
      payload,
    };
    
    setSavedRequests(prev => [...prev, saved]);
    toast.success(language === 'fr' ? 'Requête sauvegardée' : 'Request saved');
  };

  const loadSavedRequest = (saved: SavedRequest) => {
    setPlatform(saved.platform);
    const endpoint = getEndpointsForPlatform(saved.platform).find(e => e.id === saved.endpoint);
    if (endpoint) {
      setSelectedEndpoint(endpoint);
      setSelectedAction(saved.action);
      setPayload(saved.payload);
      setResponse('');
      setRequestStatus('idle');
      setActiveTab('request');
    }
  };

  const formatPayload = () => {
    try {
      const parsed = JSON.parse(payload);
      setPayload(JSON.stringify(parsed, null, 2));
    } catch {
      toast.error(language === 'fr' ? 'JSON invalide' : 'Invalid JSON');
    }
  };

  const texts = {
    title: language === 'fr' ? 'Explorateur API' : 'API Explorer',
    description: language === 'fr' 
      ? 'Testez les endpoints API en temps réel'
      : 'Test API endpoints in real-time',
    selectPlatform: language === 'fr' ? 'Plateforme' : 'Platform',
    selectEndpoint: language === 'fr' ? 'Endpoint' : 'Endpoint',
    selectAction: language === 'fr' ? 'Action' : 'Action',
    requestBody: language === 'fr' ? 'Corps de la requête' : 'Request Body',
    response: language === 'fr' ? 'Réponse' : 'Response',
    send: language === 'fr' ? 'Envoyer' : 'Send',
    format: language === 'fr' ? 'Formater' : 'Format',
    copy: language === 'fr' ? 'Copier' : 'Copy',
    save: language === 'fr' ? 'Sauvegarder' : 'Save',
    history: language === 'fr' ? 'Historique' : 'History',
    saved: language === 'fr' ? 'Sauvegardés' : 'Saved',
    noEndpoint: language === 'fr' ? 'Sélectionnez un endpoint' : 'Select an endpoint',
    duration: language === 'fr' ? 'Durée' : 'Duration',
    clearHistory: language === 'fr' ? 'Effacer' : 'Clear',
    noHistory: language === 'fr' ? 'Aucun historique' : 'No history',
    request: language === 'fr' ? 'Requête' : 'Request',
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-full">
      {/* Left Panel - Endpoint Selection */}
      <Card className="lg:col-span-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Code className="h-5 w-5" />
            {texts.title}
          </CardTitle>
          <CardDescription>{texts.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Platform Selector */}
          <div className="space-y-2">
            <Label>{texts.selectPlatform}</Label>
            <Select value={platform} onValueChange={(v) => { setPlatform(v as Platform); setSelectedEndpoint(null); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
                <SelectItem value="vapi">Vapi</SelectItem>
                <SelectItem value="retell">Retell AI</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Endpoint List */}
          <div className="space-y-2">
            <Label>{texts.selectEndpoint}</Label>
            <ScrollArea className="h-[300px] border rounded-md">
              <div className="p-2 space-y-1">
                {endpoints.map((endpoint) => (
                  <Button
                    key={endpoint.id}
                    variant={selectedEndpoint?.id === endpoint.id ? 'secondary' : 'ghost'}
                    className="w-full justify-start text-left h-auto py-2"
                    onClick={() => handleEndpointSelect(endpoint.id)}
                  >
                    <div className="flex flex-col items-start gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {endpoint.name[language] || endpoint.name.en}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {endpoint.method}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground line-clamp-1">
                        {endpoint.description[language] || endpoint.description.en}
                      </span>
                    </div>
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Saved Requests */}
          {savedRequests.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                {texts.saved}
              </Label>
              <ScrollArea className="h-[120px] border rounded-md">
                <div className="p-2 space-y-1">
                  {savedRequests.map((saved) => (
                    <Button
                      key={saved.id}
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-left"
                      onClick={() => loadSavedRequest(saved)}
                    >
                      <span className="truncate">{saved.name}</span>
                    </Button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Right Panel - Request/Response */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              {selectedEndpoint ? (
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg">
                    {selectedEndpoint.name[language] || selectedEndpoint.name.en}
                  </CardTitle>
                  <Badge variant="outline">{selectedEndpoint.method}</Badge>
                  {requestStatus === 'success' && <CheckCircle className="h-4 w-4 text-green-500" />}
                  {requestStatus === 'error' && <AlertCircle className="h-4 w-4 text-destructive" />}
                </div>
              ) : (
                <CardTitle className="text-lg text-muted-foreground">{texts.noEndpoint}</CardTitle>
              )}
              {selectedEndpoint && (
                <CardDescription className="font-mono text-xs mt-1">
                  {getEndpointUrl(selectedEndpoint.functionName)}
                </CardDescription>
              )}
            </div>
            {requestDuration !== null && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {requestDuration}ms
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
            <TabsList className="w-full">
              <TabsTrigger value="request" className="flex-1">{texts.request}</TabsTrigger>
              <TabsTrigger value="response" className="flex-1">{texts.response}</TabsTrigger>
              <TabsTrigger value="history" className="flex-1">
                <History className="h-4 w-4 mr-1" />
                {texts.history}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="request" className="space-y-4 mt-4">
              {selectedEndpoint?.actions && selectedEndpoint.actions.length > 0 && (
                <div className="space-y-2">
                  <Label>{texts.selectAction}</Label>
                  <Select value={selectedAction} onValueChange={handleActionSelect}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedEndpoint.actions.map((action) => (
                        <SelectItem key={action} value={action}>{action}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{texts.requestBody}</Label>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={formatPayload}>
                      <Code className="h-4 w-4 mr-1" />
                      {texts.format}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleCopy(payload, 'payload')}>
                      {copiedId === 'payload' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={saveRequest} disabled={!selectedEndpoint}>
                      <Save className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={payload}
                  onChange={(e) => setPayload(e.target.value)}
                  className="font-mono text-sm h-[200px]"
                  placeholder="{}"
                  disabled={!selectedEndpoint}
                />
              </div>

              <Button 
                onClick={executeRequest} 
                disabled={!selectedEndpoint || isLoading}
                className="w-full"
              >
                {isLoading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending...</>
                ) : (
                  <><Send className="h-4 w-4 mr-2" /> {texts.send}</>
                )}
              </Button>
            </TabsContent>

            <TabsContent value="response" className="mt-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{texts.response}</Label>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => handleCopy(response, 'response')}
                    disabled={!response}
                  >
                    {copiedId === 'response' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <ScrollArea className="h-[280px] border rounded-md">
                  <pre className={cn(
                    "p-4 font-mono text-sm whitespace-pre-wrap",
                    requestStatus === 'error' && "text-destructive"
                  )}>
                    {response || (language === 'fr' ? 'Aucune réponse' : 'No response yet')}
                  </pre>
                </ScrollArea>
              </div>
            </TabsContent>

            <TabsContent value="history" className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <Label>{texts.history}</Label>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setHistory([])}
                  disabled={history.length === 0}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  {texts.clearHistory}
                </Button>
              </div>
              <ScrollArea className="h-[280px] border rounded-md">
                {history.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    {texts.noHistory}
                  </div>
                ) : (
                  <div className="p-2 space-y-2">
                    {history.map((entry) => (
                      <Button
                        key={entry.id}
                        variant="ghost"
                        className="w-full justify-start text-left h-auto py-2"
                        onClick={() => loadFromHistory(entry)}
                      >
                        <div className="flex items-center gap-3 w-full">
                          {entry.status === 'success' ? (
                            <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{entry.endpoint}</span>
                              {entry.action && (
                                <Badge variant="outline" className="text-xs">{entry.action}</Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {entry.timestamp.toLocaleTimeString()} • {entry.duration}ms
                            </div>
                          </div>
                        </div>
                      </Button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};
