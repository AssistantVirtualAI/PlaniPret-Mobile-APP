import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/useTranslation';

export interface EmailTemplate {
  id: string;
  organization_id: string;
  template_type: string;
  subject: string | null;
  greeting: string | null;
  body: string | null;
  created_at: string;
  updated_at: string;
}

export const TEMPLATE_TYPES = [
  { value: 'welcome', label: 'Welcome', description: 'Email sent to new users' },
  { value: 'password_reset', label: 'Password Reset', description: 'Password reset email' },
  { value: '2fa', label: '2FA Authentication', description: 'OTP code for two-factor authentication' },
  { value: 'invitation', label: 'Invitation', description: 'Invitation to join the organization' },
  { value: 'notification', label: 'Notification', description: 'General notifications' },
  { value: 'report', label: 'Report', description: 'Periodic reports' },
];

export const TEMPLATE_VARIABLES = [
  { variable: '{{name}}', description: 'Recipient name' },
  { variable: '{{email}}', description: 'Recipient email' },
  { variable: '{{company}}', description: 'Company name' },
  { variable: '{{link}}', description: 'Action link' },
  { variable: '{{date}}', description: 'Current date' },
  { variable: '{{otp_code}}', description: '6-digit OTP code' },
  { variable: '{{token}}', description: 'Validation token' },
];

export function useEmailTemplates() {
  const { selectedOrg: selectedOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['email-templates', selectedOrganization?.id],
    queryFn: async () => {
      if (!selectedOrganization?.id) return [];
      
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .eq('organization_id', selectedOrganization.id)
        .order('template_type');

      if (error) throw error;
      return data as EmailTemplate[];
    },
    enabled: !!selectedOrganization?.id,
  });

  const createTemplate = useMutation({
    mutationFn: async (template: Partial<EmailTemplate>) => {
      if (!selectedOrganization?.id) throw new Error(t('messages.noOrganization'));

      const { data, error } = await supabase
        .from('email_templates')
        .insert({
          organization_id: selectedOrganization.id,
          template_type: template.template_type,
          subject: template.subject || '',
          greeting: template.greeting || '',
          body: template.body || '',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      toast.success(t('messages.templateCreated'));
    },
    onError: (error: Error) => {
      toast.error(`${t('common.error')}: ${error.message}`);
    },
  });

  const updateTemplate = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<EmailTemplate> & { id: string }) => {
      const { data, error } = await supabase
        .from('email_templates')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      toast.success(t('messages.templateUpdated'));
    },
    onError: (error: Error) => {
      toast.error(`${t('common.error')}: ${error.message}`);
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('email_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      toast.success(t('messages.templateDeleted'));
    },
    onError: (error: Error) => {
      toast.error(`${t('common.error')}: ${error.message}`);
    },
  });

  return {
    templates,
    isLoading,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  };
}
