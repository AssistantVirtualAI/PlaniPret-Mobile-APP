import { useParams } from 'react-router-dom';
import { useClientAgentAccess } from '@/hooks/useClientAgentAccess';
import { PlatformEndpointsCard } from '@/components/shared/PlatformEndpointsCard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Copy, Check, Code } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { toast } from 'sonner';
import { useLanguage } from '@/context/LanguageContext';
import type { Platform } from '@/lib/connectors/endpoints-registry';

const ClientAgentEndpoints = () => {
  const { clientId, agentId } = useParams();
  const { apiKey, platformAgentId, agentName, platform: hookPlatform, organizationId } = useClientAgentAccess(clientId, agentId);
  const { language } = useLanguage();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  
  // Use platform from hook instead of fetching separately
  const platform: Platform = hookPlatform || 'elevenlabs';

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success(language === 'fr' ? 'Copié' : 'Copied');
    setTimeout(() => setCopiedField(null), 2000);
  };

  const widgetUrl = platformAgentId 
    ? `${window.location.origin}/iframe/${agentId}` 
    : null;
  
  const prototypeUrl = platformAgentId 
    ? `${window.location.origin}/prototype/${agentId}` 
    : null;

  const texts = {
    title: language === 'fr' ? 'Endpoints & Intégration' : 'Endpoints & Integration',
    subtitle: language === 'fr' ? 'Informations techniques pour' : 'Technical information for',
    agentIds: language === 'fr' ? 'Identifiants Agent' : 'Agent Identifiers',
    agentIdsDesc: language === 'fr' 
      ? 'Identifiants uniques pour intégrer cet agent'
      : 'Unique identifiers to integrate this agent',
    internalId: language === 'fr' ? 'Agent ID (Interne)' : 'Agent ID (Internal)',
    platformId: language === 'fr' ? `Agent ID (${platform})` : `Agent ID (${platform})`,
    widgetUrl: language === 'fr' ? 'Widget Embed URL' : 'Widget Embed URL',
    prototypeUrl: language === 'fr' ? 'Prototype URL' : 'Prototype URL',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{texts.title}</h1>
        <p className="text-muted-foreground">{texts.subtitle} {agentName}</p>
      </div>

      {/* Agent IDs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            {texts.agentIds}
          </CardTitle>
          <CardDescription>{texts.agentIdsDesc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-muted/50">
            <div>
              <p className="text-sm font-medium">{texts.internalId}</p>
              <code className="text-xs text-muted-foreground">{agentId || 'N/A'}</code>
            </div>
            {agentId && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleCopy(agentId, 'internalId')}
              >
                {copiedField === 'internalId' ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-muted/50">
            <div>
              <p className="text-sm font-medium">{texts.platformId}</p>
              <code className="text-xs text-muted-foreground">{platformAgentId || 'N/A'}</code>
            </div>
            {platformAgentId && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleCopy(platformAgentId, 'platformId')}
              >
                {copiedField === 'platformId' ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>

          {widgetUrl && (
            <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-muted/50">
              <div>
                <p className="text-sm font-medium">{texts.widgetUrl}</p>
                <code className="text-xs text-muted-foreground truncate block max-w-md">{widgetUrl}</code>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleCopy(widgetUrl, 'widget')}
              >
                {copiedField === 'widget' ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}

          {prototypeUrl && (
            <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-muted/50">
              <div>
                <p className="text-sm font-medium">{texts.prototypeUrl}</p>
                <code className="text-xs text-muted-foreground truncate block max-w-md">{prototypeUrl}</code>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleCopy(prototypeUrl, 'prototype')}
              >
                {copiedField === 'prototype' ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Platform Endpoints - now unified for any platform */}
      <PlatformEndpointsCard 
        platform={platform}
        agentId={platformAgentId || undefined}
        apiKey={apiKey || undefined}
        organizationId={organizationId || undefined}
      />
    </div>
  );
};

export default ClientAgentEndpoints;
