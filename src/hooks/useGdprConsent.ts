import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type ConsentType = 'cookies_essential' | 'cookies_analytics' | 'cookies_marketing' | 'data_processing';

interface Consent {
  type: ConsentType;
  consented: boolean;
}

interface UseGdprConsentReturn {
  consents: Record<ConsentType, boolean>;
  isLoading: boolean;
  hasInteracted: boolean;
  acceptAll: () => Promise<void>;
  acceptEssential: () => Promise<void>;
  updateConsent: (type: ConsentType, consented: boolean) => Promise<void>;
  saveConsents: (consents: Consent[]) => Promise<void>;
}

const CONSENT_STORAGE_KEY = 'gdpr_consent_given';

export const useGdprConsent = (organizationId?: string): UseGdprConsentReturn => {
  const { user } = useAuth();
  const [consents, setConsents] = useState<Record<ConsentType, boolean>>({
    cookies_essential: true,
    cookies_analytics: false,
    cookies_marketing: false,
    data_processing: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (stored) {
      setHasInteracted(true);
      try {
        const parsed = JSON.parse(stored);
        setConsents(prev => ({ ...prev, ...parsed }));
      } catch (e) {
        console.error('Failed to parse stored consents');
      }
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (user && organizationId) {
      loadUserConsents();
    }
  }, [user, organizationId]);

  const loadUserConsents = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('user_consents')
      .select('consent_type, consented')
      .eq('user_id', user.id);

    if (data && data.length > 0) {
      setHasInteracted(true);
      const userConsents = data.reduce((acc, item) => {
        acc[item.consent_type as ConsentType] = item.consented;
        return acc;
      }, {} as Record<ConsentType, boolean>);
      setConsents(prev => ({ ...prev, ...userConsents }));
    }
  };

  const saveConsents = useCallback(async (consentList: Consent[]) => {
    const newConsents = consentList.reduce((acc, c) => {
      acc[c.type] = c.consented;
      return acc;
    }, {} as Record<ConsentType, boolean>);

    setConsents(prev => ({ ...prev, ...newConsents }));
    setHasInteracted(true);
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ ...consents, ...newConsents }));

    if (user && organizationId) {
      for (const consent of consentList) {
        await supabase.from('user_consents').upsert({
          user_id: user.id,
          organization_id: organizationId,
          consent_type: consent.type,
          consented: consent.consented,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,consent_type',
        });
      }
    }
  }, [user, organizationId, consents]);

  const acceptAll = useCallback(async () => {
    await saveConsents([
      { type: 'cookies_essential', consented: true },
      { type: 'cookies_analytics', consented: true },
      { type: 'cookies_marketing', consented: true },
      { type: 'data_processing', consented: true },
    ]);
  }, [saveConsents]);

  const acceptEssential = useCallback(async () => {
    await saveConsents([
      { type: 'cookies_essential', consented: true },
      { type: 'cookies_analytics', consented: false },
      { type: 'cookies_marketing', consented: false },
      { type: 'data_processing', consented: false },
    ]);
  }, [saveConsents]);

  const updateConsent = useCallback(async (type: ConsentType, consented: boolean) => {
    await saveConsents([{ type, consented }]);
  }, [saveConsents]);

  return {
    consents,
    isLoading,
    hasInteracted,
    acceptAll,
    acceptEssential,
    updateConsent,
    saveConsents,
  };
};
