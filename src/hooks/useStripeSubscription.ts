import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { toast } from 'sonner';
import { useBillingConfig } from './useBillingConfig';
import { useTranslation } from '@/hooks/useTranslation';

export function useStripeSubscription() {
  const { selectedOrg: selectedOrganization } = useOrganization();
  const { refetch } = useBillingConfig();
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);

  const createCheckoutSession = async (priceId: string, trialDays?: number) => {
    if (!selectedOrganization?.id) {
      toast.error(t('messages.noOrganization'));
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-create-checkout', {
        body: {
          organizationId: selectedOrganization.id,
          priceId,
          trialDays: trialDays || undefined,
          successUrl: `${window.location.origin}/billing?success=true`,
          cancelUrl: `${window.location.origin}/billing?canceled=true`,
        },
      });

      if (error) throw error;

      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (error: any) {
      console.error('Checkout error:', error);
      toast.error(t('messages.paymentError'));
    } finally {
      setIsLoading(false);
    }
  };

  const openCustomerPortal = async () => {
    if (!selectedOrganization?.id) {
      toast.error(t('messages.noOrganization'));
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-portal', {
        body: {
          organizationId: selectedOrganization.id,
          returnUrl: `${window.location.origin}/billing`,
        },
      });

      if (error) throw error;

      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (error: any) {
      console.error('Portal error:', error);
      toast.error(t('messages.portalError'));
    } finally {
      setIsLoading(false);
    }
  };

  const refreshSubscription = async () => {
    await refetch();
  };

  return {
    createCheckoutSession,
    openCustomerPortal,
    refreshSubscription,
    isLoading,
  };
}
