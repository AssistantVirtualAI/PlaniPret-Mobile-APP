import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Bot, Users } from 'lucide-react';

export interface AgentOption {
  id: string;
  name: string;
  platform_agent_id: string;
  conversations?: number;
}

interface AgentSelectorProps {
  agents: AgentOption[];
  selectedAgentId: string | null;
  onAgentChange: (agentId: string | null) => void;
  isLoading?: boolean;
}

export function AgentSelector({ 
  agents, 
  selectedAgentId, 
  onAgentChange,
  isLoading 
}: AgentSelectorProps) {
  const selectedAgent = agents.find(a => a.id === selectedAgentId);

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Bot className="h-4 w-4" />
        <span className="hidden sm:inline">Filtrer par agent:</span>
      </div>
      
      <Select
        value={selectedAgentId || 'all'}
        onValueChange={(value) => onAgentChange(value === 'all' ? null : value)}
        disabled={isLoading}
      >
        <SelectTrigger className="w-[200px] bg-background/50 backdrop-blur-sm">
          <SelectValue placeholder="Tous les agents">
            {selectedAgentId === null || selectedAgentId === 'all' ? (
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <span>Tous les agents</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                <span className="truncate">{selectedAgent?.name}</span>
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span>Tous les agents</span>
              <Badge variant="secondary" className="ml-auto text-xs">
                {agents.length}
              </Badge>
            </div>
          </SelectItem>
          
          {agents.map((agent) => (
            <SelectItem key={agent.id} value={agent.id}>
              <div className="flex items-center gap-2 w-full">
                <Bot className="h-4 w-4" />
                <span className="truncate flex-1">{agent.name}</span>
                {agent.conversations !== undefined && (
                  <Badge variant="outline" className="ml-2 text-xs">
                    {agent.conversations}
                  </Badge>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
