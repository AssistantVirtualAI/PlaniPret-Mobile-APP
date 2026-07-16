import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';

export interface Conversation {
  id: string;
  external_id: string | null;
  title: string;
  duration: number | null;
  platform: string | null;
  sentiment: string | null;
  satisfaction_score: number | null;
  status: string | null;
  created_at: string;
  transcript: string | null;
  audio_url: string | null;
  keywords: string[] | null;
  agent_id: string | null;
  client_id: string | null;
  metadata: any;
}

export interface ConversationsFilters {
  platform?: string;
  sentiment?: string;
  status?: string;
  dateRange?: 'today' | '7days' | '30days' | 'all';
  agentId?: string;
  clientId?: string;
  search?: string;
}

export interface ConversationsResponse {
  data: Conversation[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const useConversations = (
  page: number = 1,
  pageSize: number = 20,
  filters: ConversationsFilters = {}
) => {
  const { selectedOrgId } = useOrganization();

  return useQuery({
    queryKey: ['conversations', selectedOrgId, page, pageSize, filters],
    queryFn: async (): Promise<ConversationsResponse> => {
      if (!selectedOrgId) {
        return { data: [], count: 0, page: 1, pageSize: 20, totalPages: 0 };
      }

      let query = supabase
        .from('conversations')
        .select('*', { count: 'exact' })
        .eq('organization_id', selectedOrgId)
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters.platform && filters.platform !== 'all') {
        query = query.eq('platform', filters.platform);
      }
      if (filters.sentiment && filters.sentiment !== 'all') {
        query = query.eq('sentiment', filters.sentiment);
      }
      if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (filters.agentId) {
        query = query.eq('agent_id', filters.agentId);
      }
      if (filters.clientId) {
        query = query.eq('client_id', filters.clientId);
      }
      if (filters.search) {
        query = query.ilike('title', `%${filters.search}%`);
      }

      // Date range filter
      if (filters.dateRange && filters.dateRange !== 'all') {
        const now = new Date();
        let startDate: Date;
        
        switch (filters.dateRange) {
          case 'today':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
          case '7days':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case '30days':
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          default:
            startDate = new Date(0);
        }
        query = query.gte('created_at', startDate.toISOString());
      }

      // Pagination
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        data: data || [],
        count: count || 0,
        page,
        pageSize,
        totalPages: Math.ceil((count || 0) / pageSize),
      };
    },
    enabled: !!selectedOrgId,
  });
};

export const useDeleteConversation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase
        .from('conversations')
        .delete()
        .eq('id', conversationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
    },
  });
};
