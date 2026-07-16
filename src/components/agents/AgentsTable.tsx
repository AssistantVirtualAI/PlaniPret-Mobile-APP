import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Settings, Trash2, MessageSquare, MoreHorizontal, ExternalLink, Bot, Phone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PlatformBadge } from './PlatformBadge';
import { QuickPromptModal } from './QuickPromptModal';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { motion } from 'framer-motion';

interface Agent {
  id: string;
  name: string;
  platform: string;
  platform_agent_id?: string | null;
  config: any;
  created_at: string;
  organization_id: string;
  client_id?: string | null;
  slug?: string | null;
  twilio_number?: string | null;
  client?: { id: string; name: string } | null;
}

interface AgentsTableProps {
  agents: Agent[];
  onRefetch: () => void;
}

export function AgentsTable({ agents, onRefetch }: AgentsTableProps) {
  const navigate = useNavigate();
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  
  const handleDelete = async (agentId: string) => {
    try {
      const agent = agents.find((item) => item.id === agentId);
      if (!agent?.organization_id) throw new Error('No organization selected');
      const { error } = await supabase
        .from('agents')
        .delete()
        .eq('organization_id', agent?.organization_id)
        .eq('id', agentId);

      if (error) throw error;

      toast.success('Agent supprimé avec succès');
      onRefetch();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la suppression');
    }
  };

  const handleOpenPrompt = (agent: Agent) => {
    setSelectedAgent(agent);
    setPromptModalOpen(true);
  };

  const getPromptSnippet = (config: any) => {
    const prompt = config?.system_prompt || config?.prompt || '';
    if (!prompt) return null;
    return prompt.length > 60 ? prompt.substring(0, 60) + '...' : prompt;
  };

  const getAgentSlug = (agent: Agent): string | null => {
    return agent.slug || agent.config?.slug || null;
  };

  const handleOpenPortal = (agent: Agent) => {
    const slug = getAgentSlug(agent);
    if (!slug) {
      toast.error('No slug is configured for this agent. Go to Settings to define one.');
      return;
    }

    const url = `/portal/${slug}`;
    // Some browsers block window.open from menu interactions; fallback to in-app navigation.
    const newTab = window.open(url, '_blank', 'noopener,noreferrer');
    if (!newTab) {
      navigate(url);
    }
  };

  return (
    <>
      <div className="relative rounded-2xl overflow-hidden border border-border bg-card/50 backdrop-blur-xl shadow-lg">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-secondary/5 to-accent/10" />
        <Table>
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead className="text-muted-foreground font-medium">Agent</TableHead>
              <TableHead className="text-muted-foreground font-medium">Plateforme</TableHead>
              <TableHead className="text-muted-foreground font-medium">Téléphone</TableHead>
              <TableHead className="text-muted-foreground font-medium">Prompt</TableHead>
              <TableHead className="text-muted-foreground font-medium">Client assigné</TableHead>
              <TableHead className="text-muted-foreground font-medium">Agent ID</TableHead>
              <TableHead className="text-muted-foreground font-medium">Date de création</TableHead>
              <TableHead className="text-right text-muted-foreground font-medium">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agents.map((agent, index) => (
              <motion.tr
                key={agent.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="border-border/40 hover:bg-muted/40 transition-colors group"
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="absolute inset-0 bg-gradient-to-r from-primary to-secondary rounded-lg blur opacity-30 group-hover:opacity-50 transition-opacity" />
                      <div className="relative w-10 h-10 bg-gradient-to-br from-primary to-secondary rounded-lg flex items-center justify-center">
                        <Bot className="h-5 w-5 text-primary-foreground" />
                      </div>
                    </div>
                    <span className="font-medium text-foreground">{agent.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <PlatformBadge platform={agent.platform} />
                </TableCell>
                <TableCell>
                  {agent.twilio_number ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="secondary" className="gap-1 font-mono text-xs cursor-pointer">
                            <Phone className="h-3 w-3" />
                            {agent.twilio_number.replace(/(\+\d{1,2})(\d{3})(\d{3})(\d{4})/, '$1 $2-***-$4')}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{agent.twilio_number}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </TableCell>
                <TableCell className="max-w-[200px]">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-auto p-1 text-left font-normal text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40"
                          onClick={() => handleOpenPrompt(agent)}
                        >
                          {getPromptSnippet(agent.config) || (
                            <span className="flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />
                              Configurer
                            </span>
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Cliquez pour modifier le prompt</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
                <TableCell>
                  {agent.client ? (
                    <span className="text-foreground">{agent.client.name}</span>
                  ) : (
                    <span className="text-muted-foreground">Non assigné</span>
                  )}
                </TableCell>
                <TableCell>
                  <code className="text-xs bg-muted/50 px-2 py-1 rounded text-foreground font-mono border border-border/50">
                    {agent.config?.agent_id || agent.platform_agent_id || 'N/A'}
                  </code>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {format(new Date(agent.created_at), 'dd MMM yyyy', { locale: fr })}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 bg-card/60 hover:bg-card border-border text-foreground shadow-sm"
                      >
                        <MoreHorizontal className="h-5 w-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-popover border-border shadow-lg z-50 min-w-[180px]">
                      <DropdownMenuItem onClick={() => navigate(`/agent-settings/${agent.id}`)}>
                        <Settings className="h-4 w-4 mr-2" />
                        Settings
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleOpenPrompt(agent)}>
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Edit Prompt
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-border" />
                      <DropdownMenuItem onClick={() => handleOpenPortal(agent)}>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Open portal
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-border" />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <DropdownMenuItem 
                            onSelect={(e) => e.preventDefault()}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-popover border-border">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-foreground">Delete agent?</AlertDialogTitle>
                            <AlertDialogDescription className="text-muted-foreground">
                              This action cannot be undone. The agent "{agent.name}" will be permanently deleted.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="border-slate-700">Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(agent.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </motion.tr>
            ))}
          </TableBody>
        </Table>
      </div>

      {selectedAgent && (
        <QuickPromptModal
          open={promptModalOpen}
          onOpenChange={setPromptModalOpen}
          agentId={selectedAgent.id}
          agentName={selectedAgent.name}
          platform={selectedAgent.platform}
          platformAgentId={selectedAgent.config?.agent_id || selectedAgent.platform_agent_id}
          organizationId={selectedAgent.organization_id}
        />
      )}
    </>
  );
}
