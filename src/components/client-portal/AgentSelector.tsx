import { useClientAssignedAgents } from '@/hooks/useClientAgentAccess';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Bot, Crown, Eye } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';

export const AgentSelector = () => {
  const { clientId, agentId: currentAgentId } = useParams();
  const { data: agents, isLoading } = useClientAssignedAgents(clientId);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (!agents || agents.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-4 text-center text-muted-foreground">
          <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Aucun agent assigné</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground mb-3">Mes Agents</h3>
      {agents.map(({ assignmentId, role, agent }) => {
        const config = agent?.config as Record<string, any> | null;
        const elevenlabsAgentId = config?.agent_id;
        const isActive = agent?.id === currentAgentId;

        return (
          <Link
            key={assignmentId}
            to={`/client/${clientId}/agent/${agent?.id}/dashboard`}
          >
            <Card className={`cursor-pointer transition-all hover:border-primary/50 ${isActive ? 'border-primary bg-primary/5' : ''}`}>
              <CardContent className="p-3 flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={agent?.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/10">
                    <Bot className="h-5 w-5 text-primary" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{agent?.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {elevenlabsAgentId ? `ID: ${elevenlabsAgentId.slice(0, 8)}...` : 'Non configuré'}
                  </p>
                </div>
                <Badge 
                  variant={role === 'admin' ? 'default' : 'secondary'}
                  className="flex items-center gap-1"
                >
                  {role === 'admin' ? (
                    <>
                      <Crown className="h-3 w-3" />
                      Admin
                    </>
                  ) : (
                    <>
                      <Eye className="h-3 w-3" />
                      Viewer
                    </>
                  )}
                </Badge>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
};
