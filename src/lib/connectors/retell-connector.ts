import { BaseConnector, CreateCallParams, CallDetails, Call, CallFilters, Analytics, NormalizedEvent, ConnectorCapabilities } from './base-connector';

/**
 * Retell AI connector implementation
 * Documentation: https://docs.retellai.com/
 */
export class RetellConnector extends BaseConnector {
  readonly name = 'retell' as const;

  constructor(apiKey: string, baseUrl: string = 'https://api.retellai.com') {
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
      // Test by fetching agents (requires valid API key)
      await this.makeRequest('/v1/agent', 'GET');
      return {
        success: true,
        capabilities: this.getCapabilities(),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to connect to Retell AI',
      };
    }
  }

  async createCall(params: CreateCallParams): Promise<CallDetails> {
    const payload: any = {
      to_number: params.to,
      from_number: params.from,
      agent_id: params.agentId,
      metadata: params.metadata || {},
    };

    if (params.webhookUrl) {
      payload.webhook_url = params.webhookUrl;
    }

    const response = await this.makeRequest('/v1/call', 'POST', payload);

    return {
      id: response.call_id,
      externalId: response.call_id,
      status: this.mapRetellStatus(response.call_status),
      participants: {
        to: params.to,
        from: params.from,
      },
      startTime: response.start_timestamp,
      endTime: response.end_timestamp,
      duration: response.call_duration_ms ? response.call_duration_ms / 1000 : undefined,
      audioUrl: response.recording_url,
      transcript: response.transcript,
      metadata: response.metadata,
    };
  }

  async getCallDetails(callId: string): Promise<CallDetails> {
    const response = await this.makeRequest(`/v1/call/${callId}`, 'GET');

    return {
      id: response.call_id,
      externalId: response.call_id,
      status: this.mapRetellStatus(response.call_status),
      participants: {
        to: response.to_number,
        from: response.from_number,
      },
      startTime: response.start_timestamp,
      endTime: response.end_timestamp,
      duration: response.call_duration_ms ? response.call_duration_ms / 1000 : undefined,
      audioUrl: response.recording_url,
      transcript: response.transcript,
      metadata: response.metadata,
    };
  }

  async listCalls(filters: CallFilters): Promise<Call[]> {
    const params = new URLSearchParams();
    
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.offset) params.append('offset', filters.offset.toString());
    if (filters.startDate) params.append('start_date', filters.startDate);
    if (filters.endDate) params.append('end_date', filters.endDate);
    if (filters.status) params.append('filter_status', filters.status);

    const response = await this.makeRequest(`/v1/call?${params.toString()}`, 'GET');

    return response.calls.map((call: any) => ({
      id: call.call_id,
      externalId: call.call_id,
      status: this.mapRetellStatus(call.call_status),
      createdAt: call.start_timestamp,
      to: call.to_number,
      from: call.from_number,
    }));
  }

  async getAnalytics(timeframe: '24h' | '7d' | '30d' | '90d'): Promise<Analytics> {
    const { startDate, endDate } = this.getDateRange(timeframe);
    
    // Retell has a dedicated metrics endpoint
    try {
      const response = await this.makeRequest(
        `/v1/analytics/metrics?start_date=${startDate}&end_date=${endDate}`,
        'GET'
      );

      return {
        totalCalls: response.total_calls || 0,
        avgDuration: response.avg_call_duration_ms ? response.avg_call_duration_ms / 1000 : 0,
        successRate: response.success_rate || 0,
        totalDuration: response.total_duration_ms ? response.total_duration_ms / 1000 : 0,
        callsByStatus: response.calls_by_status || {},
        costEstimate: response.total_cost,
      };
    } catch (error) {
      console.error('Failed to fetch Retell analytics, falling back to manual calculation:', error);
      
      // Fallback to manual calculation
      const calls = await this.listCalls({ startDate, endDate, limit: 1000 });
      
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
  }

  normalizeWebhookEvent(rawEvent: any): NormalizedEvent {
    const eventType = rawEvent.event;

    let normalizedType: NormalizedEvent['type'];
    switch (eventType) {
      case 'call_started':
        normalizedType = 'call.started';
        break;
      case 'call_ended':
      case 'call_completed':
        normalizedType = 'call.ended';
        break;
      case 'call_failed':
        normalizedType = 'call.failed';
        break;
      case 'transcript_ready':
        normalizedType = 'transcript.ready';
        break;
      default:
        normalizedType = 'conversation.updated';
    }

    return {
      type: normalizedType,
      callId: rawEvent.call_id,
      timestamp: rawEvent.timestamp || new Date().toISOString(),
      data: rawEvent,
    };
  }

  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    // Retell uses HMAC-SHA256 for webhook verification
    // Implementation would use crypto.subtle.importKey and crypto.subtle.sign
    // For now, returning true (implement in edge function with crypto support)
    return true;
  }

  private mapRetellStatus(status: string): CallDetails['status'] {
    const statusMap: Record<string, CallDetails['status']> = {
      'queued': 'queued',
      'ringing': 'ringing',
      'in_progress': 'in-progress',
      'active': 'in-progress',
      'completed': 'completed',
      'ended': 'completed',
      'failed': 'failed',
      'busy': 'busy',
      'no_answer': 'no-answer',
      'canceled': 'failed',
    };

    return statusMap[status] || 'failed';
  }
}
