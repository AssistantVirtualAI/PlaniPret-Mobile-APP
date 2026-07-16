import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/useTranslation';

export const useCalendarIntegration = () => {
  const { selectedOrg } = useOrganization();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const { data: integration, isLoading } = useQuery({
    queryKey: ['calendar-integration', selectedOrg?.id],
    queryFn: async () => {
      if (!selectedOrg?.id) return null;
      
      // Use the safe view that doesn't expose OAuth tokens
      const { data, error } = await supabase
        .from('calendar_integrations_safe')
        .select('*')
        .eq('organization_id', selectedOrg.id)
        .eq('provider', 'google')
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!selectedOrg?.id,
  });

  const connectGoogle = useMutation({
    mutationFn: async () => {
      if (!selectedOrg?.id) throw new Error(t('messages.noOrganization'));

      const redirectUri = `${window.location.origin}/settings?tab=integrations&callback=google`;
      
      const { data, error } = await supabase.functions.invoke('google-calendar-auth', {
        body: {
          action: 'get-auth-url',
          organizationId: selectedOrg.id,
          redirectUri
        }
      });

      if (error) throw error;
      
      if (data.error) {
        throw new Error(data.message || data.error);
      }

      // Redirect to Google OAuth
      window.location.href = data.authUrl;
    },
    onError: (error: Error) => {
      toast.error(error.message || t('messages.calendarError'));
    }
  });

  const exchangeCode = useMutation({
    mutationFn: async (code: string) => {
      if (!selectedOrg?.id) throw new Error(t('messages.noOrganization'));

      const redirectUri = `${window.location.origin}/settings?tab=integrations&callback=google`;

      const { data, error } = await supabase.functions.invoke('google-calendar-auth', {
        body: {
          action: 'exchange-code',
          organizationId: selectedOrg.id,
          code,
          redirectUri
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-integration'] });
      toast.success(t('messages.calendarConnected'));
    },
    onError: (error: Error) => {
      toast.error(error.message || t('messages.calendarError'));
    }
  });

  const disconnect = useMutation({
    mutationFn: async () => {
      if (!selectedOrg?.id) throw new Error(t('messages.noOrganization'));

      const { data, error } = await supabase.functions.invoke('google-calendar-auth', {
        body: {
          action: 'disconnect',
          organizationId: selectedOrg.id
        }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-integration'] });
      toast.success(t('messages.calendarDisconnected'));
    },
    onError: (error: Error) => {
      toast.error(error.message || t('messages.calendarError'));
    }
  });

  return {
    integration,
    isLoading,
    isConnected: !!integration?.is_active,
    connectGoogle,
    exchangeCode,
    disconnect
  };
};
