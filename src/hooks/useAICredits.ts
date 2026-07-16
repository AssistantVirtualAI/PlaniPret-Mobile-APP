import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';

export const useAICredits = () => {
  const { selectedOrgId } = useOrganization();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['ai-credits', selectedOrgId],
    queryFn: async () => {
      if (!selectedOrgId) return { credits: 825, creditsUsed: 0 };

      const { data: billingData } = await supabase
        .from('billing_config')
        .select('ai_credits, credits_used')
        .eq('organization_id', selectedOrgId)
        .maybeSingle();

      return {
        credits: billingData?.ai_credits || 825,
        creditsUsed: billingData?.credits_used || 0,
      };
    },
    enabled: !!selectedOrgId,
  });

  return {
    credits: data?.credits || 825,
    creditsUsed: data?.creditsUsed || 0,
    isLoading,
    refetch,
  };
};
