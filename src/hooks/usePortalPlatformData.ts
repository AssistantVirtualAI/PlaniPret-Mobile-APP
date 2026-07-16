import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePortal } from './usePortalAuth';

type Platform = 'elevenlabs' | 'vapi' | 'retell';

type ProxyResponse<T> = { success: boolean; data?: T; error?: string };

const unwrapProxy = <T,>(res: any): T => {
  if (res && typeof res === 'object' && 'success' in res) {
    if (res.success === false) throw new Error(res.error || 'Proxy error');
    return res.data as T;
  }
  return res as T;
};

export interface PortalPlatformConversation {
  conversation_id: string;
  status: string;
  start_time_unix_secs: number;
  call_duration_secs: number;
  message_count: number;
  metadata?: Record<string, any>;
}

export interface PortalPlatformConversationsResponse {
  conversations: PortalPlatformConversation[];
  total: number;
}

export interface PortalPlatformAnalytics {
  metrics: {
    total_conversations: number;
    successful_conversations: number;
    failed_conversations: number;
    avg_duration: number;
    total_duration: number;
    avg_satisfaction: number | null;
    today_conversations: number;
    success_rate: number;
  };
  trends: any;
  charts?: {
    conversations_over_time: { date: string; count: number }[];
    peak_hours: { hour: number; count: number }[];
    satisfaction_trend: any[];
  };
}

// SECURITY: All hooks now use organizationId for auth - API keys are fetched server-side

export const usePortalPlatformConversations = (page: number = 1, limit: number = 100) => {
  const { session } = usePortal();

  return useQuery({
    queryKey: ['portal-platform-conversations', session?.platform, session?.platformAgentId, session?.organizationId, page, limit],
    queryFn: async () => {
      if (!session?.platform || !session?.platformAgentId) {
        console.log('[Portal] Missing platform or platformAgentId for conversations');
        return { conversations: [], total: 0 } as PortalPlatformConversationsResponse;
      }

      if (!session.organizationId) {
        console.log('[Portal] No organization ID available');
        return { conversations: [], total: 0 } as PortalPlatformConversationsResponse;
      }

      const platform = session.platform as Platform;
      console.log(`[Portal] Fetching ${platform} conversations for agent: ${session.platformAgentId}`);

      // ElevenLabs
      if (platform === 'elevenlabs') {
        const { data, error } = await supabase.functions.invoke('elevenlabs-convai-conversations', {
          body: {
            action: 'list',
            agentId: session.platformAgentId,
            organizationId: session.organizationId,
            page,
            limit,
          },
        });
        if (error) {
          console.error('[Portal] ElevenLabs conversations error:', error);
          throw error;
        }
        return data as PortalPlatformConversationsResponse;
      }

      // Vapi
      if (platform === 'vapi') {
        const { data, error } = await supabase.functions.invoke('vapi-proxy', {
          body: {
            action: 'listCalls',
            organizationId: session.organizationId,
            agentId: session.platformAgentId,
            assistantId: session.platformAgentId,
            limit,
          },
        });
        if (error) {
          console.error('[Portal] Vapi conversations error:', error);
          throw error;
        }
        const calls = unwrapProxy<any[]>(data) || [];
        return normalizeVapiConversations(calls);
      }

      // Retell
      if (platform === 'retell') {
        const { data, error } = await supabase.functions.invoke('retell-proxy', {
          body: {
            action: 'listCalls',
            organizationId: session.organizationId,
            agentId: session.platformAgentId,
            limit,
          },
        });
        if (error) {
          console.error('[Portal] Retell conversations error:', error);
          throw error;
        }
        const calls = unwrapProxy<any[]>(data) || [];
        return normalizeRetellConversations(calls);
      }

      return { conversations: [], total: 0 };
    },
    enabled: !!session?.platform && !!session?.platformAgentId && !!session?.organizationId,
    staleTime: 30000,
  });
};

export const usePortalPlatformAnalytics = (timeframe: string = 'all') => {
  const { session } = usePortal();

  return useQuery({
    queryKey: ['portal-platform-analytics', session?.platform, session?.platformAgentId, session?.organizationId, timeframe],
    queryFn: async () => {
      if (!session?.platform || !session?.platformAgentId) {
        console.log('[Portal] Missing platform or platformAgentId for analytics');
        return null;
      }

      if (!session.organizationId) {
        console.log('[Portal] No organization ID available for analytics');
        return null;
      }

      const platform = session.platform as Platform;
      console.log(`[Portal] Fetching ${platform} analytics for agent: ${session.platformAgentId}`);

      if (platform === 'elevenlabs') {
        const { data, error } = await supabase.functions.invoke('elevenlabs-convai-analytics', {
          body: {
            agentId: session.platformAgentId,
            organizationId: session.organizationId,
            timeframe: normalizePortalTimeframeToElevenLabs(timeframe),
            includeCharts: true,
          },
        });
        if (error) {
          console.error('[Portal] ElevenLabs analytics error:', error);
          throw error;
        }
        return data as PortalPlatformAnalytics;
      }

      if (platform === 'vapi') {
        const { data, error } = await supabase.functions.invoke('vapi-proxy', {
          body: {
            action: 'getAnalytics',
            organizationId: session.organizationId,
            agentId: session.platformAgentId,
            timeframe,
          },
        });
        if (error) {
          console.error('[Portal] Vapi analytics error:', error);
          throw error;
        }
        return normalizeVapiAnalytics(unwrapProxy<any>(data));
      }

      if (platform === 'retell') {
        const { data, error } = await supabase.functions.invoke('retell-proxy', {
          body: {
            action: 'getAnalytics',
            organizationId: session.organizationId,
            agentId: session.platformAgentId,
            timeframe,
          },
        });
        if (error) {
          console.error('[Portal] Retell analytics error:', error);
          throw error;
        }
        return normalizeRetellAnalytics(unwrapProxy<any>(data));
      }

      return null;
    },
    enabled: !!session?.platform && !!session?.platformAgentId && !!session?.organizationId,
    staleTime: 60000,
  });
};

function normalizePortalTimeframeToElevenLabs(timeframe: string) {
  // Portal pages use '7days'/'30days' today; ElevenLabs functions expect '7d'/'30d'
  if (timeframe === '7days') return '7d';
  if (timeframe === '30days') return '30d';
  return timeframe;
}

function normalizeVapiConversations(calls: any[]): PortalPlatformConversationsResponse {
  if (!Array.isArray(calls)) {
    console.warn('[Portal] Vapi calls is not an array:', calls);
    return { conversations: [], total: 0 };
  }

  const conversations: PortalPlatformConversation[] = calls.map(call => ({
    conversation_id: call.id,
    start_time_unix_secs: call.startedAt
      ? new Date(call.startedAt).getTime() / 1000
      : (call.createdAt ? new Date(call.createdAt).getTime() / 1000 : Date.now() / 1000),
    call_duration_secs: call.endedAt && call.startedAt
      ? Math.max(0, Math.round((new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000))
      : 0,
    status: call.status || 'unknown',
    message_count: 0,
    metadata: {
      caller_id: call.customer?.number || call.phoneNumber || 'Unknown',
    },
  }));

  return { conversations, total: conversations.length };
}

function normalizeRetellConversations(calls: any[]): PortalPlatformConversationsResponse {
  if (!Array.isArray(calls)) {
    console.warn('[Portal] Retell calls is not an array:', calls);
    return { conversations: [], total: 0 };
  }

  const conversations: PortalPlatformConversation[] = calls.map(call => ({
    conversation_id: call.call_id || call.id,
    start_time_unix_secs: call.start_timestamp
      ? call.start_timestamp / 1000
      : (call.created_at ? new Date(call.created_at).getTime() / 1000 : Date.now() / 1000),
    call_duration_secs: call.call_length || call.duration || 0,
    status: call.call_status || call.status || 'unknown',
    message_count: 0,
    metadata: {
      caller_id: call.from_number || call.caller_id || 'Unknown',
    },
  }));

  return { conversations, total: conversations.length };
}

function normalizeVapiAnalytics(analytics: any): PortalPlatformAnalytics {
  if (!analytics) {
    return {
      metrics: {
        total_conversations: 0,
        successful_conversations: 0,
        failed_conversations: 0,
        avg_duration: 0,
        total_duration: 0,
        avg_satisfaction: null,
        today_conversations: 0,
        success_rate: 0,
      },
      trends: {},
      charts: { conversations_over_time: [], peak_hours: [], satisfaction_trend: [] },
    };
  }

  return {
    metrics: {
      total_conversations: analytics.totalCalls || 0,
      successful_conversations: analytics.completedCalls || 0,
      failed_conversations: (analytics.totalCalls || 0) - (analytics.completedCalls || 0),
      avg_duration: analytics.avgDuration || 0,
      total_duration: analytics.totalDuration || 0,
      avg_satisfaction: null,
      today_conversations: (analytics.callsByDay || {})[new Date().toISOString().split('T')[0]] || 0,
      success_rate: analytics.successRate || 0,
    },
    trends: {},
    charts: {
      conversations_over_time: Object.entries(analytics.callsByDay || {}).map(([date, count]) => ({
        date,
        count: Number(count) || 0,
      })),
      peak_hours: [],
      satisfaction_trend: [],
    },
  };
}

function normalizeRetellAnalytics(analytics: any): PortalPlatformAnalytics {
  if (!analytics) {
    return {
      metrics: {
        total_conversations: 0,
        successful_conversations: 0,
        failed_conversations: 0,
        avg_duration: 0,
        total_duration: 0,
        avg_satisfaction: null,
        today_conversations: 0,
        success_rate: 0,
      },
      trends: {},
      charts: { conversations_over_time: [], peak_hours: [], satisfaction_trend: [] },
    };
  }

  return {
    metrics: {
      total_conversations: analytics.totalCalls || 0,
      successful_conversations: analytics.completedCalls || 0,
      failed_conversations: (analytics.totalCalls || 0) - (analytics.completedCalls || 0),
      avg_duration: analytics.avgDuration || 0,
      total_duration: analytics.totalDuration || 0,
      avg_satisfaction: null,
      today_conversations: (analytics.callsByDay || {})[new Date().toISOString().split('T')[0]] || 0,
      success_rate: analytics.successRate || 0,
    },
    trends: {},
    charts: {
      conversations_over_time: Object.entries(analytics.callsByDay || {}).map(([date, count]) => ({
        date,
        count: Number(count) || 0,
      })),
      peak_hours: [],
      satisfaction_trend: [],
    },
  };
}
