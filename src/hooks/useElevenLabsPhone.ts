import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { ElevenLabsPhoneNumber } from '@/types/elevenlabs';

interface UseElevenLabsPhoneParams {
  apiKey?: string;
  agentId?: string;
}

export function useElevenLabsPhoneNumbers({ apiKey, agentId }: UseElevenLabsPhoneParams = {}) {
  return useQuery({
    queryKey: ['elevenlabs-phone-numbers', agentId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-phone-numbers', {
        body: { action: 'list', agentId, apiKey },
      });

      if (error) throw error;
      return (data?.phone_numbers || []) as ElevenLabsPhoneNumber[];
    },
    enabled: !!apiKey || !!agentId,
  });
}

export function useCreateElevenLabsPhone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      apiKey,
      agentId,
      phoneConfig,
    }: {
      apiKey?: string;
      agentId: string;
      phoneConfig: {
        phone_number: string;
        label?: string;
        phone_number_type: 'twilio' | 'sip';
        twilio_config?: {
          account_sid: string;
          auth_token: string;
          phone_number_sid: string;
        };
        sip_config?: {
          sip_trunk_uri: string;
          username?: string;
          password?: string;
        };
      };
    }) => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-phone-numbers', {
        body: { 
          action: 'create', 
          agentId, 
          apiKey,
          phoneConfig,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['elevenlabs-phone-numbers'] });
      toast.success('Numéro de téléphone ajouté avec succès');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erreur lors de l\'ajout du numéro');
    },
  });
}

export function useDeleteElevenLabsPhone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      apiKey,
      phoneNumberId,
    }: {
      apiKey?: string;
      phoneNumberId: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-phone-numbers', {
        body: { 
          action: 'delete', 
          phoneNumberId,
          apiKey,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['elevenlabs-phone-numbers'] });
      toast.success('Numéro de téléphone supprimé');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erreur lors de la suppression');
    },
  });
}

export function useAssignAgentToPhone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      apiKey,
      phoneNumberId,
      agentId,
    }: {
      apiKey?: string;
      phoneNumberId: string;
      agentId: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-phone-numbers', {
        body: { 
          action: 'assign_agent', 
          phoneNumberId,
          agentId,
          apiKey,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['elevenlabs-phone-numbers'] });
      toast.success('Agent assigné au numéro');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erreur lors de l\'assignation');
    },
  });
}
