import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const VAPI_BASE_URL = 'https://api.vapi.ai';

// Static voice lists for providers that don't have APIs
const DEEPGRAM_VOICES = [
  { voice_id: 'aura-asteria-en', name: 'Asteria', gender: 'female', language: 'en', provider: 'deepgram' },
  { voice_id: 'aura-luna-en', name: 'Luna', gender: 'female', language: 'en', provider: 'deepgram' },
  { voice_id: 'aura-stella-en', name: 'Stella', gender: 'female', language: 'en', provider: 'deepgram' },
  { voice_id: 'aura-athena-en', name: 'Athena', gender: 'female', language: 'en', provider: 'deepgram' },
  { voice_id: 'aura-hera-en', name: 'Hera', gender: 'female', language: 'en', provider: 'deepgram' },
  { voice_id: 'aura-orion-en', name: 'Orion', gender: 'male', language: 'en', provider: 'deepgram' },
  { voice_id: 'aura-arcas-en', name: 'Arcas', gender: 'male', language: 'en', provider: 'deepgram' },
  { voice_id: 'aura-perseus-en', name: 'Perseus', gender: 'male', language: 'en', provider: 'deepgram' },
  { voice_id: 'aura-angus-en', name: 'Angus', gender: 'male', language: 'en', provider: 'deepgram' },
  { voice_id: 'aura-orpheus-en', name: 'Orpheus', gender: 'male', language: 'en', provider: 'deepgram' },
  { voice_id: 'aura-helios-en', name: 'Helios', gender: 'male', language: 'en', provider: 'deepgram' },
  { voice_id: 'aura-zeus-en', name: 'Zeus', gender: 'male', language: 'en', provider: 'deepgram' },
];

const PLAYHT_VOICES = [
  { voice_id: 's3://voice-cloning-zero-shot/775ae416-49bb-4fb6-bd45-740f205d20a1/jennifersaad/manifest.json', name: 'Jennifer (Conversational)', gender: 'female', language: 'en', provider: 'playht' },
  { voice_id: 's3://voice-cloning-zero-shot/d9ff78ba-d016-47f6-b0ef-dd630f59414e/susanad/manifest.json', name: 'Susana', gender: 'female', language: 'en', provider: 'playht' },
  { voice_id: 's3://voice-cloning-zero-shot/820da3d2-3a3b-42e7-844d-e68db835a206/michaelsaad/manifest.json', name: 'Michael (Conversational)', gender: 'male', language: 'en', provider: 'playht' },
  { voice_id: 's3://voice-cloning-zero-shot/e5df2eb3-5153-40fa-9f6e-6e27bbb7a38e/jacksaad/manifest.json', name: 'Jack (Conversational)', gender: 'male', language: 'en', provider: 'playht' },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, apiKey, organizationId, agentId, ...params } = await req.json();

    console.log(`[Vapi] Action: ${action}, OrgId: ${organizationId || 'N/A'}, AgentId: ${agentId || 'N/A'}`);

    if (!action) throw new Error('Missing required parameter: action');

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
    let vapiApiKey = apiKey;
    let elevenLabsApiKey: string | null = null;

    if (!vapiApiKey && organizationId) {
      const { data: integration } = await supabase
        .from('organization_integrations')
        .select('api_key')
        .eq('organization_id', organizationId)
        .eq('platform', 'vapi')
        .eq('is_active', true)
        .single();

      if (integration) vapiApiKey = integration.api_key;

      const { data: elIntegration } = await supabase
        .from('organization_integrations')
        .select('api_key')
        .eq('organization_id', organizationId)
        .eq('platform', 'elevenlabs')
        .eq('is_active', true)
        .single();

      if (elIntegration) elevenLabsApiKey = elIntegration.api_key;
    }

    if (!vapiApiKey) throw new Error('API key not found. Please configure Vapi integration.');

    let result;

    switch (action) {
      // ==================== ASSISTANTS ====================
      case 'listAssistants':
        result = await vapiRequest(vapiApiKey, 'GET', '/assistant', params);
        break;
      case 'getAssistant':
        if (!params.assistantId) throw new Error('assistantId is required');
        result = await vapiRequest(vapiApiKey, 'GET', `/assistant/${params.assistantId}`);
        break;
      case 'createAssistant': {
        const assistantConfig: any = { name: params.name };
        if (params.systemPrompt) {
          assistantConfig.model = {
            provider: params.llmProvider || 'openai',
            model: params.llmModel || 'gpt-4o-mini',
            temperature: params.temperature ?? 0.7,
            maxTokens: params.maxTokens || 1000,
            messages: [{ role: 'system', content: params.systemPrompt }],
          };
        } else if (params.config?.model) {
          assistantConfig.model = params.config.model;
        }
        if (params.voiceId) {
          const voiceProvider = params.voiceProvider || 'elevenlabs';
          assistantConfig.voice = { provider: voiceProvider, voiceId: params.voiceId };
          if (voiceProvider === 'elevenlabs') {
            assistantConfig.voice.stability = params.stability ?? 0.5;
            assistantConfig.voice.similarityBoost = params.similarityBoost ?? 0.75;
            if (params.style !== undefined) assistantConfig.voice.style = params.style;
          }
        } else if (params.config?.voice) {
          assistantConfig.voice = params.config.voice;
        }
        if (params.firstMessage) assistantConfig.firstMessage = params.firstMessage;
        else if (params.config?.firstMessage) assistantConfig.firstMessage = params.config.firstMessage;
        if (params.silenceTimeout !== undefined) assistantConfig.silenceTimeoutSeconds = params.silenceTimeout;
        if (params.maxDuration !== undefined) assistantConfig.maxDurationSeconds = params.maxDuration;
        if (params.endCallEnabled !== undefined) assistantConfig.endCallFunctionEnabled = params.endCallEnabled;
        if (params.metadata) assistantConfig.metadata = params.metadata;
        if (params.serverUrl) assistantConfig.serverUrl = params.serverUrl;
        if (params.serverUrlSecret) assistantConfig.serverUrlSecret = params.serverUrlSecret;
        if (params.endCallMessage) assistantConfig.endCallMessage = params.endCallMessage;
        if (params.endCallPhrases) assistantConfig.endCallPhrases = params.endCallPhrases;
        if (params.voicemailMessage) assistantConfig.voicemailMessage = params.voicemailMessage;
        if (params.analysisPlan) assistantConfig.analysisPlan = params.analysisPlan;
        if (params.artifactPlan) assistantConfig.artifactPlan = params.artifactPlan;
        if (params.messagePlan) assistantConfig.messagePlan = params.messagePlan;
        if (params.startSpeakingPlan) assistantConfig.startSpeakingPlan = params.startSpeakingPlan;
        if (params.stopSpeakingPlan) assistantConfig.stopSpeakingPlan = params.stopSpeakingPlan;
        if (params.monitorPlan) assistantConfig.monitorPlan = params.monitorPlan;
        if (params.credentialIds) assistantConfig.credentialIds = params.credentialIds;
        if (params.transcriber) assistantConfig.transcriber = params.transcriber;
        if (params.config) Object.assign(assistantConfig, params.config);
        result = await vapiRequest(vapiApiKey, 'POST', '/assistant', undefined, assistantConfig);
        break;
      }
      case 'updateAssistant':
        if (!params.assistantId) throw new Error('assistantId is required');
        result = await vapiRequest(vapiApiKey, 'PATCH', `/assistant/${params.assistantId}`, undefined, params.config);
        break;
      case 'deleteAssistant':
        if (!params.assistantId) throw new Error('assistantId is required');
        result = await vapiRequest(vapiApiKey, 'DELETE', `/assistant/${params.assistantId}`);
        break;

      // ==================== SQUADS ====================
      case 'listSquads':
        result = await vapiRequest(vapiApiKey, 'GET', '/squad', params);
        break;
      case 'getSquad':
        if (!params.squadId) throw new Error('squadId is required');
        result = await vapiRequest(vapiApiKey, 'GET', `/squad/${params.squadId}`);
        break;
      case 'createSquad':
        result = await vapiRequest(vapiApiKey, 'POST', '/squad', undefined, params.config);
        break;
      case 'updateSquad':
        if (!params.squadId) throw new Error('squadId is required');
        result = await vapiRequest(vapiApiKey, 'PATCH', `/squad/${params.squadId}`, undefined, params.config);
        break;
      case 'deleteSquad':
        if (!params.squadId) throw new Error('squadId is required');
        result = await vapiRequest(vapiApiKey, 'DELETE', `/squad/${params.squadId}`);
        break;

      // ==================== CALLS ====================
      case 'listCalls':
        result = await vapiRequest(vapiApiKey, 'GET', '/call', {
          limit: params.limit || 100,
          ...(params.assistantId && { assistantId: params.assistantId }),
          ...(params.createdAtGt && { createdAtGt: params.createdAtGt }),
          ...(params.createdAtLt && { createdAtLt: params.createdAtLt }),
          ...(params.createdAtGe && { createdAtGe: params.createdAtGe }),
          ...(params.createdAtLe && { createdAtLe: params.createdAtLe }),
        });
        break;
      case 'getCall':
        if (!params.callId) throw new Error('callId is required');
        result = await vapiRequest(vapiApiKey, 'GET', `/call/${params.callId}`);
        break;
      case 'createCall':
        result = await vapiRequest(vapiApiKey, 'POST', '/call', undefined, {
          ...(params.type === 'web' ? {} : {
            phoneNumberId: params.phoneNumberId,
            customer: { number: params.to, ...(params.customerName && { name: params.customerName }) },
          }),
          assistantId: agentId || params.assistantId,
          ...(params.squadId && { squadId: params.squadId }),
          ...(params.metadata && { metadata: params.metadata }),
          ...(params.transport && { transport: params.transport }),
          ...(params.schedulePlan && { schedulePlan: params.schedulePlan }),
        });
        break;
      case 'updateCall':
        if (!params.callId) throw new Error('callId is required');
        result = await vapiRequest(vapiApiKey, 'PATCH', `/call/${params.callId}`, undefined, params.config);
        break;
      case 'deleteCall':
        if (!params.callId) throw new Error('callId is required');
        result = await vapiRequest(vapiApiKey, 'DELETE', `/call/${params.callId}`);
        break;

      // ==================== CHATS ====================
      case 'listChats':
        result = await vapiRequest(vapiApiKey, 'GET', '/chat', params);
        break;
      case 'getChat':
        if (!params.chatId) throw new Error('chatId is required');
        result = await vapiRequest(vapiApiKey, 'GET', `/chat/${params.chatId}`);
        break;
      case 'createChat':
        result = await vapiRequest(vapiApiKey, 'POST', '/chat', undefined, params.config);
        break;
      case 'deleteChat':
        if (!params.chatId) throw new Error('chatId is required');
        result = await vapiRequest(vapiApiKey, 'DELETE', `/chat/${params.chatId}`);
        break;
      case 'createChatCompletion':
        result = await vapiRequest(vapiApiKey, 'POST', '/chat/completions', undefined, params.config);
        break;

      // ==================== CAMPAIGNS ====================
      case 'listCampaigns':
        result = await vapiRequest(vapiApiKey, 'GET', '/campaign', params);
        break;
      case 'getCampaign':
        if (!params.campaignId) throw new Error('campaignId is required');
        result = await vapiRequest(vapiApiKey, 'GET', `/campaign/${params.campaignId}`);
        break;
      case 'createCampaign':
        result = await vapiRequest(vapiApiKey, 'POST', '/campaign', undefined, params.config);
        break;
      case 'updateCampaign':
        if (!params.campaignId) throw new Error('campaignId is required');
        result = await vapiRequest(vapiApiKey, 'PATCH', `/campaign/${params.campaignId}`, undefined, params.config);
        break;
      case 'deleteCampaign':
        if (!params.campaignId) throw new Error('campaignId is required');
        result = await vapiRequest(vapiApiKey, 'DELETE', `/campaign/${params.campaignId}`);
        break;

      // ==================== SESSIONS ====================
      case 'listSessions':
        result = await vapiRequest(vapiApiKey, 'GET', '/session', params);
        break;
      case 'getSession':
        if (!params.sessionId) throw new Error('sessionId is required');
        result = await vapiRequest(vapiApiKey, 'GET', `/session/${params.sessionId}`);
        break;
      case 'createSession':
        result = await vapiRequest(vapiApiKey, 'POST', '/session', undefined, params.config);
        break;
      case 'updateSession':
        if (!params.sessionId) throw new Error('sessionId is required');
        result = await vapiRequest(vapiApiKey, 'PATCH', `/session/${params.sessionId}`, undefined, params.config);
        break;
      case 'deleteSession':
        if (!params.sessionId) throw new Error('sessionId is required');
        result = await vapiRequest(vapiApiKey, 'DELETE', `/session/${params.sessionId}`);
        break;

      // ==================== PHONE NUMBERS ====================
      case 'listPhoneNumbers':
        result = await vapiRequest(vapiApiKey, 'GET', '/phone-number', params);
        break;
      case 'getPhoneNumber':
        if (!params.phoneNumberId) throw new Error('phoneNumberId is required');
        result = await vapiRequest(vapiApiKey, 'GET', `/phone-number/${params.phoneNumberId}`);
        break;
      case 'createPhoneNumber':
      case 'buyPhoneNumber':
        result = await vapiRequest(vapiApiKey, 'POST', '/phone-number', undefined, {
          provider: params.provider || 'vapi',
          ...(params.number && { number: params.number }),
          ...(params.areaCode && { areaCode: params.areaCode }),
          ...(params.assistantId && { assistantId: params.assistantId }),
          ...(params.squadId && { squadId: params.squadId }),
          ...(params.name && { name: params.name }),
          ...(params.serverUrl && { serverUrl: params.serverUrl }),
          ...(params.serverUrlSecret && { serverUrlSecret: params.serverUrlSecret }),
        });
        break;
      case 'updatePhoneNumber':
        if (!params.phoneNumberId) throw new Error('phoneNumberId is required');
        result = await vapiRequest(vapiApiKey, 'PATCH', `/phone-number/${params.phoneNumberId}`, undefined, params.config);
        break;
      case 'deletePhoneNumber':
        if (!params.phoneNumberId) throw new Error('phoneNumberId is required');
        result = await vapiRequest(vapiApiKey, 'DELETE', `/phone-number/${params.phoneNumberId}`);
        break;

      // ==================== TOOLS ====================
      case 'listTools':
        result = await vapiRequest(vapiApiKey, 'GET', '/tool', params);
        break;
      case 'getTool':
        if (!params.toolId) throw new Error('toolId is required');
        result = await vapiRequest(vapiApiKey, 'GET', `/tool/${params.toolId}`);
        break;
      case 'createTool':
        result = await vapiRequest(vapiApiKey, 'POST', '/tool', undefined, params.config);
        break;
      case 'updateTool':
        if (!params.toolId) throw new Error('toolId is required');
        result = await vapiRequest(vapiApiKey, 'PATCH', `/tool/${params.toolId}`, undefined, params.config);
        break;
      case 'deleteTool':
        if (!params.toolId) throw new Error('toolId is required');
        result = await vapiRequest(vapiApiKey, 'DELETE', `/tool/${params.toolId}`);
        break;

      // ==================== BLOCKS ====================
      case 'listBlocks':
        result = await vapiRequest(vapiApiKey, 'GET', '/block', params);
        break;
      case 'getBlock':
        if (!params.blockId) throw new Error('blockId is required');
        result = await vapiRequest(vapiApiKey, 'GET', `/block/${params.blockId}`);
        break;
      case 'createBlock':
        result = await vapiRequest(vapiApiKey, 'POST', '/block', undefined, params.config);
        break;
      case 'updateBlock':
        if (!params.blockId) throw new Error('blockId is required');
        result = await vapiRequest(vapiApiKey, 'PATCH', `/block/${params.blockId}`, undefined, params.config);
        break;
      case 'deleteBlock':
        if (!params.blockId) throw new Error('blockId is required');
        result = await vapiRequest(vapiApiKey, 'DELETE', `/block/${params.blockId}`);
        break;

      // ==================== FILES ====================
      case 'listFiles':
        result = await vapiRequest(vapiApiKey, 'GET', '/file');
        break;
      case 'getFile':
        if (!params.fileId) throw new Error('fileId is required');
        result = await vapiRequest(vapiApiKey, 'GET', `/file/${params.fileId}`);
        break;
      case 'createFile': {
        const filePayload: any = { name: params.name || 'document.txt', purpose: 'assistants' };
        if (params.content) {
          const encoder = new TextEncoder();
          const bytes = encoder.encode(params.content);
          const base64 = btoa(String.fromCharCode(...bytes));
          filePayload.bytes = base64;
          filePayload.mimetype = 'text/plain';
        }
        if (params.url) filePayload.url = params.url;
        result = await vapiRequest(vapiApiKey, 'POST', '/file', undefined, filePayload);
        break;
      }
      case 'updateFile':
        if (!params.fileId) throw new Error('fileId is required');
        result = await vapiRequest(vapiApiKey, 'PATCH', `/file/${params.fileId}`, undefined, params.config);
        break;
      case 'deleteFile':
        if (!params.fileId) throw new Error('fileId is required');
        result = await vapiRequest(vapiApiKey, 'DELETE', `/file/${params.fileId}`);
        break;
      case 'getFileContent': {
        if (!params.fileId) throw new Error('fileId is required');
        const fileData = await vapiRequest(vapiApiKey, 'GET', `/file/${params.fileId}`);
        const fileUrl = params.fileUrl || fileData?.url;
        if (!fileUrl) { result = { content: null, contentUnavailableReason: 'no_url' }; break; }
        try {
          const contentResponse = await fetch(fileUrl);
          if (!contentResponse.ok) { result = { content: null, contentUnavailableReason: 'fetch_failed' }; break; }
          const contentType = contentResponse.headers.get('content-type') || '';
          if (contentType.includes('text/') || contentType.includes('application/json') || contentType.includes('application/xml')) {
            const textContent = await contentResponse.text();
            result = { content: textContent.slice(0, 100000), contentType, truncated: textContent.length > 100000 };
          } else {
            result = { content: null, contentUnavailableReason: 'binary_content', contentType };
          }
        } catch (fetchError) {
          result = { content: null, contentUnavailableReason: 'fetch_exception' };
        }
        break;
      }

      // ==================== KNOWLEDGE BASES ====================
      case 'listKnowledgeBases':
        result = await vapiRequest(vapiApiKey, 'GET', '/knowledge-base');
        break;
      case 'getKnowledgeBase':
        if (!params.knowledgeBaseId) throw new Error('knowledgeBaseId is required');
        result = await vapiRequest(vapiApiKey, 'GET', `/knowledge-base/${params.knowledgeBaseId}`);
        break;
      case 'createKnowledgeBase':
        result = await vapiRequest(vapiApiKey, 'POST', '/knowledge-base', undefined, {
          name: params.name || 'New Knowledge Base',
          ...(params.fileIds && { fileIds: params.fileIds }),
        });
        break;
      case 'deleteKnowledgeBase':
        if (!params.knowledgeBaseId) throw new Error('knowledgeBaseId is required');
        result = await vapiRequest(vapiApiKey, 'DELETE', `/knowledge-base/${params.knowledgeBaseId}`);
        break;

      // ==================== VOICES ====================
      case 'listVoices': {
        const voiceProvider = params.provider || 'all';
        const voices: any[] = [];
        if (voiceProvider === 'all' || voiceProvider === 'elevenlabs') {
          if (elevenLabsApiKey || params.elevenLabsApiKey) {
            try {
              const elResponse = await fetch('https://api.elevenlabs.io/v1/voices', {
                headers: { 'xi-api-key': elevenLabsApiKey || params.elevenLabsApiKey }
              });
              if (elResponse.ok) {
                const elData = await elResponse.json();
                voices.push(...(elData.voices || []).map((v: any) => ({
                  voice_id: v.voice_id, name: v.name,
                  gender: v.labels?.gender || 'unknown', language: v.labels?.language || 'en',
                  accent: v.labels?.accent, description: v.description,
                  preview_url: v.preview_url, category: v.category, provider: 'elevenlabs',
                })));
              }
            } catch (e) { console.error('[Vapi] ElevenLabs voices error:', e); }
          }
        }
        if (voiceProvider === 'all' || voiceProvider === 'deepgram') voices.push(...DEEPGRAM_VOICES);
        if (voiceProvider === 'all' || voiceProvider === 'playht') voices.push(...PLAYHT_VOICES);
        result = voices;
        break;
      }

      // ==================== ANALYTICS ====================
      case 'getAnalytics': {
        // Try native analytics endpoint first
        try {
          const analyticsParams: any = {};
          if (params.rangeStart) analyticsParams.rangeStart = params.rangeStart;
          if (params.rangeEnd) analyticsParams.rangeEnd = params.rangeEnd;
          if (params.assistantId || agentId) analyticsParams.assistantId = params.assistantId || agentId;
          if (params.phoneNumberId) analyticsParams.phoneNumberId = params.phoneNumberId;
          result = await vapiRequest(vapiApiKey, 'GET', '/analytics', analyticsParams);
        } catch {
          // Fallback: compute from calls
          const startDate = getStartDate(params.timeframe || '7d');
          const callsQuery: any = { limit: 1000, createdAtGt: startDate.toISOString() };
          if (agentId || params.assistantId) callsQuery.assistantId = agentId || params.assistantId;
          const calls = await vapiRequest(vapiApiKey, 'GET', '/call', callsQuery);
          result = computeAnalytics(Array.isArray(calls) ? calls : []);
        }
        break;
      }

      // ==================== LOGS ====================
      case 'getLogs':
        result = await vapiRequest(vapiApiKey, 'GET', '/logs', {
          ...(params.callId && { callId: params.callId }),
          ...(params.assistantId && { assistantId: params.assistantId }),
          ...(params.level && { level: params.level }),
          ...(params.page && { page: params.page }),
          ...(params.pageSize && { pageSize: params.pageSize }),
        });
        break;

      default:
        throw new Error(`Unsupported action: ${action}`);
    }

    console.log(`[Vapi] Action ${action} completed`);
    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[Vapi] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function vapiRequest(
  apiKey: string, method: string, endpoint: string,
  queryParams?: Record<string, any>, body?: any
) {
  let url = `${VAPI_BASE_URL}${endpoint}`;
  if (queryParams && Object.keys(queryParams).length > 0) {
    const p = new URLSearchParams();
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined && value !== null) p.append(key, String(value));
    }
    url += `?${p.toString()}`;
  }
  console.log(`[Vapi] ${method} ${url}`);
  const options: RequestInit = {
    method,
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  };
  if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
    options.body = JSON.stringify(body);
  }
  const response = await fetch(url, options);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vapi API error (${response.status}): ${errorText}`);
  }
  const text = await response.text();
  if (!text) return { success: true };
  try { return JSON.parse(text); } catch { return { success: true, message: text }; }
}

function getStartDate(timeframe: string): Date {
  const now = new Date();
  switch (timeframe) {
    case '24h': now.setHours(now.getHours() - 24); break;
    case '7d': case '7days': now.setDate(now.getDate() - 7); break;
    case '30d': case '30days': now.setDate(now.getDate() - 30); break;
    case '90d': now.setDate(now.getDate() - 90); break;
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
    const status = call.status || 'unknown';
    callsByStatus[status] = (callsByStatus[status] || 0) + 1;
    if (call.endedAt && call.startedAt) {
      totalDuration += (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000;
    }
    if (status === 'ended') completedCalls++;
    const day = call.createdAt?.split('T')[0];
    if (day) callsByDay[day] = (callsByDay[day] || 0) + 1;
  }
  return {
    totalCalls, completedCalls,
    totalDuration: Math.round(totalDuration),
    avgDuration: totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0,
    successRate: totalCalls > 0 ? Math.round((completedCalls / totalCalls) * 100) : 0,
    callsByStatus, callsByDay,
  };
}
