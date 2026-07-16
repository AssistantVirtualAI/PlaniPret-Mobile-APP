import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Clock, CheckCircle, XCircle, AlertCircle, Filter, Bot } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useClientAgentConversations } from '@/hooks/useClientAgentConversations';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

interface ClientConversationsTabProps {
  clientId: string;
}

type StatusFilter = 'all' | 'resolved' | 'unresolved' | 'pending';
type AgentFilter = 'all' | string;

export function ClientConversationsTab({ clientId }: ClientConversationsTabProps) {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [agentFilter, setAgentFilter] = useState<AgentFilter>('all');

  const { data: conversations, isLoading } = useClientAgentConversations(clientId);

  // Get unique agents from conversations
  const uniqueAgents = conversations?.reduce((acc, conv) => {
    if (!acc.find(a => a.id === conv.agent_id)) {
      acc.push({ id: conv.agent_id, name: conv.agent_name });
    }
    return acc;
  }, [] as { id: string; name: string }[]) || [];

  const filteredConversations = conversations?.filter(conv => {
    const statusMatch = statusFilter === 'all' || 
      (statusFilter === 'resolved' && conv.status === 'completed') ||
      (statusFilter === 'pending' && conv.status !== 'completed');
    
    const agentMatch = agentFilter === 'all' || conv.agent_id === agentFilter;
    
    return statusMatch && agentMatch;
  });

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'completed':
        return <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">Terminée</Badge>;
      case 'failed':
        return <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">Échouée</Badge>;
      default:
        return <Badge variant="outline" className="text-yellow-600 border-yellow-200 bg-yellow-50">En cours</Badge>;
    }
  };

  const formatDuration = (seconds: number | null | undefined) => {
    if (!seconds) return '-';
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const isValidDate = (dateStr: string | undefined) => {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    return !isNaN(date.getTime());
  };

  if (isLoading) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card">
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4">
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Conversations ElevenLabs
          {conversations && (
            <Badge variant="secondary">{conversations.length}</Badge>
          )}
        </CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes</SelectItem>
              <SelectItem value="resolved">Terminées</SelectItem>
              <SelectItem value="pending">En cours</SelectItem>
            </SelectContent>
          </Select>
          {uniqueAgents.length > 1 && (
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Tous les agents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les agents</SelectItem>
                {uniqueAgents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!filteredConversations?.length ? (
          <div className="text-center py-12 text-muted-foreground">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p>Aucune conversation trouvée</p>
            <p className="text-sm mt-2">Les conversations des agents assignés apparaîtront ici</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredConversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => navigate(`/conversations/${conv.id}`)}
                className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {getStatusIcon(conv.status)}
                      <span className="font-medium truncate">
                        Conversation {conv.conversation_id?.substring(0, 8)}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                      {isValidDate(conv.start_time) && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(conv.start_time), { addSuffix: true, locale: fr })}
                        </span>
                      )}
                      {conv.duration && (
                        <span>Durée: {formatDuration(conv.duration)}</span>
                      )}
                      <span className="flex items-center gap-1">
                        <Bot className="h-3 w-3" />
                        {conv.agent_name}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {conv.satisfaction_score && (
                      <Badge variant="secondary">{conv.satisfaction_score}/5</Badge>
                    )}
                    {getStatusBadge(conv.status)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
