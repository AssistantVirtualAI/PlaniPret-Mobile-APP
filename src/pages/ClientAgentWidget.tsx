import { useParams } from 'react-router-dom';
import { useClientAgentAccess } from '@/hooks/useClientAgentAccess';
import { AgentEmbedTab } from '@/components/agents/AgentEmbedTab';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';
import { useAgentSettings } from '@/hooks/useAgentSettings';

const ClientAgentWidget = () => {
  const { clientId, agentId } = useParams();
  const { hasAccess, agentName, isLoading: accessLoading } = useClientAgentAccess(clientId, agentId);
  const { agent, isLoading: settingsLoading } = useAgentSettings(agentId);

  if (accessLoading || settingsLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!hasAccess || !agent) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">Accès non autorisé</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Widget & Intégration</h1>
        <p className="text-muted-foreground">{agentName}</p>
      </div>
      <AgentEmbedTab agent={agent} />
    </div>
  );
};

export default ClientAgentWidget;
