import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ActiveConversation {
  conversation_id: string;
  agent_id: string;
  agent_name: string;
  platform_agent_id: string;
  start_time: string;
  status: 'active' | 'ended';
  caller_id?: string;
  duration_secs?: number;
}

export interface RecentConversation {
  conversation_id: string;
  agent_id: string;
  agent_name: string;
  platform_agent_id: string;
  start_time?: string;
  end_time?: string;
  call_duration_secs?: number;
  duration?: number;
  status?: string;
  analysis?: {
    summary?: string;
    satisfaction_score?: number;
    sentiment?: string;
  };
}

export interface RealtimeData {
  activeConversations: ActiveConversation[];
  recentConversations: RecentConversation[];
  agentCount: number;
  timestamp: string;
}

export const useRealtimeConversations = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [activeConversations, setActiveConversations] = useState<ActiveConversation[]>([]);
  const [recentConversations, setRecentConversations] = useState<RecentConversation[]>([]);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [agentCount, setAgentCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  const connect = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.log('No session for WebSocket connection');
        return;
      }

      // Close existing connection
      if (wsRef.current) {
        wsRef.current.close();
      }

      const wsUrl = `wss://gejxisrqtvxavbrfcoxz.functions.supabase.co/realtime-conversations`;
      console.log('Connecting to WebSocket:', wsUrl);
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected, sending auth...');
        ws.send(JSON.stringify({
          type: 'auth',
          token: session.access_token
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'authenticated') {
            console.log('WebSocket authenticated, agents:', data.agentCount);
            setIsConnected(true);
            setAgentCount(data.agentCount);
          } else if (data.type === 'update') {
            setActiveConversations(data.activeConversations || []);
            setRecentConversations(data.recentConversations || []);
            setLastUpdate(data.timestamp);
          } else if (data.type === 'error') {
            console.error('WebSocket error:', data.message);
            toast({
              variant: 'destructive',
              title: 'Erreur de connexion',
              description: data.message
            });
          }
        } catch (e) {
          console.error('Error parsing WebSocket message:', e);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        wsRef.current = null;
        
        // Auto-reconnect after 5 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('Attempting to reconnect...');
          connect();
        }, 5000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

    } catch (error) {
      console.error('Error connecting to WebSocket:', error);
    }
  }, [toast]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    activeConversations,
    recentConversations,
    lastUpdate,
    agentCount,
    connect,
    disconnect
  };
};

// Hook for HTTP fallback (non-WebSocket)
export const useRealtimeConversationsHttp = () => {
  return useQuery({
    queryKey: ['realtime-conversations'],
    queryFn: async (): Promise<RealtimeData> => {
      const { data, error } = await supabase.functions.invoke('realtime-conversations', {
        body: {}
      });

      if (error) throw error;
      return data;
    },
    refetchInterval: 5000, // Poll every 5 seconds
  });
};

// Hook for syncing conversations
export const useSyncConversations = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (agentId?: string) => {
      const { data, error } = await supabase.functions.invoke('sync-elevenlabs-conversations', {
        body: { action: 'sync', agentId, limit: 100 }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: 'Synchronisation terminée',
        description: `${data.synced} conversations synchronisées (${data.created} créées, ${data.updated} mises à jour)`
      });
      queryClient.invalidateQueries({ queryKey: ['all-agents-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Erreur de synchronisation',
        description: error instanceof Error ? error.message : 'Une erreur est survenue'
      });
    }
  });
};
