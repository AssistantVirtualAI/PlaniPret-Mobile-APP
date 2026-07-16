import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';

export interface CustomTag {
  id: string;
  organization_id: string;
  name: string;
  color: string;
  icon: string;
  created_by: string | null;
  created_at: string;
}

export const useCustomTags = () => {
  const { selectedOrgId } = useOrganization();

  return useQuery({
    queryKey: ['custom-tags', selectedOrgId],
    queryFn: async () => {
      if (!selectedOrgId) return [] as CustomTag[];
      const { data, error } = await supabase
        .from('custom_tags')
        .select('*')
        .eq('organization_id', selectedOrgId)
        .order('name');
      if (error) throw error;
      return (data || []) as CustomTag[];
    },
    enabled: !!selectedOrgId,
  });
};

export const useCreateCustomTag = () => {
  const qc = useQueryClient();
  const { selectedOrgId } = useOrganization();

  return useMutation({
    mutationFn: async (args: { name: string; color: string; icon?: string }) => {
      if (!selectedOrgId) throw new Error('No organization selected');
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('custom_tags')
        .insert({
          organization_id: selectedOrgId,
          name: args.name,
          color: args.color,
          icon: args.icon || 'tag',
          created_by: userData.user?.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custom-tags', selectedOrgId] });
    },
  });
};

export const useDeleteCustomTag = () => {
  const qc = useQueryClient();
  const { selectedOrgId } = useOrganization();

  return useMutation({
    mutationFn: async (tagId: string) => {
      const { error } = await supabase.from('custom_tags').delete().eq('id', tagId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custom-tags', selectedOrgId] });
    },
  });
};

export const useConversationTags = (conversationId: string | undefined) => {
  return useQuery({
    queryKey: ['conversation-tags', conversationId],
    queryFn: async () => {
      if (!conversationId) return [] as Array<CustomTag & { tagged_at: string }>;
      const { data, error } = await supabase
        .from('conversation_tags')
        .select('tag_id, tagged_at, custom_tags(id, name, color, icon, organization_id, created_by, created_at)')
        .eq('conversation_id', conversationId);
      if (error) throw error;
      return (data || []).map((row: any) => ({
        ...row.custom_tags,
        tagged_at: row.tagged_at,
      })) as Array<CustomTag & { tagged_at: string }>;
    },
    enabled: !!conversationId,
  });
};

export const useToggleConversationTag = () => {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (args: { conversationId: string; tagId: string; add: boolean }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (args.add) {
        const { error } = await supabase.from('conversation_tags').insert({
          conversation_id: args.conversationId,
          tag_id: args.tagId,
          tagged_by: userData.user?.id,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('conversation_tags')
          .delete()
          .eq('conversation_id', args.conversationId)
          .eq('tag_id', args.tagId);
        if (error) throw error;
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['conversation-tags', vars.conversationId] });
    },
  });
};
