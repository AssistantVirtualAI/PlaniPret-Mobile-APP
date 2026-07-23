import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ConversationFilters {
  agentId?: string;
  sentiment?: string;
  dateFrom?: string;
  dateTo?: string;
  minDuration?: number;
  maxDuration?: number;
  search?: string;
  platform?: string;
}

interface NormalizedConversation {
  conversation_id: string;
  agent_id: string;
  agent_name: string;
  platform_agent_id: string;
  platform: string;
  start_time: string;
  end_time?: string;
  duration: number;
  status: string;
  caller_number?: string;
  transcript?: string;
  metadata?: any;
  analysis?: {
    summary?: string;
    satisfaction_score?: number;
    sentiment?: string;
    keywords?: string[];
  };
}

// Normalize ElevenLabs conversation
function normalizeElevenLabsConversation(conv: any, config: any): NormalizedConversation {
  return {
    conversation_id: conv.conversation_id,
    agent_id: config.id,
    agent_name: config.name,
    platform_agent_id: config.agentId,
    platform: 'elevenlabs',
    start_time: conv.start_time || conv.created_at || conv.timestamp,
    end_time: conv.end_time,
    duration: conv.call_duration_secs || conv.duration || 0,
    status: conv.status || 'completed',
    caller_number: conv.caller_id || conv.metadata?.caller_id || conv.metadata?.caller_number || conv.metadata?.phone_number || conv.user_id || undefined,
    transcript: conv.transcript,
    metadata: conv.metadata,
    analysis: conv.analysis,
  };
}

// Normalize Retell call
function normalizeRetellCall(call: any, config: any): NormalizedConversation {
  const startTime = call.start_timestamp ? new Date(call.start_timestamp).toISOString() : undefined;
  const endTime = call.end_timestamp ? new Date(call.end_timestamp).toISOString() : undefined;
  const duration = call.end_timestamp && call.start_timestamp 
    ? Math.round((call.end_timestamp - call.start_timestamp) / 1000) 
    : 0;

  return {
    conversation_id: call.call_id,
    agent_id: config.id,
    agent_name: config.name,
    platform_agent_id: config.agentId,
    platform: 'retell',
    start_time: startTime || call.created_at || new Date().toISOString(),
    end_time: endTime,
    duration: duration,
    status: call.call_status || call.status || 'completed',
    caller_number: call.from_number || call.caller_id || undefined,
    transcript: call.transcript,
    metadata: call.metadata,
    analysis: call.call_analysis ? {
      summary: call.call_analysis.call_summary,
      satisfaction_score: call.call_analysis.user_sentiment === 'Positive' ? 8 : 
                          call.call_analysis.user_sentiment === 'Negative' ? 3 : 5,
      sentiment: call.call_analysis.user_sentiment?.toLowerCase(),
    } : undefined,
  };
}

// Normalize Vapi call
function normalizeVapiCall(call: any, config: any): NormalizedConversation {
  const startTime = call.startedAt || call.createdAt;
  const endTime = call.endedAt;
  const duration = startTime && endTime 
    ? Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000) 
    : call.duration || 0;

  return {
    conversation_id: call.id,
    agent_id: config.id,
    agent_name: config.name,
    platform_agent_id: config.agentId,
    platform: 'vapi',
    start_time: startTime || new Date().toISOString(),
    end_time: endTime,
    duration: duration,
    status: call.status || 'completed',
    caller_number: call.customer?.number || call.phoneNumber || undefined,
    transcript: call.transcript,
    metadata: call.metadata,
    analysis: call.analysis ? {
      summary: call.analysis.summary,
      satisfaction_score: call.analysis.successEvaluation === 'true' ? 8 : 5,
      sentiment: call.analysis.successEvaluation === 'true' ? 'positive' : 'neutral',
    } : undefined,
  };
}

async function fetchRetellCall(apiKey: string, callId: string): Promise<any | null> {
  const encoded = encodeURIComponent(callId);

  const candidates: Array<{ method: 'GET' | 'POST'; url: string; body?: any }> = [
    { method: 'GET', url: `https://api.retellai.com/get-call/${encoded}` },
    { method: 'GET', url: `https://api.retellai.com/v2/get-call/${encoded}` },
    { method: 'POST', url: `https://api.retellai.com/get-call`, body: { call_id: callId } },
    { method: 'POST', url: `https://api.retellai.com/v2/get-call`, body: { call_id: callId } },
  ];

  for (const c of candidates) {
    try {
      const res = await fetch(c.url, {
        method: c.method,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'accept': 'application/json',
          ...(c.method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(c.method === 'POST' ? { body: JSON.stringify(c.body ?? {}) } : {}),
      });

      if (res.ok) return await res.json();

      const text = await res.text().catch(() => '');
      console.log(`[Retell][get-call] ${c.method} ${c.url} -> ${res.status} ${text?.slice(0, 200)}`);
    } catch (e) {
      console.log(`[Retell][get-call] ${c.method} ${c.url} -> error`, e);
    }
  }

  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { 
      page = 1, 
      limit = 50, 
      filters = {} as ConversationFilters,
      action = 'list',
      organizationId,
      conversationId,
      platformAgentId,
      format = 'mp3'
    } = await req.json();

    const authHeaderRaw = req.headers.get('authorization') || req.headers.get('Authorization');
    if (!authHeaderRaw) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const match = authHeaderRaw.match(/Bearer\s+(.+)/i);
    const token = match?.[1]?.trim();
    if (!token) {
      return new Response(JSON.stringify({ error: 'Invalid authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing backend env vars');
      return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    // Auth user
    let user: any = null;
    const res1 = await supabase.auth.getUser();
    user = res1.data?.user;
    if (!user) {
      const res2 = await supabase.auth.getUser(token);
      user = res2.data?.user;
    }

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const requestedOrgId = typeof organizationId === 'string' && organizationId.length > 0 ? organizationId : null;
    let orgId = requestedOrgId;

    if (requestedOrgId) {
      const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('organization_id', requestedOrgId)
        .maybeSingle();

      if (!membership) {
        return new Response(JSON.stringify({ error: 'Forbidden for selected organization' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      const { data: memberships } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .limit(1);
      orgId = memberships?.[0]?.organization_id ?? null;
    }

    if (!orgId) {
      return new Response(JSON.stringify({ error: 'No organization found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get ALL agents for the organization (no platform filter)
    const { data: agents, error: agentsError } = await supabase
      .from('agents')
      .select('id, name, platform_agent_id, platform_api_key, platform, config')
      .eq('organization_id', orgId);

    if (agentsError) {
      console.error('Error fetching agents:', agentsError);
      throw new Error('Error fetching agents');
    }

    // Get integrations only for the selected organization.
    // Do not fall back to user-owned integrations: org data must stay fully isolated.
    const { data: integrations } = await supabase
      .from('organization_integrations')
      .select('id, agent_id, api_key, platform, additional_config')
      .eq('is_active', true)
      .eq('organization_id', orgId);

    // Build integration API keys map by platform
    const integrationApiKeys: Record<string, Record<string, string>> = {
      elevenlabs: {},
      retell: {},
      vapi: {}
    };
    
    if (integrations) {
      for (const integration of integrations) {
        if (integration.api_key && integration.platform) {
          integrationApiKeys[integration.platform] = integrationApiKeys[integration.platform] || {};
          integrationApiKeys[integration.platform][integration.id] = integration.api_key;
          // Also set a default key for the platform
          integrationApiKeys[integration.platform]['_default'] = integration.api_key;
        }
      }
    }

    // Build agent configs for all platforms
    interface AgentConfig {
      id: string;
      name: string;
      agentId: string;
      apiKey: string;
      platform: string;
    }
    
    const agentConfigs: AgentConfig[] = [];

    if (agents && agents.length > 0) {
      for (const agent of agents) {
        const agentId = agent.platform_agent_id || (agent.config as any)?.agent_id;
        if (!agentId) {
          console.log(`Agent ${agent.name} has no agent_id configured`);
          continue;
        }

        // Get API key from platform_api_key OR integration fallback
        let apiKey = agent.platform_api_key;
        
        if (!apiKey && (agent.config as any)?.integration_id) {
          const platform = agent.platform || 'elevenlabs';
          apiKey = integrationApiKeys[platform]?.[(agent.config as any).integration_id];
        }
        
        // Fallback to default integration key for the platform
        if (!apiKey) {
          const platform = agent.platform || 'elevenlabs';
          apiKey = integrationApiKeys[platform]?.['_default'];
        }

        if (apiKey) {
          agentConfigs.push({
            id: agent.id,
            name: agent.name,
            agentId: agentId,
            apiKey: apiKey,
            platform: agent.platform || 'elevenlabs'
          });
          console.log(`Added agent config for ${agent.name} (${agent.platform}) with agentId ${agentId}`);
        } else {
          console.log(`Agent ${agent.name} has no API key available`);
        }
      }
    }

    // Also add agents from integrations with agent_id
    if (integrations) {
      for (const integration of integrations) {
        if (integration.agent_id && integration.api_key) {
          const exists = agentConfigs.some(a => a.agentId === integration.agent_id);
          if (!exists) {
            agentConfigs.push({
              id: integration.id,
              name: `${integration.platform} Agent`,
              agentId: integration.agent_id,
              apiKey: integration.api_key,
              platform: integration.platform
            });
          }
        }
      }
    }

    if (agentConfigs.length === 0) {
      return new Response(
        JSON.stringify({ 
          requiresSetup: true, 
          message: 'Aucun agent configuré. Veuillez créer un agent avec vos credentials.',
          conversations: [],
          agents: [],
          total: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle 'details' action
    if (action === 'details' && conversationId) {
      const candidateConfigs = platformAgentId
        ? agentConfigs.filter((c) => c.agentId === platformAgentId)
        : agentConfigs;

      for (const config of candidateConfigs) {
        try {
          let detailsData: any | null = null;

          if (config.platform === 'elevenlabs') {
            const res = await fetch(
              `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`,
              { headers: { 'xi-api-key': config.apiKey, 'accept': 'application/json' } }
            );
            if (res.ok) detailsData = await res.json();
          } else if (config.platform === 'retell') {
            detailsData = await fetchRetellCall(config.apiKey, conversationId);
          } else if (config.platform === 'vapi') {
            const res = await fetch(
              `https://api.vapi.ai/call/${conversationId}`,
              { headers: { 'Authorization': `Bearer ${config.apiKey}` } }
            );
            if (res.ok) detailsData = await res.json();
          }

          if (detailsData) {
            // Normalize Retell response to match expected format
            if (config.platform === 'retell') {
              const retellData = detailsData;

              // Format transcript from Retell's transcript_object or transcript array
              let formattedTranscript = '';
              const transcriptMessages: any[] = [];

              if (retellData.transcript_object && Array.isArray(retellData.transcript_object)) {
                for (const item of retellData.transcript_object) {
                  const role = item.role === 'agent' ? 'Agent' : 'User';
                  const content = item.content || item.text || '';
                  formattedTranscript += `${role}: ${content}\n`;
                  transcriptMessages.push({
                    role: item.role,
                    message: content,
                    time_in_call_secs: item.words?.[0]?.start || 0,
                  });
                }
              } else if (retellData.transcript && typeof retellData.transcript === 'string') {
                formattedTranscript = retellData.transcript;
              }

              // Calculate duration
              const duration = retellData.end_timestamp && retellData.start_timestamp
                ? Math.round((retellData.end_timestamp - retellData.start_timestamp) / 1000)
                : retellData.duration_ms
                  ? Math.round(retellData.duration_ms / 1000)
                  : 0;

              const normalizedRetell = {
                conversation_id: retellData.call_id,
                call_id: retellData.call_id,
                agent_name: config.name,
                platform: 'retell',
                start_time: retellData.start_timestamp ? new Date(retellData.start_timestamp).toISOString() : undefined,
                end_time: retellData.end_timestamp ? new Date(retellData.end_timestamp).toISOString() : undefined,
                call_duration_secs: duration,
                duration: duration,
                status: retellData.call_status || 'completed',
                transcript: formattedTranscript,
                transcript_object: transcriptMessages.length > 0 ? transcriptMessages : retellData.transcript_object,
                recording_url: retellData.recording_url,
                audio_url: retellData.recording_url,
                metadata: {
                  ...retellData.metadata,
                  from_number: retellData.from_number,
                  to_number: retellData.to_number,
                  call_type: retellData.call_type,
                  disconnection_reason: retellData.disconnection_reason,
                  caller_number: retellData.from_number || retellData.caller_id,
                },
                caller_number: retellData.from_number || retellData.caller_id || undefined,
                analysis: retellData.call_analysis ? {
                  summary: retellData.call_analysis.call_summary,
                  satisfaction_score: retellData.call_analysis.user_sentiment === 'Positive' ? 8 :
                                      retellData.call_analysis.user_sentiment === 'Negative' ? 3 : 5,
                  sentiment: retellData.call_analysis.user_sentiment?.toLowerCase(),
                  call_successful: retellData.call_analysis.call_successful,
                  custom_analysis: retellData.call_analysis.custom_analysis_data,
                } : undefined,
                _raw: retellData,
              };

              return new Response(
                JSON.stringify(normalizedRetell),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }

            // Normalize Vapi response
            if (config.platform === 'vapi') {
              const vapiData = detailsData;
              const startTime = vapiData.startedAt || vapiData.createdAt;
              const endTime = vapiData.endedAt;
              const duration = startTime && endTime
                ? Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000)
                : vapiData.duration || 0;

              const normalizedVapi = {
                conversation_id: vapiData.id,
                agent_name: config.name,
                platform: 'vapi',
                start_time: startTime,
                end_time: endTime,
                call_duration_secs: duration,
                duration: duration,
                status: vapiData.status || 'completed',
                caller_number: vapiData.customer?.number || vapiData.phoneNumber || undefined,
                transcript: vapiData.transcript,
                recording_url: vapiData.recordingUrl,
                audio_url: vapiData.recordingUrl,
                metadata: { ...vapiData.metadata, caller_number: vapiData.customer?.number || vapiData.phoneNumber },
                analysis: vapiData.analysis ? {
                  summary: vapiData.analysis.summary,
                  satisfaction_score: vapiData.analysis.successEvaluation === 'true' ? 8 : 5,
                  sentiment: vapiData.analysis.successEvaluation === 'true' ? 'positive' : 'neutral',
                } : undefined,
                _raw: vapiData,
              };

              return new Response(
                JSON.stringify(normalizedVapi),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }

            // ElevenLabs - return as-is with platform info
            return new Response(
              JSON.stringify({ ...detailsData, agent_name: config.name, platform: config.platform }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        } catch (e) {
          console.log(`Conversation ${conversationId} not found for agent ${config.name}:`, e);
        }
      }

      return new Response(
        JSON.stringify({ notFound: true, error: 'Conversation not found' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle 'audio' action (for all platforms)
    if (action === 'audio' && conversationId) {
      // Try ElevenLabs first
      for (const config of agentConfigs.filter(c => c.platform === 'elevenlabs')) {
        const audioEndpoints = [
          `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}/audio?format=${format}`,
          `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}/audio`,
        ];

        for (const audioUrl of audioEndpoints) {
          try {
            const audioResponse = await fetch(audioUrl, {
              headers: { 'xi-api-key': config.apiKey, 'accept': 'audio/mpeg' },
            });

            if (audioResponse.ok) {
              const audioBuffer = await audioResponse.arrayBuffer();
              const base64Audio = base64Encode(audioBuffer);
              return new Response(
                JSON.stringify({
                  audio_base64: base64Audio,
                  audio_url: `data:audio/mpeg;base64,${base64Audio}`,
                  format,
                  platform: 'elevenlabs',
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          } catch (e) {
            console.log(`ElevenLabs audio fetch error for ${conversationId}:`, e);
          }
        }
      }
      
      // Try Retell - get recording_url from call details
      const retellCandidates = platformAgentId
        ? agentConfigs.filter((c) => c.platform === 'retell' && c.agentId === platformAgentId)
        : agentConfigs.filter((c) => c.platform === 'retell');

      for (const config of retellCandidates) {
        try {
          const callData = await fetchRetellCall(config.apiKey, conversationId);
          if (callData?.recording_url) {
            // Retell provides a direct URL to the recording
            return new Response(
              JSON.stringify({
                audio_url: callData.recording_url,
                recording_url: callData.recording_url,
                format: 'wav', // Retell typically uses wav
                platform: 'retell',
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        } catch (e) {
          console.log(`Retell audio fetch error for ${conversationId}:`, e);
        }
      }
      
      // Try Vapi - get recordingUrl from call details
      for (const config of agentConfigs.filter(c => c.platform === 'vapi')) {
        try {
          const callResponse = await fetch(
            `https://api.vapi.ai/call/${conversationId}`,
            { headers: { 'Authorization': `Bearer ${config.apiKey}` } }
          );
          
          if (callResponse.ok) {
            const callData = await callResponse.json();
            if (callData.recordingUrl) {
              return new Response(
                JSON.stringify({
                  audio_url: callData.recordingUrl,
                  recording_url: callData.recordingUrl,
                  format: 'mp3',
                  platform: 'vapi',
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          }
        } catch (e) {
          console.log(`Vapi audio fetch error for ${conversationId}:`, e);
        }
      }
      
      return new Response(
        JSON.stringify({ audio_base64: null, audio_url: null, format, notFound: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // List conversations from all agents (multi-platform)
    console.log(`Fetching conversations from ${agentConfigs.length} agents across all platforms`);
    
    const allConversations: NormalizedConversation[] = [];
    const agentsList: Array<{ id: string; name: string; agentId: string; platform: string; conversationCount: number }> = [];

    // Filter by specific agent if requested
    const configsToProcess = filters.agentId 
      ? agentConfigs.filter(c => c.id === filters.agentId || c.agentId === filters.agentId)
      : agentConfigs;

    for (const config of configsToProcess) {
      try {
        console.log(`Fetching conversations for ${config.platform} agent ${config.name} (${config.agentId})`);
        
        let conversations: NormalizedConversation[] = [];

        if (config.platform === 'elevenlabs') {
          // Fetch ALL conversations for ElevenLabs using pagination
          let allElevenLabsConvs: any[] = [];
          let cursor: string | undefined = undefined;
          const pageLimit = 100;
          
          do {
            const url = new URL('https://api.elevenlabs.io/v1/convai/conversations');
            url.searchParams.set('agent_id', config.agentId);
            url.searchParams.set('page_size', String(pageLimit));
            if (cursor) {
              url.searchParams.set('cursor', cursor);
            }
            
            const response = await fetch(url.toString(), {
              headers: { 'xi-api-key': config.apiKey, 'accept': 'application/json' }
            });

            if (response.ok) {
              const data = await response.json();
              const convs = data.conversations || [];
              allElevenLabsConvs.push(...convs);
              cursor = data.next_cursor || data.cursor;
              
              // Break if no more pages or very large dataset (safety)
              if (!cursor || allElevenLabsConvs.length >= 5000) break;
            } else {
              break;
            }
          } while (cursor);
          
          // Batch-fetch details for the first 30 conversations to get caller_number
          const convsToEnrich = allElevenLabsConvs.slice(0, 30);
          const detailResults = await Promise.allSettled(
            convsToEnrich.map(async (conv: any) => {
              try {
                const detailRes = await fetch(
                  `https://api.elevenlabs.io/v1/convai/conversations/${conv.conversation_id}`,
                  { headers: { 'xi-api-key': config.apiKey, 'accept': 'application/json' } }
                );
                if (detailRes.ok) {
                  const detail = await detailRes.json();
                  return { id: conv.conversation_id, caller_id: detail.caller_id, metadata: detail.metadata, user_id: detail.user_id };
                }
              } catch (e) {
                // ignore individual failures
              }
              return null;
            })
          );
          
          // Build a map of conversation_id -> caller info
          const callerMap = new Map<string, string>();
          for (const result of detailResults) {
            if (result.status === 'fulfilled' && result.value) {
              const { id, caller_id, metadata } = result.value;
              const { user_id } = result.value;
              const callerNumber = caller_id || metadata?.caller_id || metadata?.caller_number || metadata?.phone_number || user_id;
              if (callerNumber) {
                callerMap.set(id, callerNumber);
              }
            }
          }
          
          conversations = allElevenLabsConvs.map((conv: any) => {
            const normalized = normalizeElevenLabsConversation(conv, config);
            // Enrich with caller_number from details if available
            if (!normalized.caller_number && callerMap.has(conv.conversation_id)) {
              normalized.caller_number = callerMap.get(conv.conversation_id);
            }
            return normalized;
          });
        } else if (config.platform === 'retell') {
          // Fetch ALL calls from Retell (no time limit, max 1000)
          const response = await fetch('https://api.retellai.com/v2/list-calls', {
            method: 'POST',
            headers: { 
              'Authorization': `Bearer ${config.apiKey}`, 
              'Content-Type': 'application/json' 
            },
            body: JSON.stringify({
              filter_criteria: { agent_id: [config.agentId] },
              limit: 1000,
              sort_order: 'descending'
            })
          });

          if (response.ok) {
            const calls = await response.json();
            conversations = (Array.isArray(calls) ? calls : []).map((call: any) => 
              normalizeRetellCall(call, config)
            );
          }
        } else if (config.platform === 'vapi') {
          // Fetch ALL calls from Vapi (no limit, max 1000)
          const response = await fetch(
            `https://api.vapi.ai/call?assistantId=${config.agentId}&limit=1000`,
            { headers: { 'Authorization': `Bearer ${config.apiKey}` } }
          );

          if (response.ok) {
            const calls = await response.json();
            conversations = (Array.isArray(calls) ? calls : []).map((call: any) => 
              normalizeVapiCall(call, config)
            );
          }
        }

        allConversations.push(...conversations);
        agentsList.push({
          id: config.id,
          name: config.name,
          agentId: config.agentId,
          platform: config.platform,
          conversationCount: conversations.length
        });

        console.log(`Found ${conversations.length} conversations for ${config.name}`);
      } catch (error) {
        console.error(`Error fetching conversations for agent ${config.name}:`, error);
        agentsList.push({
          id: config.id,
          name: config.name,
          agentId: config.agentId,
          platform: config.platform,
          conversationCount: 0
        });
      }
    }

    // Apply filters
    let filteredConversations = allConversations;

    // Platform filter
    if (filters.platform) {
      filteredConversations = filteredConversations.filter(c => c.platform === filters.platform);
    }

    // Date filter
    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom).getTime();
      filteredConversations = filteredConversations.filter(c => {
        const convDate = new Date(c.start_time).getTime();
        return convDate >= fromDate;
      });
    }

    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo).getTime();
      filteredConversations = filteredConversations.filter(c => {
        const convDate = new Date(c.start_time).getTime();
        return convDate <= toDate;
      });
    }

    // Duration filter
    if (filters.minDuration) {
      filteredConversations = filteredConversations.filter(c => c.duration >= filters.minDuration!);
    }

    if (filters.maxDuration) {
      filteredConversations = filteredConversations.filter(c => c.duration <= filters.maxDuration!);
    }

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filteredConversations = filteredConversations.filter(c => {
        const transcript = (c.transcript || '').toLowerCase();
        const summary = (c.analysis?.summary || '').toLowerCase();
        const callerNumber = (c.caller_number || '').toLowerCase();
        return transcript.includes(searchLower) || summary.includes(searchLower) || callerNumber.includes(searchLower);
      });
    }

    // Sort by date descending
    filteredConversations.sort((a, b) => {
      const dateA = new Date(a.start_time).getTime();
      const dateB = new Date(b.start_time).getTime();
      return dateB - dateA;
    });

    // Pagination
    const total = filteredConversations.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const paginatedConversations = filteredConversations.slice(startIndex, startIndex + limit);

    return new Response(
      JSON.stringify({
        conversations: paginatedConversations,
        agents: agentsList,
        total,
        page,
        limit,
        totalPages,
        hasMore: page < totalPages
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('All agents conversations error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        conversations: [],
        agents: [],
        total: 0
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
