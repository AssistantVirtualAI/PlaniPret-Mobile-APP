import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { toast } from 'sonner';

export const useSendWeeklyReport = () => {
  const { selectedOrgId } = useOrganization();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('send-weekly-report', {
        body: { 
          organizationId: selectedOrgId,
          manual: true 
        }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Rapport envoyé à ${data.reports?.[0]?.emailsSent || 0} destinataire(s)`);
    },
    onError: (error) => {
      console.error('Failed to send weekly report:', error);
      toast.error('Erreur lors de l\'envoi du rapport');
    }
  });
};

export const useWeeklyReportPreview = () => {
  const { selectedOrgId } = useOrganization();

  return useQuery({
    queryKey: ['weekly-report-preview', selectedOrgId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('send-weekly-report', {
        body: { 
          organizationId: selectedOrgId,
          manual: true,
          previewOnly: true
        }
      });

      if (error) throw error;
      return data;
    },
    enabled: false, // Only fetch when explicitly called
  });
};
