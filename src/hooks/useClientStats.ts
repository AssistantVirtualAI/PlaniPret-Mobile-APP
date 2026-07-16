import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';

export const useClientStats = () => {
  const { selectedOrgId } = useOrganization();

  const { data, isLoading } = useQuery({
    queryKey: ['client-stats', selectedOrgId],
    queryFn: async () => {
      if (!selectedOrgId) return { activeClients: 0, clientLimit: 5 };

      // Get organization billing config
      const { data: billingData } = await supabase
        .from('billing_config')
        .select('credits_limit')
        .eq('organization_id', selectedOrgId)
        .maybeSingle();

      // Count active clients
      const { count } = await supabase
        .from('clients')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', selectedOrgId)
        .eq('status', 'active');

      return {
        activeClients: count || 0,
        clientLimit: billingData?.credits_limit || 5,
      };
    },
    enabled: !!selectedOrgId,
  });

  return {
    activeClients: data?.activeClients || 0,
    clientLimit: data?.clientLimit || 5,
    isLoading,
  };
};
