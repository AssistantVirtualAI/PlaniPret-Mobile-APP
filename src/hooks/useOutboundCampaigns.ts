import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { toast } from 'sonner';

export interface OutboundCampaign {
  id: string;
  organization_id: string;
  agent_id: string | null;
  name: string;
  description: string | null;
  phone_numbers: string[];
  schedule: Record<string, any>;
  status: 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled';
  total_calls: number;
  completed_calls: number;
  successful_calls: number;
  failed_calls: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  agents?: {
    id: string;
    name: string;
    platform: string;
  };
}

export interface CampaignCall {
  id: string;
  campaign_id: string;
  phone_number: string;
  status: 'pending' | 'calling' | 'completed' | 'failed' | 'no_answer';
  duration: number | null;
  outcome: string | null;
  transcript: string | null;
  metadata: Record<string, any>;
  called_at: string | null;
  created_at: string;
}

export const useOutboundCampaigns = () => {
  const { selectedOrgId } = useOrganization();
  const queryClient = useQueryClient();

  const campaignsQuery = useQuery({
    queryKey: ['outbound-campaigns', selectedOrgId],
    queryFn: async (): Promise<OutboundCampaign[]> => {
      if (!selectedOrgId) return [];

      const { data, error } = await supabase
        .from('outbound_campaigns')
        .select(`
          *,
          agents (id, name, platform)
        `)
        .eq('organization_id', selectedOrgId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      return (data || []).map(c => ({
        ...c,
        phone_numbers: (c.phone_numbers as string[]) || [],
        schedule: (c.schedule as Record<string, any>) || {},
        status: c.status as OutboundCampaign['status']
      })) as OutboundCampaign[];
    },
    enabled: !!selectedOrgId,
  });

  const createCampaign = useMutation({
    mutationFn: async (campaign: {
      name: string;
      description?: string;
      agent_id?: string;
      phone_numbers: string[];
      schedule?: Record<string, any>;
    }) => {
      if (!selectedOrgId) throw new Error('No organization selected');

      const { data, error } = await supabase
        .from('outbound_campaigns')
        .insert({
          organization_id: selectedOrgId,
          ...campaign
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outbound-campaigns'] });
      toast.success('Campagne créée');
    },
    onError: (error: Error) => {
      toast.error(`Erreur: ${error.message}`);
    }
  });

  const updateCampaign = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<OutboundCampaign> & { id: string }) => {
      const { agents, ...updateData } = updates as any;
      const { data, error } = await supabase
        .from('outbound_campaigns')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outbound-campaigns'] });
      toast.success('Campagne mise à jour');
    }
  });

  const controlCampaign = useMutation({
    mutationFn: async ({ campaign_id, action }: { campaign_id: string; action: 'start' | 'pause' | 'resume' | 'cancel' | 'complete' }) => {
      const { data, error } = await supabase.functions.invoke('start-outbound-campaign', {
        body: { campaign_id, action }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['outbound-campaigns'] });
      toast.success(data.message || 'Action effectuée');
    },
    onError: (error: Error) => {
      toast.error(`Erreur: ${error.message}`);
    }
  });

  const deleteCampaign = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('outbound_campaigns')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outbound-campaigns'] });
      toast.success('Campagne supprimée');
    }
  });

  return {
    campaigns: campaignsQuery.data || [],
    isLoading: campaignsQuery.isLoading,
    error: campaignsQuery.error,
    createCampaign,
    updateCampaign,
    controlCampaign,
    deleteCampaign,
    refetch: campaignsQuery.refetch
  };
};

export const useCampaignCalls = (campaignId: string | null) => {
  return useQuery({
    queryKey: ['campaign-calls', campaignId],
    queryFn: async (): Promise<CampaignCall[]> => {
      if (!campaignId) return [];

      const { data, error } = await supabase
        .from('campaign_calls')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []).map(c => ({
        ...c,
        metadata: (c.metadata as Record<string, any>) || {},
        status: c.status as CampaignCall['status']
      })) as CampaignCall[];
    },
    enabled: !!campaignId,
  });
};
