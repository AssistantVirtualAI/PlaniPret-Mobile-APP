import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { toast } from 'sonner';

export interface PerformanceMetrics {
  appointments_booked: number;
  appointments_completed: number;
  leads_generated: number;
  leads_qualified: number;
  leads_converted: number;
  conversations_count: number;
  total_duration_minutes: number;
  billable_amount: number;
  pricing?: {
    price_per_appointment: number;
    price_per_qualified_lead: number;
    price_per_converted_lead: number;
  };
}

export interface PerformanceHistory {
  id: string;
  period_start: string;
  period_end: string;
  appointments_booked: number;
  appointments_completed: number;
  leads_generated: number;
  leads_qualified: number;
  leads_converted: number;
  conversations_count: number;
  total_duration_minutes: number;
  billable_amount: number;
  billed_at: string | null;
  stripe_invoice_id: string | null;
}

export function usePerformanceBilling() {
  const { selectedOrg } = useOrganization();
  const queryClient = useQueryClient();

  // Get current period metrics
  const { data: currentMetrics, isLoading: isCalculating, refetch: recalculate } = useQuery({
    queryKey: ['performance-metrics', selectedOrg?.id],
    queryFn: async () => {
      if (!selectedOrg?.id) return null;

      const { data, error } = await supabase.functions.invoke('calculate-performance-billing', {
        body: {
          action: 'calculate',
          organization_id: selectedOrg.id
        }
      });

      if (error) throw error;
      return data.metrics as PerformanceMetrics;
    },
    enabled: !!selectedOrg?.id,
    staleTime: 60 * 1000, // 1 minute
  });

  // Get historical metrics
  const { data: history, isLoading: isLoadingHistory } = useQuery({
    queryKey: ['performance-history', selectedOrg?.id],
    queryFn: async () => {
      if (!selectedOrg?.id) return [];

      const { data, error } = await supabase.functions.invoke('calculate-performance-billing', {
        body: {
          action: 'get_history',
          organization_id: selectedOrg.id
        }
      });

      if (error) throw error;
      return data.history as PerformanceHistory[];
    },
    enabled: !!selectedOrg?.id,
  });

  // Get billing config
  const { data: billingConfig } = useQuery({
    queryKey: ['performance-billing-config', selectedOrg?.id],
    queryFn: async () => {
      if (!selectedOrg?.id) return null;

      const { data, error } = await supabase
        .from('billing_config')
        .select('performance_billing_enabled, price_per_appointment, price_per_qualified_lead, price_per_converted_lead')
        .eq('organization_id', selectedOrg.id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!selectedOrg?.id,
  });

  // Update billing config
  const updateConfig = useMutation({
    mutationFn: async (config: {
      performance_billing_enabled?: boolean;
      price_per_appointment?: number;
      price_per_qualified_lead?: number;
      price_per_converted_lead?: number;
    }) => {
      if (!selectedOrg?.id) throw new Error('No organization selected');

      const { error } = await supabase
        .from('billing_config')
        .update(config)
        .eq('organization_id', selectedOrg.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['performance-billing-config'] });
      toast.success('Configuration mise à jour');
    },
    onError: (error) => {
      toast.error('Erreur: ' + (error as Error).message);
    }
  });

  return {
    currentMetrics,
    history: history || [],
    billingConfig,
    isCalculating,
    isLoadingHistory,
    recalculate,
    updateConfig
  };
}
