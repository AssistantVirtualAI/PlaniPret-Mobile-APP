import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Platform } from '@/lib/connectors/endpoints-registry';
import { platformSupportsFeature } from '@/lib/connectors/endpoints-registry';

interface CallFilters {
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
  status?: string;
}

interface AnalyticsData {
  totalCalls: number;
  completedCalls: number;
  totalDuration: number;
  avgDuration: number;
  successRate: number;
  callsByStatus: Record<string, number>;
  callsByDay: Record<string, number>;
}

interface UsePlatformConnectorParams {
  platform: Platform;
  agentId?: string;
  apiKey?: string;
  organizationId?: string;
}

export const usePlatformConnector = ({
  platform,
  agentId,
  apiKey,
  organizationId,
}: UsePlatformConnectorParams) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getFunctionName = useCallback(() => {
    switch (platform) {
      case 'elevenlabs':
        return 'connector-proxy';
      case 'vapi':
        return 'vapi-proxy';
      case 'retell':
        return 'retell-proxy';
      default:
        return 'connector-proxy';
    }
  }, [platform]);

  const invokeFunction = useCallback(async (action: string, params: Record<string, any> = {}) => {
    setLoading(true);
    setError(null);
    
    try {
      const functionName = getFunctionName();
      const body = {
        action,
        platform,
        organizationId,
        agentId,
        apiKey,
        ...params,
      };

      const { data, error: fnError } = await supabase.functions.invoke(functionName, {
        body,
      });

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Unknown error');
      }

      return data.data;
    } catch (err: any) {
      const message = err.message || 'Failed to execute action';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getFunctionName, platform, organizationId, agentId, apiKey]);

  // Common methods available across all platforms
  const listConversations = useCallback(async (filters?: CallFilters) => {
    return invokeFunction('listCalls', filters || {});
  }, [invokeFunction]);

  const getConversationDetails = useCallback(async (callId: string) => {
    return invokeFunction('getCallDetails', { callId });
  }, [invokeFunction]);

  const getAnalytics = useCallback(async (timeframe: '24h' | '7d' | '30d' | '90d' = '7d'): Promise<AnalyticsData> => {
    return invokeFunction('getAnalytics', { timeframe });
  }, [invokeFunction]);

  const createCall = useCallback(async (params: { to: string; from?: string; metadata?: Record<string, any> }) => {
    return invokeFunction('createCall', params);
  }, [invokeFunction]);

  // Platform-specific methods - ElevenLabs
  const getAgentConfig = useCallback(async () => {
    if (platform !== 'elevenlabs') {
      throw new Error('getAgentConfig is only available for ElevenLabs');
    }
    
    const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
      body: { action: 'get', agentId, apiKey },
    });
    
    if (error) throw new Error(error.message);
    return data;
  }, [platform, agentId, apiKey]);

  const updateAgentConfig = useCallback(async (config: Record<string, any>) => {
    if (platform !== 'elevenlabs') {
      throw new Error('updateAgentConfig is only available for ElevenLabs');
    }
    
    const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
      body: { action: 'update_prompt', agentId, apiKey, ...config },
    });
    
    if (error) throw new Error(error.message);
    return data;
  }, [platform, agentId, apiKey]);

  // Knowledge Base (ElevenLabs only)
  const getKnowledgeBase = useCallback(async () => {
    if (!platformSupportsFeature(platform, 'knowledgeBase')) {
      throw new Error('Knowledge base is not supported on this platform');
    }
    
    const { data, error } = await supabase.functions.invoke('elevenlabs-convai-knowledge-base', {
      body: { action: 'list', agentId, apiKey },
    });
    
    if (error) throw new Error(error.message);
    return data;
  }, [platform, agentId, apiKey]);

  // Phone Numbers
  const listPhoneNumbers = useCallback(async () => {
    return invokeFunction('listPhoneNumbers');
  }, [invokeFunction]);

  // Platform-specific: Vapi assistants
  const listAssistants = useCallback(async () => {
    if (platform !== 'vapi') {
      throw new Error('listAssistants is only available for Vapi');
    }
    return invokeFunction('listAssistants');
  }, [platform, invokeFunction]);

  // Platform-specific: Retell agents
  const listRetellAgents = useCallback(async () => {
    if (platform !== 'retell') {
      throw new Error('listRetellAgents is only available for Retell');
    }
    return invokeFunction('listAgents');
  }, [platform, invokeFunction]);

  // Capabilities check
  const capabilities = {
    supportsKnowledgeBase: platformSupportsFeature(platform, 'knowledgeBase'),
    supportsPhoneNumbers: platformSupportsFeature(platform, 'phoneNumbers'),
    supportsAnalytics: platformSupportsFeature(platform, 'analytics'),
    supportsRealtime: platformSupportsFeature(platform, 'realtime'),
  };

  return {
    // State
    loading,
    error,
    
    // Common methods
    listConversations,
    getConversationDetails,
    getAnalytics,
    createCall,
    listPhoneNumbers,
    
    // ElevenLabs specific
    getAgentConfig,
    updateAgentConfig,
    getKnowledgeBase,
    
    // Vapi specific
    listAssistants,
    
    // Retell specific
    listRetellAgents,
    
    // Generic invoke for custom actions
    invokeFunction,
    
    // Capabilities
    capabilities,
  };
};

export default usePlatformConnector;
