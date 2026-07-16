import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { useToast } from '@/hooks/use-toast';

export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[] | null;
  is_active: boolean | null;
  last_used_at: string | null;
  created_at: string;
  expires_at: string | null;
  created_by: string | null;
}

const AVAILABLE_SCOPES = [
  'read:analytics',
  'read:conversations',
  'write:conversations',
  'read:agents',
  'write:agents',
  'read:clients',
  'write:clients',
  'read:knowledge_base',
  'write:knowledge_base',
];

export const useApiKeys = () => {
  const { selectedOrgId } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['api-keys', selectedOrgId],
    queryFn: async (): Promise<ApiKey[]> => {
      if (!selectedOrgId) return [];

      const { data, error } = await supabase
        .from('organization_api_keys')
        .select('*')
        .eq('organization_id', selectedOrgId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedOrgId,
  });

  const createApiKey = useMutation({
    mutationFn: async ({ 
      name, 
      scopes, 
      expiresAt 
    }: { 
      name: string; 
      scopes: string[]; 
      expiresAt?: Date 
    }): Promise<{ key: string; keyData: ApiKey }> => {
      if (!selectedOrgId) throw new Error('No organization selected');

      // Call edge function for secure key generation with bcrypt hashing
      const { data, error } = await supabase.functions.invoke('create-api-key', {
        body: {
          name,
          scopes,
          expiresAt: expiresAt?.toISOString(),
          organizationId: selectedOrgId,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      return { key: data.key, keyData: data.keyData };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast({ title: 'Clé API créée avec succès' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    },
  });

  const revokeApiKey = useMutation({
    mutationFn: async (keyId: string) => {
      const { error } = await supabase
        .from('organization_api_keys')
        .update({ is_active: false })
        .eq('id', keyId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast({ title: 'Clé API révoquée' });
    },
    onError: () => {
      toast({ title: 'Erreur lors de la révocation', variant: 'destructive' });
    },
  });

  const deleteApiKey = useMutation({
    mutationFn: async (keyId: string) => {
      const { error } = await supabase
        .from('organization_api_keys')
        .delete()
        .eq('id', keyId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast({ title: 'Clé API supprimée' });
    },
    onError: () => {
      toast({ title: 'Erreur lors de la suppression', variant: 'destructive' });
    },
  });

  return {
    apiKeys: query.data || [],
    isLoading: query.isLoading,
    createApiKey,
    revokeApiKey,
    deleteApiKey,
    availableScopes: AVAILABLE_SCOPES,
  };
};
