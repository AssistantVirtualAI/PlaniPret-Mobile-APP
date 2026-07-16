import { useParams } from 'react-router-dom';
import { useClientAgentAccess } from '@/hooks/useClientAgentAccess';
import { AgentMCPConfigTab } from '@/components/agents/AgentMCPConfigTab';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

const ClientAgentMCP = () => {
  const { clientId, agentId } = useParams();
  const { hasAccess, canEdit, agentName, isLoading } = useClientAgentAccess(clientId, agentId);
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!hasAccess || !agentId) {
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
        <h1 className="text-2xl font-bold">{t('mcp.title')}</h1>
        <p className="text-muted-foreground">{agentName}</p>
      </div>
      <AgentMCPConfigTab agentId={agentId} />
    </div>
  );
};

export default ClientAgentMCP;
