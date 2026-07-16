import { BaseConnector, CreateCallParams, CallDetails, Call, CallFilters, Analytics, NormalizedEvent, ConnectorCapabilities } from './base-connector';

/**
 * ElevenLabs Conversational AI connector implementation
 * Documentation: https://elevenlabs.io/docs/conversational-ai/overview
 */
export class ElevenLabsConnector extends BaseConnector {
  readonly name = 'elevenlabs' as const;

  constructor(apiKey: string, baseUrl: string = 'https://api.elevenlabs.io') {
    super(apiKey, baseUrl);
  }

  getCapabilities(): ConnectorCapabilities {
    return {
      supportsOutboundCalls: true,
      supportsInboundCalls: false, // ElevenLabs primarily supports outbound
      supportsTranscription: true,
      supportsRecording: true,
      supportsSentimentAnalysis: false,
      supportsWebhooks: true,
      supportsTTS: true,
    };
  }

  async testConnection(): Promise<{ success: boolean; error?: string; capabilities?: ConnectorCapabilities }> {
    try {
      // Test by fetching user info (requires valid API key)
      await this.makeRequest('/v1/user', 'GET');
      return {
        success: true,
        capabilities: this.getCapabilities(),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to connect to ElevenLabs',
      };
    }
  }

  async createCall(params: CreateCallParams): Promise<CallDetails> {
    // ElevenLabs uses agent ID for conversational AI
    if (!params.agentId) {
      throw new Error('Agent ID is required for ElevenLabs calls');
    }

    const payload: any = {
      agent_id: params.agentId,
      phone_number: params.to,
      metadata: params.metadata || {},
    };

    const response = await this.makeRequest('/v1/convai/conversations/phone', 'POST', payload);

    return {
      id: response.conversation_id,
      externalId: response.conversation_id,
      status: this.mapElevenLabsStatus(response.status),
      participants: {
        to: params.to,
        from: params.from,
      },
      startTime: response.started_at,
      endTime: response.ended_at,
      duration: response.duration_seconds,
      audioUrl: response.recording_url,
      transcript: response.transcript,
      metadata: response.metadata,
    };
  }

  async getCallDetails(callId: string): Promise<CallDetails> {
    const response = await this.makeRequest(`/v1/convai/conversations/${callId}`, 'GET');

    return {
      id: response.conversation_id,
      externalId: response.conversation_id,
      status: this.mapElevenLabsStatus(response.status),
      participants: {
        to: response.phone_number,
      },
      startTime: response.started_at,
      endTime: response.ended_at,
      duration: response.duration_seconds,
      audioUrl: response.recording_url,
      transcript: response.transcript,
      metadata: response.metadata,
    };
  }

  async listCalls(filters: CallFilters): Promise<Call[]> {
    const params = new URLSearchParams();
    
    if (filters.limit) params.append('page_size', filters.limit.toString());
    if (filters.offset) params.append('cursor', filters.offset.toString());
    if (filters.startDate) params.append('start_date', filters.startDate);
    if (filters.endDate) params.append('end_date', filters.endDate);

    const response = await this.makeRequest(`/v1/convai/conversations?${params.toString()}`, 'GET');

    return response.conversations.map((conv: any) => ({
      id: conv.conversation_id,
      externalId: conv.conversation_id,
      status: this.mapElevenLabsStatus(conv.status),
      createdAt: conv.started_at,
      to: conv.phone_number,
    }));
  }

  async getAnalytics(timeframe: '24h' | '7d' | '30d' | '90d'): Promise<Analytics> {
    const { startDate, endDate } = this.getDateRange(timeframe);
    
    const calls = await this.listCalls({
      startDate,
      endDate,
      limit: 1000,
    });

    const totalCalls = calls.length;
    const callsByStatus: Record<string, number> = {};
    let totalDuration = 0;
    let successfulCalls = 0;

    for (const call of calls) {
      callsByStatus[call.status] = (callsByStatus[call.status] || 0) + 1;
      
      if (call.status === 'completed') {
        successfulCalls++;
      }

      try {
        const details = await this.getCallDetails(call.id);
        if (details.duration) {
          totalDuration += details.duration;
        }
      } catch (error) {
        console.error(`Failed to get details for call ${call.id}:`, error);
      }
    }

    return {
      totalCalls,
      avgDuration: totalCalls > 0 ? totalDuration / totalCalls : 0,
      successRate: totalCalls > 0 ? (successfulCalls / totalCalls) * 100 : 0,
      totalDuration,
      callsByStatus,
    };
  }

  normalizeWebhookEvent(rawEvent: any): NormalizedEvent {
    const eventType = rawEvent.event_type || rawEvent.type;

    let normalizedType: NormalizedEvent['type'];
    switch (eventType) {
      case 'conversation.started':
        normalizedType = 'call.started';
        break;
      case 'conversation.ended':
        normalizedType = 'call.ended';
        break;
      case 'conversation.failed':
        normalizedType = 'call.failed';
        break;
      case 'transcript.complete':
        normalizedType = 'transcript.ready';
        break;
      default:
        normalizedType = 'conversation.updated';
    }

    return {
      type: normalizedType,
      callId: rawEvent.conversation_id,
      timestamp: rawEvent.timestamp || new Date().toISOString(),
      data: rawEvent,
    };
  }

  private mapElevenLabsStatus(status: string): CallDetails['status'] {
    const statusMap: Record<string, CallDetails['status']> = {
      'pending': 'queued',
      'ringing': 'ringing',
      'in_progress': 'in-progress',
      'active': 'in-progress',
      'completed': 'completed',
      'ended': 'completed',
      'failed': 'failed',
      'no_answer': 'no-answer',
    };

    return statusMap[status] || 'failed';
  }
}
