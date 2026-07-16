import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ClientDetail {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  login_id: string | null;
  language: string | null;
  theme: string | null;
  status: string | null;
  custom_css: string | null;
  access_controls: Record<string, boolean> | null;
  organization_id: string;
  assigned_agent_id: string | null;
  created_at: string;
  updated_at: string;
}

export const useClientDetail = (clientId: string | undefined) => {
  const queryClient = useQueryClient();

  const { data: client, isLoading } = useQuery({
    queryKey: ['client-detail', clientId],
    queryFn: async () => {
      if (!clientId) return null;
      
      const { data, error } = await supabase
        .from('clients_safe')
        .select('*')
        .eq('id', clientId)
        .single();

      if (error) throw error;
      
      return {
        ...data,
        hasPassword: data.has_password || false
      } as ClientDetail & { hasPassword: boolean };
    },
    enabled: !!clientId,
  });

  const { data: clientMembers } = useQuery({
    queryKey: ['client-members', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      
      const { data, error } = await supabase
        .from('client_members_safe')
        .select('*')
        .eq('client_id', clientId);

      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  // Use client_agent_assignments table to get assigned agents
  const { data: assignedAgents } = useQuery({
    queryKey: ['client-agents', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      
      const { data, error } = await supabase
        .from('client_agent_assignments')
        .select(`
          id,
          role,
          can_edit_knowledge,
          can_edit_prompt,
          agent:agents(*)
        `)
        .eq('client_id', clientId);

      if (error) throw error;
      
      // Flatten to return agent objects with assignment info
      return data?.map(assignment => ({
        ...assignment.agent,
        assignment_id: assignment.id,
        assignment_role: assignment.role,
        can_edit_knowledge: assignment.can_edit_knowledge,
        can_edit_prompt: assignment.can_edit_prompt,
      })) || [];
    },
    enabled: !!clientId,
  });

  const { data: availableAgents } = useQuery({
    queryKey: ['available-agents', client?.organization_id, clientId],
    queryFn: async () => {
      if (!client?.organization_id || !clientId) return [];
      
      // Get agents in the organization that are NOT assigned to this client
      const { data: allAgents, error: agentsError } = await supabase
        .from('agents_safe')
        .select('*')
        .eq('organization_id', client.organization_id);

      if (agentsError) throw agentsError;

      // Get already assigned agent IDs for this client
      const { data: assignments } = await supabase
        .from('client_agent_assignments')
        .select('agent_id')
        .eq('client_id', clientId);

      const assignedAgentIds = new Set(assignments?.map(a => a.agent_id) || []);
      
      // Return agents not already assigned
      return allAgents?.filter(agent => !assignedAgentIds.has(agent.id)) || [];
    },
    enabled: !!client?.organization_id && !!clientId,
  });

  const updateClientMutation = useMutation({
    mutationFn: async (updates: Partial<ClientDetail>) => {
      if (!clientId) throw new Error('No client ID');
      
      const { error } = await supabase
        .from('clients')
        .update(updates)
        .eq('id', clientId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-detail', clientId] });
      toast.success('Client mis à jour');
    },
    onError: () => {
      toast.error('Erreur lors de la mise à jour');
    },
  });

  // Assign agent using client_agent_assignments table
  const assignAgentMutation = useMutation({
    mutationFn: async (agentId: string) => {
      if (!clientId) throw new Error('No client ID');
      
      const { error } = await supabase
        .from('client_agent_assignments')
        .insert({
          client_id: clientId,
          agent_id: agentId,
          role: 'viewer',
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-agents', clientId] });
      queryClient.invalidateQueries({ queryKey: ['available-agents'] });
      toast.success('Agent assigné');
    },
    onError: () => {
      toast.error('Erreur lors de l\'assignation');
    },
  });

  // Unassign agent by removing from client_agent_assignments
  const unassignAgentMutation = useMutation({
    mutationFn: async (agentId: string) => {
      if (!clientId) throw new Error('No client ID');
      
      const { error } = await supabase
        .from('client_agent_assignments')
        .delete()
        .eq('client_id', clientId)
        .eq('agent_id', agentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-agents', clientId] });
      queryClient.invalidateQueries({ queryKey: ['available-agents'] });
      toast.success('Agent détaché');
    },
    onError: () => {
      toast.error('Erreur lors du détachement');
    },
  });

  return {
    client,
    clientMembers,
    assignedAgents,
    availableAgents,
    isLoading,
    updateClient: updateClientMutation.mutate,
    assignAgent: assignAgentMutation.mutate,
    unassignAgent: unassignAgentMutation.mutate,
    isUpdating: updateClientMutation.isPending,
  };
};
