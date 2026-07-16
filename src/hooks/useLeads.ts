import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/useTranslation';

export interface Lead {
  id: string;
  organization_id: string;
  conversation_id: string | null;
  agent_id: string | null;
  client_id: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: 'new' | 'qualified' | 'contacted' | 'converted' | 'lost';
  score: number;
  source: string | null;
  metadata: Record<string, unknown>;
  qualified_at: string | null;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useLeads() {
  const { selectedOrg } = useOrganization();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const { data: leads, isLoading } = useQuery({
    queryKey: ['leads', selectedOrg?.id],
    queryFn: async () => {
      if (!selectedOrg?.id) return [];

      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('organization_id', selectedOrg.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Lead[];
    },
    enabled: !!selectedOrg?.id,
  });

  const createLead = useMutation({
    mutationFn: async (lead: Partial<Lead>) => {
      if (!selectedOrg?.id) throw new Error(t('messages.noOrganization'));

      const { data, error } = await supabase
        .from('leads')
        .insert([{
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          status: lead.status || 'new',
          score: lead.score || 0,
          source: lead.source,
          metadata: (lead.metadata || {}) as unknown as Record<string, never>,
          conversation_id: lead.conversation_id,
          agent_id: lead.agent_id,
          client_id: lead.client_id,
          organization_id: selectedOrg.id
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success(t('messages.leadCreated'));
    }
  });

  const updateLead = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Lead> & { id: string }) => {
      const updateData = { ...updates } as any;
      
      if (updates.status === 'qualified' && !updates.qualified_at) {
        updateData.qualified_at = new Date().toISOString();
      }
      if (updates.status === 'converted' && !updates.converted_at) {
        updateData.converted_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('leads')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success(t('messages.leadUpdated'));
    }
  });

  const deleteLead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('leads')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success(t('messages.leadDeleted'));
    }
  });

  // Stats
  const stats = {
    total: leads?.length || 0,
    new: leads?.filter(l => l.status === 'new').length || 0,
    qualified: leads?.filter(l => l.status === 'qualified').length || 0,
    contacted: leads?.filter(l => l.status === 'contacted').length || 0,
    converted: leads?.filter(l => l.status === 'converted').length || 0,
    lost: leads?.filter(l => l.status === 'lost').length || 0,
  };

  return {
    leads: leads || [],
    stats,
    isLoading,
    createLead,
    updateLead,
    deleteLead
  };
}
