import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Users, UserPlus, Search, Trash2, Calendar, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface AgentClientsTabProps {
  agentId: string;
  organizationId: string;
}

export const AgentClientsTab = ({ agentId, organizationId }: AgentClientsTabProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const queryClient = useQueryClient();

  // Fetch assigned clients
  const { data: assignments, isLoading } = useQuery({
    queryKey: ['agent-clients', agentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_agent_assignments')
        .select(`
          id,
          role,
          created_at,
          client:clients(id, name, email, status)
        `)
        .eq('agent_id', agentId);

      if (error) throw error;
      return data;
    },
  });

  // Fetch available clients (not yet assigned)
  const { data: availableClients } = useQuery({
    queryKey: ['available-clients', agentId, organizationId],
    queryFn: async () => {
      const { data: allClients, error } = await supabase
        .from('clients')
        .select('id, name, email, status')
        .eq('organization_id', organizationId)
        .eq('status', 'active');

      if (error) throw error;

      const assignedIds = assignments?.map(a => a.client?.id).filter(Boolean) || [];
      return allClients?.filter(c => !assignedIds.includes(c.id)) || [];
    },
    enabled: !!assignments,
  });

  // Assign client mutation
  const assignMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const { error } = await supabase
        .from('client_agent_assignments')
        .insert({ agent_id: agentId, client_id: clientId, role: 'viewer' });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-clients', agentId] });
      queryClient.invalidateQueries({ queryKey: ['available-clients', agentId] });
      setSelectedClientId('');
      toast.success('Client assigné avec succès');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Remove assignment mutation
  const removeMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase
        .from('client_agent_assignments')
        .delete()
        .eq('id', assignmentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-clients', agentId] });
      queryClient.invalidateQueries({ queryKey: ['available-clients', agentId] });
      toast.success('Client retiré avec succès');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const filteredAssignments = assignments?.filter(a => 
    a.client?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.client?.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Assign new client */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Assigner un client
          </CardTitle>
          <CardDescription>
            Donnez accès à cet agent à un client de votre organisation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Select value={selectedClientId} onValueChange={setSelectedClientId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Sélectionner un client..." />
              </SelectTrigger>
              <SelectContent>
                {availableClients?.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    <div className="flex items-center gap-2">
                      <span>{client.name}</span>
                      {client.email && (
                        <span className="text-muted-foreground text-xs">({client.email})</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
                {availableClients?.length === 0 && (
                  <SelectItem value="" disabled>
                    Tous les clients sont déjà assignés
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <Button 
              onClick={() => selectedClientId && assignMutation.mutate(selectedClientId)}
              disabled={!selectedClientId || assignMutation.isPending}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Assigner
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Assigned clients list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Clients assignés
            {assignments && (
              <Badge variant="secondary">{assignments.length}</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Liste des clients ayant accès à cet agent
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          {assignments && assignments.length > 3 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher un client..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          )}

          {/* List */}
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Chargement...
            </div>
          ) : filteredAssignments?.length === 0 ? (
            <div className="text-center py-8">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {searchTerm ? 'Aucun client trouvé' : 'Aucun client assigné à cet agent'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredAssignments?.map((assignment) => (
                <div
                  key={assignment.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <Avatar>
                      <AvatarFallback>
                        {assignment.client?.name?.substring(0, 2).toUpperCase() || '??'}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{assignment.client?.name || 'Client inconnu'}</p>
                      {assignment.client?.email && (
                        <p className="text-sm text-muted-foreground">{assignment.client.email}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <Badge variant={assignment.client?.status === 'active' ? 'default' : 'secondary'}>
                        {assignment.client?.status === 'active' ? 'Actif' : 'Inactif'}
                      </Badge>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(assignment.created_at), 'dd MMM yyyy', { locale: fr })}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMutation.mutate(assignment.id)}
                      disabled={removeMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
