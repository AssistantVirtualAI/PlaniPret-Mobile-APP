import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { toast } from 'sonner';

export interface OnboardingState {
  isOnboardingComplete: boolean;
  isLoading: boolean;
  currentStep: number;
}

export const useOnboarding = () => {
  const { selectedOrg, refreshOrganization } = useOrganization();
  const [state, setState] = useState<OnboardingState>({
    isOnboardingComplete: true,
    isLoading: true,
    currentStep: 1,
  });

  useEffect(() => {
    if (selectedOrg) {
      // Cast to any to access the new column that may not be in types yet
      const org = selectedOrg as any;
      setState(prev => ({
        ...prev,
        isOnboardingComplete: org.onboarding_completed ?? true,
        isLoading: false,
      }));
    }
  }, [selectedOrg]);

  const setCurrentStep = useCallback((step: number) => {
    setState(prev => ({ ...prev, currentStep: step }));
  }, []);

  const completeOnboarding = useCallback(async () => {
    if (!selectedOrg?.id) return;

    try {
      const { error } = await supabase
        .from('organizations')
        .update({ onboarding_completed: true } as any)
        .eq('id', selectedOrg.id);

      if (error) throw error;

      setState(prev => ({ ...prev, isOnboardingComplete: true }));
      await refreshOrganization();
      toast.success('Onboarding terminé !');
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la finalisation');
    }
  }, [selectedOrg?.id, refreshOrganization]);

  const skipOnboarding = useCallback(async () => {
    await completeOnboarding();
  }, [completeOnboarding]);

  return {
    ...state,
    setCurrentStep,
    completeOnboarding,
    skipOnboarding,
    showWelcomeModal: !state.isLoading && !state.isOnboardingComplete,
  };
};