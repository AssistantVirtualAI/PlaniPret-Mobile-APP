import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/useTranslation';

export interface KnowledgeBaseItem {
  id: string;
  user_id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  usage_count: number;
  is_synced: boolean;
  last_synced_at: string | null;
  elevenlabs_id: string | null;
  created_at: string;
  updated_at: string;
}

// Fetch all articles
export const useKnowledgeBase = () => {
  return useQuery({
    queryKey: ['knowledge-base'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('knowledge_base_items')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return data as KnowledgeBaseItem[];
    },
  });
};

// Fetch unique categories
export const useKnowledgeBaseCategories = () => {
  return useQuery({
    queryKey: ['knowledge-base-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('knowledge_base_items')
        .select('category')
        .order('category');

      if (error) throw error;
      
      const uniqueCategories = [...new Set(data.map(item => item.category))];
      return uniqueCategories;
    },
  });
};

// Full-text search
export const useKnowledgeBaseSearch = (searchTerm: string, category: string = 'all') => {
  return useQuery({
    queryKey: ['knowledge-base-search', searchTerm, category],
    queryFn: async () => {
      let query = supabase
        .from('knowledge_base_items')
        .select('*');

      // Filter by category
      if (category !== 'all') {
        query = query.eq('category', category);
      }

      // Full-text search if term is present
      if (searchTerm) {
        query = query.textSearch('search_vector', searchTerm, {
          type: 'websearch',
          config: 'french'
        });
      }

      const { data, error } = await query.order('updated_at', { ascending: false });

      if (error) throw error;
      return data as KnowledgeBaseItem[];
    },
    enabled: searchTerm.length > 0 || category !== 'all',
  });
};

// Create an article
export const useCreateKnowledgeBaseItem = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async (item: Omit<KnowledgeBaseItem, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'usage_count' | 'is_synced' | 'last_synced_at' | 'elevenlabs_id'>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('messages.notAuthenticated'));

      const { data, error } = await supabase
        .from('knowledge_base_items')
        .insert({
          ...item,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-base-categories'] });
      toast.success(t('messages.articleCreated'));
    },
    onError: (error: any) => {
      toast.error(error.message || t('messages.createError'));
    },
  });
};

// Update an article
export const useUpdateKnowledgeBaseItem = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<KnowledgeBaseItem> & { id: string }) => {
      const { data, error } = await supabase
        .from('knowledge_base_items')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      toast.success(t('messages.articleUpdated'));
    },
    onError: (error: any) => {
      toast.error(error.message || t('messages.updateError'));
    },
  });
};

// Delete an article
export const useDeleteKnowledgeBaseItem = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('knowledge_base_items')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      toast.success(t('messages.articleDeleted'));
    },
    onError: (error: any) => {
      toast.error(error.message || t('messages.deleteError'));
    },
  });
};

// Sync with ElevenLabs
export const useSyncKnowledgeBase = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async () => {
      // Fetch all unsynchronized articles
      const { data: items } = await supabase
        .from('knowledge_base_items')
        .select('*')
        .eq('is_synced', false);

      if (!items || items.length === 0) {
        return { synced: 0 };
      }

      // Call Edge Function to sync
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-knowledge-base', {
        body: { 
          action: 'sync',
          items: items.map(item => ({
            id: item.id,
            title: item.title,
            content: item.content,
            category: item.category,
          }))
        }
      });

      if (error) throw error;

      // Mark articles as synchronized
      const { error: updateError } = await supabase
        .from('knowledge_base_items')
        .update({ 
          is_synced: true, 
          last_synced_at: new Date().toISOString() 
        })
        .in('id', items.map(item => item.id));

      if (updateError) throw updateError;

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      toast.success(`${data.synced || 0} ${t('messages.syncedToElevenlabs')}`);
    },
    onError: (error: any) => {
      toast.error(error.message || t('messages.syncError'));
    },
  });
};
