import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/useTranslation';

export interface WebhookEndpoint {
  id: string;
  organization_id: string;
  url: string;
  secret: string;
  events: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WebhookDeliveryLog {
  id: string;
  endpoint_id: string;
  event_type: string;
  payload: any;
  response_status: number | null;
  response_body: string | null;
  attempt_count: number;
  delivered_at: string | null;
  created_at: string;
}

export const WEBHOOK_EVENT_TYPES = [
  'conversation.created',
  'conversation.completed',
  'agent.created',
  'agent.updated',
  'client.created',
  'subscription.updated',
] as const;

export type WebhookEventType = typeof WEBHOOK_EVENT_TYPES[number];

const generateSecret = () => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
};

export const useWebhookEndpoints = () => {
  const { selectedOrgId } = useOrganization();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const endpointsQuery = useQuery({
    queryKey: ['webhook-endpoints', selectedOrgId],
    queryFn: async () => {
      if (!selectedOrgId) return [];
      
      const { data, error } = await supabase
        .from('webhook_endpoints')
        .select('id,organization_id,url,events,is_active,created_at,updated_at')
        .eq('organization_id', selectedOrgId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as WebhookEndpoint[];
    },
    enabled: !!selectedOrgId,
  });

  const deliveryLogsQuery = useQuery({
    queryKey: ['webhook-delivery-logs', selectedOrgId],
    queryFn: async () => {
      if (!selectedOrgId) return [];
      
      const { data, error } = await supabase
        .from('webhook_delivery_logs')
        .select(`
          *,
          webhook_endpoints!inner(organization_id)
        `)
        .eq('webhook_endpoints.organization_id', selectedOrgId)
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      return data as WebhookDeliveryLog[];
    },
    enabled: !!selectedOrgId,
  });

  const createEndpoint = useMutation({
    mutationFn: async ({ url, events }: { url: string; events: string[] }) => {
      if (!selectedOrgId) throw new Error(t('messages.noOrganization'));
      
      const secret = generateSecret();
      
      const { data, error } = await supabase
        .from('webhook_endpoints')
        .insert({
          organization_id: selectedOrgId,
          url,
          secret,
          events,
          is_active: true,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-endpoints'] });
      toast.success(t('messages.webhookCreated'));
    },
    onError: (error) => {
      toast.error(t('messages.createError'));
      console.error(error);
    },
  });

  const updateEndpoint = useMutation({
    mutationFn: async ({ id, url, events, is_active }: Partial<WebhookEndpoint> & { id: string }) => {
      const { data, error } = await supabase
        .from('webhook_endpoints')
        .update({ url, events, is_active, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-endpoints'] });
      toast.success(t('messages.webhookUpdated'));
    },
    onError: (error) => {
      toast.error(t('messages.updateError'));
      console.error(error);
    },
  });

  const deleteEndpoint = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('webhook_endpoints')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-endpoints'] });
      toast.success(t('messages.webhookDeleted'));
    },
    onError: (error) => {
      toast.error(t('messages.deleteError'));
      console.error(error);
    },
  });

  const regenerateSecret = useMutation({
    mutationFn: async (id: string) => {
      const secret = generateSecret();
      
      const { data, error } = await supabase
        .from('webhook_endpoints')
        .update({ secret, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-endpoints'] });
      toast.success(t('messages.secretRegenerated'));
    },
    onError: (error) => {
      toast.error(t('messages.updateError'));
      console.error(error);
    },
  });

  return {
    endpoints: endpointsQuery.data || [],
    deliveryLogs: deliveryLogsQuery.data || [],
    isLoading: endpointsQuery.isLoading,
    isLogsLoading: deliveryLogsQuery.isLoading,
    createEndpoint,
    updateEndpoint,
    deleteEndpoint,
    regenerateSecret,
  };
};
