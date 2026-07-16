import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Copy, Check, ChevronDown, Code, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { ELEVENLABS_ENDPOINTS, getEndpointUrl, type ElevenLabsEndpoint } from '@/lib/elevenlabs/endpoints';

interface ElevenLabsEndpointsCardProps {
  agentId?: string;
  apiKey?: string;
  showAllEndpoints?: boolean;
}

export const ElevenLabsEndpointsCard = ({ 
  agentId, 
  apiKey,
  showAllEndpoints = false 
}: ElevenLabsEndpointsCardProps) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedEndpoints, setExpandedEndpoints] = useState<string[]>([]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Copié dans le presse-papier');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleExpanded = (id: string) => {
    setExpandedEndpoints(prev => 
      prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]
    );
  };

  // Filter endpoints based on what's relevant
  const relevantEndpoints = showAllEndpoints 
    ? ELEVENLABS_ENDPOINTS 
    : ELEVENLABS_ENDPOINTS.filter(e => 
        // Show endpoints that don't require agentId, or if we have an agentId
        !e.requiresAgentId || agentId
      );

  const generateExamplePayload = (endpoint: ElevenLabsEndpoint): string => {
    const payload: Record<string, any> = {};
    
    if (endpoint.requiresApiKey && apiKey) {
      payload.apiKey = apiKey;
    } else if (endpoint.requiresApiKey) {
      payload.apiKey = '<YOUR_API_KEY>';
    }
    
    if (endpoint.requiresAgentId) {
      payload.agentId = agentId || '<AGENT_ID>';
    }
    
    if (endpoint.actions?.length) {
      payload.action = endpoint.actions[0];
    }
    
    return JSON.stringify(payload, null, 2);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Code className="h-5 w-5" />
          Endpoints API ElevenLabs
        </CardTitle>
        <CardDescription>
          URLs des fonctions backend pour intégrer les données ElevenLabs
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {relevantEndpoints.map((endpoint) => {
          const url = getEndpointUrl(endpoint.functionName);
          const isExpanded = expandedEndpoints.includes(endpoint.id);
          
          return (
            <Collapsible 
              key={endpoint.id} 
              open={isExpanded}
              onOpenChange={() => toggleExpanded(endpoint.id)}
            >
              <div className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{endpoint.name}</span>
                      {endpoint.actions?.length && (
                        <Badge variant="outline" className="text-xs">
                          {endpoint.actions.length} actions
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {endpoint.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleCopy(url, endpoint.id)}
                    >
                      {copiedId === endpoint.id ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                </div>
                
                <code className="block text-xs bg-muted p-2 rounded truncate">
                  {url}
                </code>
                
                <CollapsibleContent className="space-y-3 pt-2">
                  {endpoint.actions?.length && (
                    <div>
                      <p className="text-xs font-medium mb-1">Actions disponibles:</p>
                      <div className="flex flex-wrap gap-1">
                        {endpoint.actions.map(action => (
                          <Badge key={action} variant="secondary" className="text-xs">
                            {action}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div>
                    <p className="text-xs font-medium mb-1">Exemple de payload:</p>
                    <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                      {generateExamplePayload(endpoint)}
                    </pre>
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => handleCopy(generateExamplePayload(endpoint), `${endpoint.id}-payload`)}
                  >
                    {copiedId === `${endpoint.id}-payload` ? (
                      <><Check className="h-3 w-3 mr-1" /> Copié</>
                    ) : (
                      <><Copy className="h-3 w-3 mr-1" /> Copier le payload</>
                    )}
                  </Button>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
        
        {relevantEndpoints.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Aucun endpoint disponible
          </p>
        )}
      </CardContent>
    </Card>
  );
};
