import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { useState } from 'react';

interface PhoneNumber {
  id: string;
  organization_id: string;
  phone_number: string;
  provider: string;
  provider_sid: string | null;
  friendly_name: string | null;
  capabilities: { voice: boolean; sms: boolean };
  status: string;
  monthly_cost: number | null;
  is_verified: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface SearchResult {
  phoneNumber: string;
  capabilities: { voice: boolean; sms: boolean };
  monthlyPrice: number;
}

export function usePhoneNumbers() {
  const { selectedOrg } = useOrganization();
  const queryClient = useQueryClient();
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const { data: phoneNumbers, isLoading } = useQuery({
    queryKey: ['phone-numbers', selectedOrg?.id],
    queryFn: async () => {
      if (!selectedOrg?.id) return [];

      const { data, error } = await supabase
        .from('phone_numbers')
        .select('*')
        .eq('organization_id', selectedOrg.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      return (data || []).map(item => ({
        ...item,
        capabilities: typeof item.capabilities === 'string' 
          ? JSON.parse(item.capabilities) 
          : item.capabilities as { voice: boolean; sms: boolean }
      })) as PhoneNumber[];
    },
    enabled: !!selectedOrg?.id,
  });

  const searchNumbers = useMutation({
    mutationFn: async ({ country, areaCode }: { country: string; areaCode?: string }) => {
      setIsSearching(true);
      try {
        const { data, error } = await supabase.functions.invoke('twilio-phone-numbers', {
          body: { action: 'search', country, areaCode }
        });

        if (error) throw error;
        setSearchResults(data.numbers || []);
        return data.numbers;
      } finally {
        setIsSearching(false);
      }
    }
  });

  const purchaseNumber = useMutation({
    mutationFn: async ({ phoneNumber }: { phoneNumber: string }) => {
      if (!selectedOrg?.id) throw new Error('No organization selected');

      const { data, error } = await supabase.functions.invoke('twilio-phone-numbers', {
        body: { 
          action: 'purchase', 
          phoneNumber,
          organizationId: selectedOrg.id
        }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phone-numbers'] });
      setSearchResults(null);
    }
  });

  const addSipNumber = useMutation({
    mutationFn: async (data: { phone_number: string; provider: string; friendly_name?: string }) => {
      if (!selectedOrg?.id) throw new Error('No organization selected');

      const { error } = await supabase
        .from('phone_numbers')
        .insert([{
          organization_id: selectedOrg.id,
          phone_number: data.phone_number,
          provider: data.provider,
          friendly_name: data.friendly_name || null,
          status: 'pending',
          capabilities: { voice: true, sms: false }
        }]);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phone-numbers'] });
    }
  });

  const deleteNumber = useMutation({
    mutationFn: async (id: string) => {
      const phone = phoneNumbers?.find(p => p.id === id);
      
      if (phone?.provider === 'twilio' && phone?.provider_sid) {
        await supabase.functions.invoke('twilio-phone-numbers', {
          body: { action: 'release', phoneNumberSid: phone.provider_sid }
        });
      }

      const { error } = await supabase
        .from('phone_numbers')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phone-numbers'] });
    }
  });

  return {
    phoneNumbers: phoneNumbers || [],
    isLoading,
    searchNumbers,
    purchaseNumber,
    addSipNumber,
    deleteNumber,
    searchResults,
    isSearching
  };
}
