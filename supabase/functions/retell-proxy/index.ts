import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const RETELL_BASE_URL = 'https://api.retellai.com';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, apiKey, organizationId, agentId, ...params } = await req.json();

    console.log(`[Retell] Action: ${action}, Org: ${organizationId || 'N/A'}, Agent: ${agentId || 'N/A'}`);

    if (!action) {
      throw new Error('Missing required parameter: action');
    }

    // Require authenticated org member to use stored credentials
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (organizationId) {
      const { data: membership } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('user_id', user.id)
        .maybeSingle();
      const { data: isSuper } = await supabase.rpc('is_super_admin', { _user_id: user.id });
      if (!membership && !isSuper) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }


    // Resolve API key
    let retellApiKey = apiKey;
    if (!retellApiKey && organizationId) {
      const { data: integration } = await supabase
        .from('organization_integrations')
        .select('api_key')
        .eq('organization_id', organizationId)
        .eq('platform', 'retell')
        .eq('is_active', true)
        .single();

      if (integration) {
        retellApiKey = integration.api_key;
      }
    }

    if (!retellApiKey) {
      throw new Error('API key not found. Please configure Retell integration.');
    }

    const result = await handleAction(retellApiKey, action, agentId, params);

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[Retell] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function handleAction(apiKey: string, action: string, agentId: string | undefined, params: any): Promise<any> {
  switch (action) {
    // ─── VOICE AGENTS ───
    case 'listAgents':
      return retellRequest(apiKey, 'GET', '/v2/list-agents');
    case 'getAgent':
      return retellRequest(apiKey, 'GET', `/v2/get-agent/${requireId(params.retellAgentId || agentId, 'agentId')}`);
    case 'createAgent': {
      return handleCreateAgent(apiKey, agentId, params);
    }
    case 'updateAgent':
      return retellRequest(apiKey, 'PATCH', `/v2/update-agent/${requireId(params.retellAgentId || agentId, 'agentId')}`, undefined, params.config);
    case 'deleteAgent':
      return retellRequest(apiKey, 'DELETE', `/v2/delete-agent/${requireId(params.retellAgentId, 'agentId')}`);
    case 'publishAgent':
      return retellRequest(apiKey, 'POST', `/v2/publish-agent/${requireId(params.retellAgentId || agentId, 'agentId')}`, undefined, params.config || {});
    case 'getAgentVersions':
      return retellRequest(apiKey, 'GET', `/v2/get-agent-versions/${requireId(params.retellAgentId || agentId, 'agentId')}`);

    // ─── CALLS (V2) ───
    case 'createCall':
      return retellRequest(apiKey, 'POST', '/v2/create-phone-call', undefined, {
        from_number: params.from,
        to_number: params.to,
        agent_id: agentId || params.retellAgentId,
        ...(params.metadata && { metadata: params.metadata }),
        ...(params.retell_llm_dynamic_variables && { retell_llm_dynamic_variables: params.retell_llm_dynamic_variables }),
      });
    case 'createWebCall':
      return retellRequest(apiKey, 'POST', '/v2/create-web-call', undefined, {
        agent_id: agentId || params.retellAgentId,
        ...(params.metadata && { metadata: params.metadata }),
        ...(params.retell_llm_dynamic_variables && { retell_llm_dynamic_variables: params.retell_llm_dynamic_variables }),
      });
    case 'getCall':
      return retellRequest(apiKey, 'GET', `/v2/get-call/${requireId(params.callId, 'callId')}`);
    case 'listCalls': {
      const callFilters: any = {};
      const callAgentId = params.retellAgentId || agentId;
      if (callAgentId) callFilters.agent_id = [callAgentId];
      if (params.limit) callFilters.limit = params.limit;
      if (params.sortOrder) callFilters.sort_order = params.sortOrder;

      const raw = await retellRequest(apiKey, 'POST', '/v2/list-calls', undefined, 
        Object.keys(callFilters).length > 0 ? { filter_criteria: callFilters } : {}
      );
      return normalizeCallsArray(raw);
    }
    case 'updateCall':
      return retellRequest(apiKey, 'PATCH', `/v2/update-call/${requireId(params.callId, 'callId')}`, undefined, params.config);
    case 'deleteCall':
      return retellRequest(apiKey, 'DELETE', `/v2/delete-call/${requireId(params.callId, 'callId')}`);

    // ─── CHAT ───
    case 'createChat':
      return retellRequest(apiKey, 'POST', '/v2/create-chat', undefined, {
        agent_id: params.chatAgentId || agentId,
        ...(params.metadata && { metadata: params.metadata }),
        ...(params.retell_llm_dynamic_variables && { retell_llm_dynamic_variables: params.retell_llm_dynamic_variables }),
      });
    case 'getChat':
      return retellRequest(apiKey, 'GET', `/v2/get-chat/${requireId(params.chatId, 'chatId')}`);
    case 'listChats':
      return retellRequest(apiKey, 'GET', '/v2/list-chat');
    case 'updateChat':
      return retellRequest(apiKey, 'PATCH', `/v2/update-chat/${requireId(params.chatId, 'chatId')}`, undefined, params.config);
    case 'endChat':
      return retellRequest(apiKey, 'PATCH', `/v2/end-chat/${requireId(params.chatId, 'chatId')}`);
    case 'createChatCompletion':
      return retellRequest(apiKey, 'POST', '/v2/create-chat-completion', undefined, params.config);
    case 'createOutboundSms':
      return retellRequest(apiKey, 'POST', '/v2/create-outbound-sms', undefined, params.config);

    // ─── CHAT AGENTS ───
    case 'createChatAgent':
      return retellRequest(apiKey, 'POST', '/v2/create-chat-agent', undefined, params.config);
    case 'getChatAgent':
      return retellRequest(apiKey, 'GET', `/v2/get-chat-agent/${requireId(params.chatAgentId, 'chatAgentId')}`);
    case 'listChatAgents':
      return retellRequest(apiKey, 'GET', '/v2/list-chat-agents');
    case 'updateChatAgent':
      return retellRequest(apiKey, 'PATCH', `/v2/update-chat-agent/${requireId(params.chatAgentId, 'chatAgentId')}`, undefined, params.config);
    case 'deleteChatAgent':
      return retellRequest(apiKey, 'DELETE', `/v2/delete-chat-agent/${requireId(params.chatAgentId, 'chatAgentId')}`);
    case 'publishChatAgent':
      return retellRequest(apiKey, 'POST', `/v2/publish-chat-agent/${requireId(params.chatAgentId, 'chatAgentId')}`, undefined, params.config || {});
    case 'getChatAgentVersions':
      return retellRequest(apiKey, 'GET', `/v2/get-chat-agent-versions/${requireId(params.chatAgentId, 'chatAgentId')}`);

    // ─── RETELL LLM ───
    case 'listLlms':
      return retellRequest(apiKey, 'GET', '/v2/list-retell-llms');
    case 'getLlm':
      return retellRequest(apiKey, 'GET', `/v2/get-retell-llm/${requireId(params.llmId, 'llmId')}`);
    case 'createLlm':
      return retellRequest(apiKey, 'POST', '/v2/create-retell-llm', undefined, params.config);
    case 'updateLlm':
      return retellRequest(apiKey, 'PATCH', `/v2/update-retell-llm/${requireId(params.llmId, 'llmId')}`, undefined, params.config);
    case 'deleteLlm':
      return retellRequest(apiKey, 'DELETE', `/v2/delete-retell-llm/${requireId(params.llmId, 'llmId')}`);

    // ─── CONVERSATION FLOW ───
    case 'createConversationFlow':
      return retellRequest(apiKey, 'POST', '/v2/create-conversation-flow', undefined, params.config);
    case 'getConversationFlow':
      return retellRequest(apiKey, 'GET', `/v2/get-conversation-flow/${requireId(params.flowId, 'flowId')}`);
    case 'listConversationFlows':
      return retellRequest(apiKey, 'GET', '/v2/list-conversation-flows');
    case 'updateConversationFlow':
      return retellRequest(apiKey, 'PATCH', `/v2/update-conversation-flow/${requireId(params.flowId, 'flowId')}`, undefined, params.config);
    case 'deleteConversationFlow':
      return retellRequest(apiKey, 'DELETE', `/v2/delete-conversation-flow/${requireId(params.flowId, 'flowId')}`);

    // ─── CONVERSATION FLOW COMPONENT ───
    case 'createConversationFlowComponent':
      return retellRequest(apiKey, 'POST', '/v2/create-conversation-flow-component', undefined, params.config);
    case 'getConversationFlowComponent':
      return retellRequest(apiKey, 'GET', `/v2/get-conversation-flow-component/${requireId(params.componentId, 'componentId')}`);
    case 'listConversationFlowComponents':
      return retellRequest(apiKey, 'GET', '/v2/list-conversation-flow-components');
    case 'updateConversationFlowComponent':
      return retellRequest(apiKey, 'PATCH', `/v2/update-conversation-flow-component/${requireId(params.componentId, 'componentId')}`, undefined, params.config);
    case 'deleteConversationFlowComponent':
      return retellRequest(apiKey, 'DELETE', `/v2/delete-conversation-flow-component/${requireId(params.componentId, 'componentId')}`);

    // ─── MCP TOOLS ───
    case 'getMcpTools':
      return retellRequest(apiKey, 'GET', '/v2/get-mcp-tools');

    // ─── KNOWLEDGE BASE ───
    case 'listKnowledgeBases':
      return retellRequest(apiKey, 'GET', '/v2/list-knowledge-bases');
    case 'getKnowledgeBase':
      return retellRequest(apiKey, 'GET', `/v2/get-knowledge-base/${requireId(params.knowledgeBaseId, 'knowledgeBaseId')}`);
    case 'createKnowledgeBase': {
      const kbPayload: any = {
        knowledge_base_name: params.name || 'New Knowledge Base',
      };
      if (params.texts?.length > 0) {
        kbPayload.knowledge_base_texts = params.texts.map((t: any) => ({
          text: t.content || t.text,
          title: t.title || 'Document',
        }));
      }
      if (params.urls?.length > 0) {
        kbPayload.knowledge_base_urls = params.urls;
      }
      return retellRequest(apiKey, 'POST', '/v2/create-knowledge-base', undefined, kbPayload);
    }
    case 'updateKnowledgeBase': {
      const updateKbPayload: any = {};
      if (params.knowledge_base_name) updateKbPayload.knowledge_base_name = params.knowledge_base_name;
      if (params.knowledge_base_texts) updateKbPayload.knowledge_base_texts = params.knowledge_base_texts;
      if (params.knowledge_base_urls) updateKbPayload.knowledge_base_urls = params.knowledge_base_urls;
      return retellRequest(apiKey, 'PATCH', `/v2/update-knowledge-base/${requireId(params.knowledgeBaseId, 'knowledgeBaseId')}`, undefined, updateKbPayload);
    }
    case 'deleteKnowledgeBase':
      return retellRequest(apiKey, 'DELETE', `/v2/delete-knowledge-base/${requireId(params.knowledgeBaseId, 'knowledgeBaseId')}`);
    case 'addKnowledgeBaseSources': {
      const sourcesPayload: any = {};
      if (params.texts) {
        sourcesPayload.knowledge_base_texts = params.texts.map((t: any) => ({
          text: t.content || t.text,
          title: t.title || 'Document',
        }));
      }
      if (params.urls) {
        sourcesPayload.knowledge_base_urls = params.urls;
      }
      return retellRequest(apiKey, 'POST', `/v2/add-knowledge-base-sources/${requireId(params.knowledgeBaseId, 'knowledgeBaseId')}`, undefined, sourcesPayload);
    }
    case 'deleteKnowledgeBaseSource':
      return retellRequest(apiKey, 'DELETE', `/v2/delete-knowledge-base-source/${requireId(params.knowledgeBaseId, 'knowledgeBaseId')}/${requireId(params.sourceId, 'sourceId')}`);

    // ─── VOICES ───
    case 'listVoices':
      return retellRequest(apiKey, 'GET', '/v2/list-voices');
    case 'getVoice':
      return retellRequest(apiKey, 'GET', `/v2/get-voice/${requireId(params.voiceId, 'voiceId')}`);
    case 'addVoice':
      return retellRequest(apiKey, 'POST', '/v2/add-voice', undefined, params.config);
    case 'cloneVoice':
      return retellRequest(apiKey, 'POST', '/v2/clone-voice', undefined, params.config);
    case 'searchVoice':
      return retellRequest(apiKey, 'POST', '/v2/search-voice', undefined, params.config || {});

    // ─── PHONE NUMBERS ───
    case 'listPhoneNumbers':
      return retellRequest(apiKey, 'GET', '/v2/list-phone-numbers');
    case 'getPhoneNumber':
      return retellRequest(apiKey, 'GET', `/v2/get-phone-number/${encodeURIComponent(requireId(params.phoneNumber, 'phoneNumber'))}`);
    case 'createPhoneNumber':
      return retellRequest(apiKey, 'POST', '/v2/create-phone-number', undefined, params.config);
    case 'updatePhoneNumber':
      return retellRequest(apiKey, 'PATCH', `/v2/update-phone-number/${encodeURIComponent(requireId(params.phoneNumber, 'phoneNumber'))}`, undefined, params.config);
    case 'deletePhoneNumber':
      return retellRequest(apiKey, 'DELETE', `/v2/delete-phone-number/${encodeURIComponent(requireId(params.phoneNumber, 'phoneNumber'))}`);
    case 'importPhoneNumber':
      return retellRequest(apiKey, 'POST', '/v2/import-phone-number', undefined, {
        phone_number: params.phoneNumber,
        ...(params.agentId && { agent_id: params.agentId }),
        ...(params.terminationUri && { termination_uri: params.terminationUri }),
      });
    case 'registerPhoneCall':
      return retellRequest(apiKey, 'POST', '/v2/register-phone-call', undefined, params.config);

    // ─── BATCH CALL ───
    case 'createBatchCall':
      return retellRequest(apiKey, 'POST', '/v2/create-batch-call', undefined, params.config);

    // ─── TEST CASE ───
    case 'createTestCaseDefinition':
      return retellRequest(apiKey, 'POST', '/v2/create-test-case-definition', undefined, params.config);
    case 'getTestCaseDefinition':
      return retellRequest(apiKey, 'GET', `/v2/get-test-case-definition/${requireId(params.testId, 'testId')}`);
    case 'listTestCaseDefinitions':
      return retellRequest(apiKey, 'GET', '/v2/list-test-case-definitions');
    case 'updateTestCaseDefinition':
      return retellRequest(apiKey, 'PUT', `/v2/update-test-case-definition/${requireId(params.testId, 'testId')}`, undefined, params.config);
    case 'deleteTestCaseDefinition':
      return retellRequest(apiKey, 'DELETE', `/v2/delete-test-case-definition/${requireId(params.testId, 'testId')}`);

    // ─── BATCH TEST ───
    case 'createBatchTest':
      return retellRequest(apiKey, 'POST', '/v2/create-batch-test', undefined, params.config);
    case 'getBatchTest':
      return retellRequest(apiKey, 'GET', `/v2/get-batch-test/${requireId(params.batchId, 'batchId')}`);
    case 'listBatchTests':
      return retellRequest(apiKey, 'GET', '/v2/list-batch-tests');

    // ─── TEST RUN ───
    case 'getTestRun':
      return retellRequest(apiKey, 'GET', `/v2/get-test-run/${requireId(params.runId, 'runId')}`);
    case 'listTestRuns':
      return retellRequest(apiKey, 'GET', '/v2/list-test-runs');

    // ─── CONCURRENCY ───
    case 'getConcurrency':
      return retellRequest(apiKey, 'GET', '/v2/get-concurrency');

    // ─── ANALYTICS (computed from calls) ───
    case 'getAnalytics': {
      const timeframe = params.timeframe || '7d';
      const startDate = getStartDate(timeframe);

      const callsResult = await retellRequest(apiKey, 'POST', '/v2/list-calls', undefined, {
        filter_criteria: {
          ...(agentId && { agent_id: [agentId] }),
        },
        limit: 1000,
      });

      const callsArray = normalizeCallsArray(callsResult);
      const filteredCalls = callsArray.filter((call: any) => {
        const callDate = new Date(call.start_timestamp || call.created_at);
        return callDate >= startDate;
      });

      return computeAnalytics(filteredCalls);
    }

    default:
      throw new Error(`Unsupported action: ${action}`);
  }
}

// ─── Create Agent (with optional LLM creation) ───
async function handleCreateAgent(apiKey: string, agentId: string | undefined, params: any) {
  let llmId = params.llmId;
  
  if (!llmId && params.systemPrompt) {
    console.log('[Retell] Creating LLM for agent...');
    const llmConfig: any = {
      model: params.llmModel || 'gpt-4o-mini',
      general_prompt: params.systemPrompt,
      general_tools: [],
    };
    if (params.firstMessage) llmConfig.begin_message = params.firstMessage;
    if (params.temperature !== undefined) llmConfig.model_temperature = params.temperature;

    const llmResult = await retellRequest(apiKey, 'POST', '/v2/create-retell-llm', undefined, llmConfig);
    llmId = llmResult.llm_id;
    console.log(`[Retell] Created LLM: ${llmId}`);
  }

  const agentConfig: any = {
    agent_name: params.name,
    voice_id: params.voiceId,
  };

  if (llmId) {
    agentConfig.response_engine = { type: 'retell-llm', llm_id: llmId };
  }
  if (params.speed !== undefined) agentConfig.voice_speed = params.speed;
  if (params.voiceTemperature !== undefined) agentConfig.voice_temperature = params.voiceTemperature;
  if (params.language) agentConfig.language = params.language;
  if (params.silenceTimeout !== undefined) agentConfig.end_call_after_silence_ms = params.silenceTimeout * 1000;
  if (params.ambientSound) agentConfig.ambient_sound = params.ambientSound;
  if (params.pronunciationDictionary) agentConfig.pronunciation_dictionary = params.pronunciationDictionary;
  if (params.config) Object.assign(agentConfig, params.config);

  const result = await retellRequest(apiKey, 'POST', '/v2/create-agent', undefined, agentConfig);
  if (llmId) result.llm_id = llmId;
  return result;
}

// ─── Helpers ───
function requireId(id: string | undefined | null, name: string): string {
  if (!id) throw new Error(`${name} is required`);
  return id;
}

function normalizeCallsArray(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.calls)) return raw.calls;
  if (Array.isArray(raw?.call_details)) return raw.call_details;
  return [];
}

async function retellRequest(
  apiKey: string, 
  method: string, 
  endpoint: string, 
  queryParams?: Record<string, any>,
  body?: any
) {
  let url = `${RETELL_BASE_URL}${endpoint}`;
  
  if (queryParams && Object.keys(queryParams).length > 0) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    }
    url += `?${params.toString()}`;
  }

  console.log(`[Retell] ${method} ${url}`);

  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  };

  if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Retell] API Error: ${response.status} - ${errorText}`);
    throw new Error(`Retell API error (${response.status}): ${errorText}`);
  }

  const text = await response.text();
  if (!text) return { success: true };
  
  try {
    return JSON.parse(text);
  } catch {
    return { success: true, message: text };
  }
}

function getStartDate(timeframe: string): Date {
  const now = new Date();
  switch (timeframe) {
    case '24h': now.setHours(now.getHours() - 24); break;
    case '7d': now.setDate(now.getDate() - 7); break;
    case '30d': now.setDate(now.getDate() - 30); break;
    case '90d': now.setDate(now.getDate() - 90); break;
    case 'all': return new Date(0);
    default: return new Date(0);
  }
  return now;
}

function computeAnalytics(calls: any[]) {
  const totalCalls = calls.length;
  let totalDuration = 0;
  let completedCalls = 0;
  const callsByStatus: Record<string, number> = {};
  const callsByDay: Record<string, number> = {};

  for (const call of calls) {
    const status = call.call_status || call.status || 'unknown';
    callsByStatus[status] = (callsByStatus[status] || 0) + 1;

    if (call.end_timestamp && call.start_timestamp) {
      totalDuration += (call.end_timestamp - call.start_timestamp) / 1000;
    }

    if (status === 'ended' || status === 'completed') completedCalls++;

    const timestamp = call.start_timestamp || call.created_at;
    if (timestamp) {
      const day = new Date(timestamp).toISOString().split('T')[0];
      callsByDay[day] = (callsByDay[day] || 0) + 1;
    }
  }

  return {
    totalCalls,
    completedCalls,
    totalDuration: Math.round(totalDuration),
    avgDuration: totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0,
    successRate: totalCalls > 0 ? Math.round((completedCalls / totalCalls) * 100) : 0,
    callsByStatus,
    callsByDay,
  };
}
