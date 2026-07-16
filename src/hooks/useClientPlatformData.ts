import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Platform } from './useClientAgentAccess';

interface UseClientPlatformParams {
  apiKey: string | null;
  agentId: string | null;
  platform: Platform | null;
  organizationId?: string | null;
  enabled?: boolean;
}

type ProxyResponse<T> = { success: boolean; data?: T; error?: string };

const unwrapProxy = <T,>(res: any): T => {
  // Proxy functions return { success, data }
  if (res && typeof res === 'object' && 'success' in res) {
    if (res.success === false) throw new Error(res.error || 'Proxy error');
    return res.data as T;
  }
  // ElevenLabs functions return data directly
  return res as T;
};

// Unified analytics hook for all platforms
export const useClientPlatformAnalytics = (
  { apiKey, agentId, platform, organizationId, enabled = true }: UseClientPlatformParams,
  timeframe = '30d'
) => {
  return useQuery({
    queryKey: ['client-platform-analytics', platform, agentId, timeframe],
    queryFn: async () => {
      if (!platform || !agentId) return null;
      if (!apiKey && !organizationId) return null;

      let data: any;
      let error: any;

      switch (platform) {
        case 'elevenlabs':
          ({ data, error } = await supabase.functions.invoke('elevenlabs-convai-analytics', {
            body: { apiKey, agentId, organizationId, timeframe, includeRealtime: true, includeCharts: true }
          }));
          break;

        case 'vapi':
          ({ data, error } = await supabase.functions.invoke('vapi-proxy', {
            body: { action: 'getAnalytics', apiKey, organizationId, agentId, timeframe }
          }));
          data = normalizeVapiAnalytics(unwrapProxy<any>(data));
          break;

        case 'retell':
          ({ data, error } = await supabase.functions.invoke('retell-proxy', {
            body: { action: 'getAnalytics', apiKey, organizationId, agentId, timeframe }
          }));
          data = normalizeRetellAnalytics(unwrapProxy<any>(data));
          break;

        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }

      if (error) throw error;
      return data;
    },
    enabled: enabled && !!agentId && !!platform && !!(apiKey || organizationId),
  });
};

// Unified conversations hook for all platforms
export const useClientPlatformConversations = (
  { apiKey, agentId, platform, organizationId, enabled = true }: UseClientPlatformParams,
  page = 1,
  limit = 50
) => {
  return useQuery({
    queryKey: ['client-platform-conversations', platform, agentId, page, limit],
    queryFn: async () => {
      if (!platform || !agentId) return null;
      if (!apiKey && !organizationId) return null;

      let data: any;
      let error: any;

      switch (platform) {
        case 'elevenlabs':
          ({ data, error } = await supabase.functions.invoke('elevenlabs-convai-conversations', {
            body: { action: 'list', apiKey, organizationId, agentId, page, limit }
          }));
          break;

        case 'vapi':
          ({ data, error } = await supabase.functions.invoke('vapi-proxy', {
            body: { action: 'listCalls', apiKey, organizationId, agentId, assistantId: agentId, limit }
          }));
          data = normalizeVapiConversations(unwrapProxy<any[]>(data) || []);
          break;

        case 'retell':
          ({ data, error } = await supabase.functions.invoke('retell-proxy', {
            body: { action: 'listCalls', apiKey, organizationId, agentId, limit }
          }));
          data = normalizeRetellConversations(unwrapProxy<any[]>(data) || []);
          break;

        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }

      if (error) throw error;
      return data;
    },
    enabled: enabled && !!agentId && !!platform && !!(apiKey || organizationId),
  });
};

// Unified agent config hook for all platforms
export const useClientPlatformAgentConfig = (
  { apiKey, agentId, platform, organizationId, enabled = true }: UseClientPlatformParams
) => {
  return useQuery({
    queryKey: ['client-platform-agent-config', platform, agentId],
    queryFn: async () => {
      if (!platform || !agentId) return null;
      if (!apiKey && !organizationId) return null;

      let data: any;
      let error: any;

      switch (platform) {
        case 'elevenlabs':
          ({ data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
            body: { action: 'get', apiKey, organizationId, agentId }
          }));
          break;

        case 'vapi':
          ({ data, error } = await supabase.functions.invoke('vapi-proxy', {
            body: { action: 'getAssistant', apiKey, organizationId, assistantId: agentId }
          }));
          data = normalizeVapiConfig(unwrapProxy<any>(data));
          break;

        case 'retell':
          ({ data, error } = await supabase.functions.invoke('retell-proxy', {
            body: { action: 'getAgent', apiKey, organizationId, agentId }
          }));
          data = normalizeRetellConfig(unwrapProxy<any>(data));
          break;

        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }

      if (error) throw error;
      return data;
    },
    enabled: enabled && !!agentId && !!platform && !!(apiKey || organizationId),
  });
};

// Normalization helpers
function normalizeVapiAnalytics(analytics: any) {
  return {
    metrics: {
      total_conversations: analytics.totalCalls || 0,
      avg_duration: analytics.avgDuration || 0,
      today_conversations: (analytics.callsByDay || {})[new Date().toISOString().split('T')[0]] || 0,
      avg_satisfaction: analytics.successRate ? analytics.successRate / 100 : null,
      success_rate: analytics.successRate || 0,
      total_duration: analytics.totalDuration || 0,
      successful_conversations: analytics.completedCalls || 0,
      failed_conversations: (analytics.totalCalls || 0) - (analytics.completedCalls || 0),
    },
    trends: {},
    charts: {
      conversations_over_time: Object.entries(analytics.callsByDay || {}).map(([date, count]) => ({
        date,
        count,
      })),
      peak_hours: [],
      satisfaction_trend: [],
    },
  };
}

function normalizeRetellAnalytics(analytics: any) {
  return {
    metrics: {
      total_conversations: analytics.totalCalls || 0,
      avg_duration: analytics.avgDuration || 0,
      today_conversations: (analytics.callsByDay || {})[new Date().toISOString().split('T')[0]] || 0,
      avg_satisfaction: analytics.successRate ? analytics.successRate / 100 : null,
      success_rate: analytics.successRate || 0,
      total_duration: analytics.totalDuration || 0,
      successful_conversations: analytics.completedCalls || 0,
      failed_conversations: (analytics.totalCalls || 0) - (analytics.completedCalls || 0),
    },
    trends: {},
    charts: {
      conversations_over_time: Object.entries(analytics.callsByDay || {}).map(([date, count]) => ({
        date,
        count,
      })),
      peak_hours: [],
      satisfaction_trend: [],
    },
  };
}

function normalizeVapiConversations(calls: any[]) {
  return {
    conversations: calls.map(call => ({
      conversation_id: call.id,
      start_time_unix_secs: call.startedAt ? new Date(call.startedAt).getTime() / 1000 : (call.createdAt ? new Date(call.createdAt).getTime() / 1000 : Date.now() / 1000),
      call_duration_secs: call.endedAt && call.startedAt
        ? Math.max(0, Math.round((new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000))
        : 0,
      status: call.status || 'unknown',
      message_count: 0,
      metadata: {
        caller_id: call.customer?.number || call.phoneNumber || 'Unknown',
      },
    })),
    total: calls.length,
  };
}

function normalizeRetellConversations(calls: any[]) {
  return {
    conversations: calls.map(call => ({
      conversation_id: call.call_id || call.id,
      start_time_unix_secs: call.start_timestamp ? call.start_timestamp / 1000 : (call.created_at ? new Date(call.created_at).getTime() / 1000 : Date.now() / 1000),
      call_duration_secs: call.call_length || call.duration || 0,
      status: call.call_status || call.status || 'unknown',
      message_count: 0,
      metadata: {
        caller_id: call.from_number || call.caller_id || 'Unknown',
      },
    })),
    total: calls.length,
  };
}

function normalizeVapiConfig(data: any) {
  return {
    agent: {
      name: data.name,
      prompt: {
        prompt: data.model?.messages?.[0]?.content || data.instructions || '',
      },
      first_message: data.firstMessage || '',
      tts: {
        voice_id: data.voice?.voiceId || data.voice?.id || '',
        provider: data.voice?.provider || 'vapi',
      },
    },
    platform: 'vapi',
    raw: data,
  };
}

function normalizeRetellConfig(data: any) {
  return {
    agent: {
      name: data.agent_name || data.name,
      prompt: {
        prompt: data.llm?.prompt || data.prompt || '',
      },
      first_message: data.initial_message || '',
      tts: {
        voice_id: data.voice_id || '',
        provider: 'retell',
      },
    },
    platform: 'retell',
    raw: data,
  };
}
