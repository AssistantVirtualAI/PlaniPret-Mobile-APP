import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Bot, Plus, Unlink, Settings, Crown, Eye, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PlatformBadge } from '@/components/agents/PlatformBadge';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface ClientAgentsTabProps {
  clientId: string;
  assignedAgents: any[];
  availableAgents: any[];
  onAssign: (agentId: string) => void;
  onUnassign: (agentId: string) => void;
}

export const ClientAgentsTab = ({ 
  clientId,
  assignedAgents, 
  availableAgents, 
  onAssign, 
  onUnassign 
}: ClientAgentsTabProps) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<'admin' | 'viewer'>('viewer');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Fetch client agent assignments
  const { data: assignments, isLoading } = useQuery({
    queryKey: ['client-agent-assignments', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_agent_assignments')
        .select(`
          id,
          role,
          agent_id,
          agents:agent_id (
            id,
            name,
            platform,
            platform_agent_id,
            config,
            created_at
          )
        `)
        .eq('client_id', clientId);

      if (error) throw error;
      return data || [];
    },
    enabled: !!clientId,
  });

  // Add assignment mutation
  const addAssignmentMutation = useMutation({
    mutationFn: async ({ agentId, role }: { agentId: string; role: 'admin' | 'viewer' }) => {
      const { error } = await supabase
        .from('client_agent_assignments')
        .insert({
          client_id: clientId,
          agent_id: agentId,
          role,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-agent-assignments', clientId] });
      toast.success('Agent assigné avec succès');
      setIsDialogOpen(false);
      setSelectedAgentId(null);
      setSelectedRole('viewer');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erreur lors de l\'assignation');
    },
  });

  // Update role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ assignmentId, role }: { assignmentId: string; role: 'admin' | 'viewer' }) => {
      const { error } = await supabase
        .from('client_agent_assignments')
        .update({ role })
        .eq('id', assignmentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-agent-assignments', clientId] });
      toast.success('Rôle mis à jour');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erreur lors de la mise à jour');
    },
  });

  // Remove assignment mutation
  const removeAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase
        .from('client_agent_assignments')
        .delete()
        .eq('id', assignmentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-agent-assignments', clientId] });
      toast.success('Agent retiré');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erreur lors de la suppression');
    },
  });

  const handleAssign = () => {
    if (!selectedAgentId) return;
    addAssignmentMutation.mutate({ agentId: selectedAgentId, role: selectedRole });
  };

  // Filter out already assigned agents from available agents
  const assignedAgentIds = assignments?.map(a => a.agent_id) || [];
  const filteredAvailableAgents = availableAgents?.filter(a => !assignedAgentIds.includes(a.id)) || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Agents assignés ({assignments?.length || 0})
          </CardTitle>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Assigner un agent
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Assigner un agent au client</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Agent</Label>
                  <Select value={selectedAgentId || ''} onValueChange={setSelectedAgentId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredAvailableAgents.length > 0 ? (
                        filteredAvailableAgents.map((agent) => (
                          <SelectItem key={agent.id} value={agent.id}>
                            <div className="flex items-center gap-2">
                              <Bot className="h-4 w-4" />
                              {agent.name}
                            </div>
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="" disabled>
                          Aucun agent disponible
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Rôle</Label>
                  <Select value={selectedRole} onValueChange={(v: 'admin' | 'viewer') => setSelectedRole(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">
                        <div className="flex items-center gap-2">
                          <Crown className="h-4 w-4 text-amber-500" />
                          Admin - Peut modifier
                        </div>
                      </SelectItem>
                      <SelectItem value="viewer">
                        <div className="flex items-center gap-2">
                          <Eye className="h-4 w-4 text-muted-foreground" />
                          Viewer - Lecture seule
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Annuler
                </Button>
                <Button 
                  onClick={handleAssign} 
                  disabled={!selectedAgentId || addAssignmentMutation.isPending}
                >
                  {addAssignmentMutation.isPending ? 'Assignation...' : 'Assigner'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Chargement...</div>
          ) : assignments && assignments.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Plateforme</TableHead>
                  <TableHead>Agent ID</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((assignment) => {
                  const agent = assignment.agents as any;
                  const config = agent?.config as Record<string, any> | null;
                  const elevenlabsAgentId = config?.agent_id || agent?.platform_agent_id;
                  
                  return (
                    <TableRow key={assignment.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Bot className="h-4 w-4 text-primary" />
                          {agent?.name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <PlatformBadge platform={agent?.platform} />
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {elevenlabsAgentId ? `${elevenlabsAgentId.slice(0, 12)}...` : '-'}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Select 
                          value={assignment.role} 
                          onValueChange={(v: 'admin' | 'viewer') => 
                            updateRoleMutation.mutate({ assignmentId: assignment.id, role: v })
                          }
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">
                              <div className="flex items-center gap-2">
                                <Crown className="h-3 w-3 text-amber-500" />
                                Admin
                              </div>
                            </SelectItem>
                            <SelectItem value="viewer">
                              <div className="flex items-center gap-2">
                                <Eye className="h-3 w-3 text-muted-foreground" />
                                Viewer
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(`/client/${clientId}/agent/${agent?.id}/dashboard`, '_blank')}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/agent-settings/${agent?.id}`)}
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => removeAssignmentMutation.mutate(assignment.id)}
                            disabled={removeAssignmentMutation.isPending}
                          >
                            <Unlink className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <Bot className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Aucun agent assigné à ce client</p>
              <p className="text-sm text-muted-foreground mt-1">
                Cliquez sur "Assigner un agent" pour donner accès au portail
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="border-dashed">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-primary/10">
              <Crown className="h-4 w-4 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="font-medium">Rôles d'accès</p>
              <p className="text-sm text-muted-foreground">
                <strong>Admin</strong> : Peut voir les conversations, analytics, base de connaissances et modifier le prompt de l'agent.
              </p>
              <p className="text-sm text-muted-foreground">
                <strong>Viewer</strong> : Accès en lecture seule à toutes les sections.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
