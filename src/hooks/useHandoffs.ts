import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/useTranslation';

export interface HandoffRequest {
  id: string;
  organization_id: string;
  conversation_id: string | null;
  agent_id: string | null;
  human_agent_id: string | null;
  reason: string | null;
  status: 'pending' | 'accepted' | 'rejected' | 'completed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  customer_info: {
    name?: string;
    email?: string;
    phone?: string;
  };
  transcript_snapshot: string | null;
  chat_messages: Array<{ role: 'user' | 'agent'; content: string; timestamp: string }>;
  requested_at: string;
  accepted_at: string | null;
  completed_at: string | null;
  metadata: Record<string, unknown>;
}

export function useHandoffs() {
  const { selectedOrg } = useOrganization();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [isAvailable, setIsAvailableState] = useState(true);

  const { data: handoffs, isLoading } = useQuery({
    queryKey: ['handoffs', selectedOrg?.id],
    queryFn: async () => {
      if (!selectedOrg?.id) return [];

      const { data, error } = await supabase
        .from('handoff_requests')
        .select('*')
        .eq('organization_id', selectedOrg.id)
        .order('requested_at', { ascending: false });

      if (error) throw error;
      
      return (data || []).map(item => ({
        ...item,
        customer_info: typeof item.customer_info === 'string' 
          ? JSON.parse(item.customer_info) 
          : item.customer_info,
        chat_messages: typeof item.chat_messages === 'string'
          ? JSON.parse(item.chat_messages)
          : item.chat_messages || []
      })) as HandoffRequest[];
    },
    enabled: !!selectedOrg?.id,
  });

  // Subscribe to realtime updates
  useEffect(() => {
    if (!selectedOrg?.id) return;

    const channel = supabase
      .channel('handoff-requests')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'handoff_requests',
          filter: `organization_id=eq.${selectedOrg.id}`
        },
        (payload) => {
          console.log('Handoff update:', payload);
          queryClient.invalidateQueries({ queryKey: ['handoffs'] });
          
          if (payload.eventType === 'INSERT') {
            toast.info(t('handoffs.newRequest'), {
              description: t('handoffs.customerWantsHuman')
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedOrg?.id, queryClient, t]);

  const acceptHandoff = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('handoff_requests')
        .update({
          status: 'accepted',
          human_agent_id: user?.id,
          accepted_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['handoffs'] });
      toast.success(t('handoffs.accepted'));
    }
  });

  const rejectHandoff = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('handoff_requests')
        .update({ status: 'rejected' })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['handoffs'] });
      toast.success(t('handoffs.rejected'));
    }
  });

  const completeHandoff = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('handoff_requests')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['handoffs'] });
      toast.success(t('handoffs.completed'));
    }
  });

  const sendMessage = useMutation({
    mutationFn: async ({ handoffId, message }: { handoffId: string; message: string }) => {
      const handoff = handoffs?.find(h => h.id === handoffId);
      if (!handoff) throw new Error('Handoff not found');

      const newMessage = {
        role: 'agent' as const,
        content: message,
        timestamp: new Date().toISOString()
      };

      const updatedMessages = [...(handoff.chat_messages || []), newMessage];

      const { error } = await supabase
        .from('handoff_requests')
        .update({ chat_messages: updatedMessages })
        .eq('id', handoffId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['handoffs'] });
    }
  });

  // Calculate stats
  const stats = {
    pending: handoffs?.filter(h => h.status === 'pending').length || 0,
    active: handoffs?.filter(h => h.status === 'accepted').length || 0,
    completed: handoffs?.filter(h => h.status === 'completed').length || 0,
    avgResponseTime: Math.round(
      (handoffs || [])
        .filter(h => h.accepted_at)
        .reduce((acc, h) => {
          const requested = new Date(h.requested_at).getTime();
          const accepted = new Date(h.accepted_at!).getTime();
          return acc + (accepted - requested) / 1000;
        }, 0) / Math.max(1, (handoffs?.filter(h => h.accepted_at).length || 1))
    )
  };

  const setAvailability = (available: boolean) => {
    setIsAvailableState(available);
    toast.success(available ? t('handoffs.nowAvailable') : t('handoffs.nowUnavailable'));
  };

  return {
    handoffs: handoffs || [],
    stats,
    isLoading,
    acceptHandoff,
    rejectHandoff,
    completeHandoff,
    sendMessage,
    isAvailable,
    setAvailability
  };
}
