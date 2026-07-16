import { BaseConnector, CreateCallParams, CallDetails, Call, CallFilters, Analytics, NormalizedEvent, ConnectorCapabilities } from './base-connector';

/**
 * Vapi.ai connector implementation
 * Documentation: https://docs.vapi.ai/
 */
export class VapiConnector extends BaseConnector {
  readonly name = 'vapi' as const;

  constructor(apiKey: string, baseUrl: string = 'https://api.vapi.ai') {
    super(apiKey, baseUrl);
  }

  getCapabilities(): ConnectorCapabilities {
    return {
      supportsOutboundCalls: true,
      supportsInboundCalls: true,
      supportsTranscription: true,
      supportsRecording: true,
      supportsSentimentAnalysis: true,
      supportsWebhooks: true,
      supportsTTS: true,
    };
  }

  async testConnection(): Promise<{ success: boolean; error?: string; capabilities?: ConnectorCapabilities }> {
    try {
      // Test by fetching assistants (requires valid API key)
      await this.makeRequest('/assistant', 'GET');
      return {
        success: true,
        capabilities: this.getCapabilities(),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to connect to Vapi',
      };
    }
  }

  async createCall(params: CreateCallParams): Promise<CallDetails> {
    const payload: any = {
      phoneNumberId: params.from,
      customer: {
        number: params.to,
      },
    };

    if (params.agentId) {
      payload.assistantId = params.agentId;
    }

    if (params.metadata) {
      payload.metadata = params.metadata;
    }

    if (params.webhookUrl) {
      payload.serverUrl = params.webhookUrl;
    }

    const response = await this.makeRequest('/call/phone', 'POST', payload);

    return {
      id: response.id,
      externalId: response.id,
      status: this.mapVapiStatus(response.status),
      participants: {
        to: params.to,
        from: params.from,
      },
      startTime: response.startedAt,
      endTime: response.endedAt,
      duration: response.duration,
      audioUrl: response.recordingUrl,
      transcript: response.transcript,
      metadata: response.metadata,
    };
  }

  async getCallDetails(callId: string): Promise<CallDetails> {
    const response = await this.makeRequest(`/call/${callId}`, 'GET');

    return {
      id: response.id,
      externalId: response.id,
      status: this.mapVapiStatus(response.status),
      participants: {
        to: response.customer?.number,
        from: response.phoneNumber?.number,
      },
      startTime: response.startedAt,
      endTime: response.endedAt,
      duration: response.duration,
      audioUrl: response.recordingUrl,
      transcript: response.transcript,
      metadata: response.metadata,
    };
  }

  async listCalls(filters: CallFilters): Promise<Call[]> {
    const params = new URLSearchParams();
    
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.offset) params.append('offset', filters.offset.toString());
    if (filters.startDate) params.append('createdAtGte', filters.startDate);
    if (filters.endDate) params.append('createdAtLte', filters.endDate);

    const response = await this.makeRequest(`/call?${params.toString()}`, 'GET');

    return response.map((call: any) => ({
      id: call.id,
      externalId: call.id,
      status: this.mapVapiStatus(call.status),
      createdAt: call.createdAt,
      to: call.customer?.number,
      from: call.phoneNumber?.number,
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

      // Fetch full details for duration (could be optimized with bulk endpoint)
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
    const eventType = rawEvent.message?.type || rawEvent.type;

    let normalizedType: NormalizedEvent['type'];
    switch (eventType) {
      case 'call-started':
      case 'call.started':
        normalizedType = 'call.started';
        break;
      case 'call-ended':
      case 'call.ended':
        normalizedType = 'call.ended';
        break;
      case 'transcript':
      case 'transcript.ready':
        normalizedType = 'transcript.ready';
        break;
      default:
        normalizedType = 'conversation.updated';
    }

    return {
      type: normalizedType,
      callId: rawEvent.call?.id || rawEvent.callId,
      timestamp: rawEvent.timestamp || new Date().toISOString(),
      data: rawEvent,
    };
  }

  private mapVapiStatus(status: string): CallDetails['status'] {
    const statusMap: Record<string, CallDetails['status']> = {
      'queued': 'queued',
      'ringing': 'ringing',
      'in-progress': 'in-progress',
      'forwarding': 'in-progress',
      'ended': 'completed',
      'completed': 'completed',
      'busy': 'busy',
      'no-answer': 'no-answer',
      'failed': 'failed',
      'canceled': 'failed',
    };

    return statusMap[status] || 'failed';
  }
}
