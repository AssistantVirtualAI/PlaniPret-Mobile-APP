/**
 * Base interface for all voice AI platform connectors
 * Provides a unified abstraction layer for Vapi, Retell AI, and ElevenLabs
 */

export interface CreateCallParams {
  to: string;
  from?: string;
  agentId?: string;
  metadata?: Record<string, any>;
  webhookUrl?: string;
}

export interface CallDetails {
  id: string;
  externalId: string;
  status: 'queued' | 'ringing' | 'in-progress' | 'completed' | 'failed' | 'busy' | 'no-answer';
  participants: {
    to: string;
    from?: string;
  };
  startTime?: string;
  endTime?: string;
  duration?: number;
  audioUrl?: string;
  transcriptUrl?: string;
  transcript?: string;
  metadata?: Record<string, any>;
}

export interface Call {
  id: string;
  externalId: string;
  status: string;
  createdAt: string;
  to: string;
  from?: string;
}

export interface CallFilters {
  status?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface Analytics {
  totalCalls: number;
  avgDuration: number;
  successRate: number;
  totalDuration: number;
  callsByStatus: Record<string, number>;
  costEstimate?: number;
}

export interface NormalizedEvent {
  type: 'call.started' | 'call.ended' | 'call.failed' | 'transcript.ready' | 'conversation.updated';
  callId: string;
  timestamp: string;
  data: Record<string, any>;
}

export interface ConnectorCapabilities {
  supportsOutboundCalls: boolean;
  supportsInboundCalls: boolean;
  supportsTranscription: boolean;
  supportsRecording: boolean;
  supportsSentimentAnalysis: boolean;
  supportsWebhooks: boolean;
  supportsTTS: boolean;
}

/**
 * Base connector interface that all platform connectors must implement
 */
export interface IVoiceConnector {
  /** Connector name identifier */
  readonly name: 'vapi' | 'elevenlabs' | 'retell';
  
  /** Get connector capabilities */
  getCapabilities(): ConnectorCapabilities;
  
  /** Test connection to the platform */
  testConnection(): Promise<{ success: boolean; error?: string; capabilities?: ConnectorCapabilities }>;
  
  /** Create and initiate a new call */
  createCall(params: CreateCallParams): Promise<CallDetails>;
  
  /** Get detailed information about a specific call */
  getCallDetails(callId: string): Promise<CallDetails>;
  
  /** List calls with optional filtering */
  listCalls(filters: CallFilters): Promise<Call[]>;
  
  /** Get analytics for a specific timeframe */
  getAnalytics(timeframe: '24h' | '7d' | '30d' | '90d'): Promise<Analytics>;
  
  /** Normalize webhook events from the platform to a common format */
  normalizeWebhookEvent(rawEvent: any): NormalizedEvent;
  
  /** Verify webhook signature (if platform supports it) */
  verifyWebhookSignature?(payload: string, signature: string, secret: string): boolean;
}

/**
 * Base connector abstract class with common functionality
 */
export abstract class BaseConnector implements IVoiceConnector {
  protected apiKey: string;
  protected baseUrl: string;
  abstract readonly name: 'vapi' | 'elevenlabs' | 'retell';

  constructor(apiKey: string, baseUrl: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  abstract getCapabilities(): ConnectorCapabilities;
  abstract testConnection(): Promise<{ success: boolean; error?: string; capabilities?: ConnectorCapabilities }>;
  abstract createCall(params: CreateCallParams): Promise<CallDetails>;
  abstract getCallDetails(callId: string): Promise<CallDetails>;
  abstract listCalls(filters: CallFilters): Promise<Call[]>;
  abstract getAnalytics(timeframe: '24h' | '7d' | '30d' | '90d'): Promise<Analytics>;
  abstract normalizeWebhookEvent(rawEvent: any): NormalizedEvent;

  /**
   * Common HTTP request helper
   */
  protected async makeRequest(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: any
  ): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Different platforms use different auth headers
    if (this.name === 'elevenlabs') {
      headers['xi-api-key'] = this.apiKey;
    } else {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${this.name} API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  /**
   * Calculate date range for analytics timeframe
   */
  protected getDateRange(timeframe: '24h' | '7d' | '30d' | '90d'): { startDate: string; endDate: string } {
    const now = new Date();
    const endDate = now.toISOString();
    
    const startDate = new Date(now);
    switch (timeframe) {
      case '24h':
        startDate.setHours(startDate.getHours() - 24);
        break;
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
    }

    return {
      startDate: startDate.toISOString(),
      endDate,
    };
  }
}
