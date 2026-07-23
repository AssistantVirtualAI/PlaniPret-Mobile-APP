import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';

type AnyObj = Record<string, any>;

function findWebhookCandidates(obj: any, path: string[] = [], out: Array<{ path: string; value: any }> = []) {
  if (!obj || typeof obj !== 'object') return out;

  for (const [k, v] of Object.entries(obj as AnyObj)) {
    const nextPath = [...path, k];
    const key = k.toLowerCase();

    if (key.includes('webhook')) {
      out.push({ path: nextPath.join('.'), value: v });
    }

    if (v && typeof v === 'object') {
      findWebhookCandidates(v, nextPath, out);
    }
  }

  return out;
}

function normalizeAgentWebhookCandidates(agentData: any) {
  const candidates = findWebhookCandidates(agentData);
  const webhooks: any[] = [];

  for (const c of candidates) {
    const v = c.value;

    // Common shapes we might see in agent config
    // - { webhook_id, url, is_disabled }
    // - { webhookId, webhookUrl, enabled }
    // - string id
    if (typeof v === 'string') {
      // If a string looks like an id, keep it as a reference.
      webhooks.push({
        webhook_id: v,
        name: `Agent webhook (${c.path})`,
        is_disabled: false,
        source_path: c.path,
      });
      continue;
    }

    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const webhookId = v.webhook_id || v.webhookId || v.id || null;
      const webhookUrl = v.webhook_url || v.webhookUrl || v.url || null;
      const isDisabled =
        typeof v.is_disabled === 'boolean'
          ? v.is_disabled
          : typeof v.disabled === 'boolean'
            ? v.disabled
            : typeof v.enabled === 'boolean'
              ? !v.enabled
              : false;

      // Only keep entries that actually look like a webhook config
      if (webhookId || webhookUrl) {
        webhooks.push({
          webhook_id: webhookId || `agent_webhook:${c.path}`,
          name: v.name || `Agent webhook (${c.path})`,
          is_disabled: isDisabled,
          webhook_url: webhookUrl,
          source_path: c.path,
          raw: v,
        });
      }
    }
  }

  // De-dupe by webhook_id
  const seen = new Set<string>();
  return webhooks.filter((w) => {
    const id = String(w.webhook_id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { 
      action, 
      agentId, 
      prompt, 
      firstMessage, 
      voiceSettings, 
      llmSettings,
      fullConfig,
      ttsSettings,
      asrSettings,
      turnSettings,
      conversationSettings,
      agentAdvancedSettings,
      platformSettings,
      tools,
      webhookConfig,
      apiKey: providedApiKey, 
      integrationId,
      organizationId
    } = await req.json();
    
    console.log(`[elevenlabs-agent-config] Action: ${action}, AgentId: ${agentId}, organizationId: ${organizationId}, hasApiKey: ${!!providedApiKey}`);
    
    let apiKey = providedApiKey;
    let targetAgentId = agentId;
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    // SECURITY: require valid user JWT before any service-role lookup.
    const authHeaderTop = req.headers.get('Authorization') || '';
    if (!authHeaderTop.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { data: { user: authUser } } = await supabaseService.auth.getUser(authHeaderTop.replace('Bearer ', ''));
    if (!authUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (organizationId) {
      const { data: isSuper } = await supabaseService.rpc('is_super_admin', { _user_id: authUser.id });
      if (!isSuper) {
        const { data: membership } = await supabaseService
          .from('organization_members')
          .select('id')
          .eq('user_id', authUser.id)
          .eq('organization_id', organizationId)
          .maybeSingle();
        if (!membership) {
          return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }
    }

    // If no API key provided directly, try multiple fallback strategies
    if (!apiKey) {

      // Strategy 1: Try organizationId if provided (for portal usage)
      if (organizationId) {
        console.log(`[elevenlabs-agent-config] Looking up API key via organizationId: ${organizationId}`);
        const { data: integration } = await supabaseService
          .from('organization_integrations')
          .select('api_key, agent_id')
          .eq('organization_id', organizationId)
          .eq('platform', 'elevenlabs')
          .eq('is_active', true)
          .maybeSingle();
        
        if (integration?.api_key) {
          apiKey = integration.api_key;
          targetAgentId = agentId || integration.agent_id;
          console.log(`[elevenlabs-agent-config] Got API key from organization_integrations via organizationId`);
        }
      }
      
      // Strategy 2: Try agentId to find agent's organization
      if (!apiKey && agentId) {
        // Check if agentId looks like a UUID to avoid query errors
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(agentId);
        
        let agent = null;
        if (isUuid) {
          const { data } = await supabaseService
            .from('agents')
            .select('platform_agent_id, platform_api_key, organization_id, config')
            .or(`id.eq.${agentId},platform_agent_id.eq.${agentId}`)
            .maybeSingle();
          agent = data;
        } else {
          // Non-UUID agentId — only search by platform_agent_id
          const { data } = await supabaseService
            .from('agents')
            .select('platform_agent_id, platform_api_key, organization_id, config')
            .eq('platform_agent_id', agentId)
            .maybeSingle();
          agent = data;
        }
        
        if (agent) {
          targetAgentId = agent.platform_agent_id || agentId;
          
          if (agent.platform_api_key) {
            apiKey = agent.platform_api_key;
            console.log(`[elevenlabs-agent-config] Got API key from agent.platform_api_key`);
          } else if ((agent.config as any)?.api_key) {
            apiKey = (agent.config as any).api_key;
            console.log(`[elevenlabs-agent-config] Got API key from agent.config.api_key`);
          } else if (agent.organization_id) {
            const { data: integration } = await supabaseService
              .from('organization_integrations')
              .select('api_key')
              .eq('organization_id', agent.organization_id)
              .eq('platform', 'elevenlabs')
              .eq('is_active', true)
              .maybeSingle();
            
            if (integration?.api_key) {
              apiKey = integration.api_key;
              console.log(`[elevenlabs-agent-config] Got API key from organization_integrations via agent's org`);
            }
          }
        }
      }
      
      // Strategy 3: Try user authentication as last resort
      if (!apiKey) {
        const authHeader = req.headers.get('Authorization');
        if (authHeader) {
          const token = authHeader.replace('Bearer ', '');
          const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } }
          });

          const { data: { user } } = await supabaseAuth.auth.getUser(token);
          if (user) {
            const { data: integration } = await supabaseAuth
              .from('organization_integrations')
              .select('api_key, agent_id')
              .eq('user_id', user.id)
              .eq('platform', 'elevenlabs')
              .eq('is_active', true)
              .maybeSingle();

            if (integration?.api_key) {
              apiKey = integration.api_key;
              targetAgentId = agentId || integration.agent_id;
              console.log(`[elevenlabs-agent-config] Got API key from user's integration`);
            }
          }
        }
      }
    }

    if (!apiKey) {
      console.log('[elevenlabs-agent-config] No API key found');
      return new Response(
        JSON.stringify({ 
          requiresSetup: true, 
          message: 'Configuration ElevenLabs requise' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Actions that don't require an agent ID
    if (action === 'get_voices') {
      console.log('[elevenlabs-agent-config] Fetching available voices');
      
      const voicesResponse = await fetch(`${ELEVENLABS_BASE_URL}/voices`, {
        headers: { 'xi-api-key': apiKey },
      });

      if (!voicesResponse.ok) {
        const errorText = await voicesResponse.text();
        throw new Error(`ElevenLabs API error: ${voicesResponse.status} - ${errorText}`);
      }

      const voicesData = await voicesResponse.json();
      console.log(`[elevenlabs-agent-config] Fetched ${voicesData.voices?.length || 0} voices`);
      
      return new Response(
        JSON.stringify({ voices: voicesData.voices }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'get_models') {
      console.log('[elevenlabs-agent-config] Fetching available models');
      
      const modelsResponse = await fetch(`${ELEVENLABS_BASE_URL}/models`, {
        headers: { 'xi-api-key': apiKey },
      });

      if (!modelsResponse.ok) {
        const errorText = await modelsResponse.text();
        throw new Error(`ElevenLabs API error: ${modelsResponse.status} - ${errorText}`);
      }

      const modelsData = await modelsResponse.json();
      console.log(`[elevenlabs-agent-config] Fetched ${modelsData.length || 0} models`);
      
      return new Response(
        JSON.stringify({ models: modelsData }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'list_workspace_webhooks') {
      const filterAgentId = targetAgentId;
      console.log(`[elevenlabs-agent-config] Listing workspace webhooks${filterAgentId ? ` for agent ${filterAgentId}` : ''}`);

      const webhooksResponse = await fetch(`${ELEVENLABS_BASE_URL}/workspace/webhooks?include_usages=true`, {
        headers: { 'xi-api-key': apiKey },
      });

      if (!webhooksResponse.ok) {
        const errorText = await webhooksResponse.text();
        throw new Error(`ElevenLabs API error: ${webhooksResponse.status} - ${errorText}`);
      }

      const webhooksData = await webhooksResponse.json();
      let webhooks = webhooksData.webhooks || [];

      console.log(`[elevenlabs-agent-config] Raw webhooks count: ${webhooks.length}`);

      // If agent filter requested, try multiple strategies to map webhooks -> agent
      if (filterAgentId && webhooks.length > 0) {
        let agentWebhookId: string | null = null;

        // Strategy A: read webhook_id from agent config (structure can differ between API versions)
        try {
          const agentResponse = await fetch(`${ELEVENLABS_BASE_URL}/convai/agents/${filterAgentId}`, {
            headers: { 'xi-api-key': apiKey },
          });

          if (agentResponse.ok) {
            const agentData = await agentResponse.json();
            agentWebhookId =
              agentData?.platform_settings?.webhook?.webhook_id ||
              agentData?.platform_settings?.webhook_id ||
              agentData?.conversation_config?.platform_settings?.webhook?.webhook_id ||
              agentData?.conversation_config?.platform_settings?.webhook_id ||
              null;

            console.log(`[elevenlabs-agent-config] Agent ${filterAgentId} webhook_id (from config): ${agentWebhookId}`);
          } else {
            console.log(`[elevenlabs-agent-config] Could not fetch agent config: ${agentResponse.status}`);
          }
        } catch (e) {
          console.log(`[elevenlabs-agent-config] Error fetching agent config for webhook filter: ${String(e)}`);
        }

        // Strategy B: if include_usages=true provides agent association, filter using usages
        const matchesUsage = (webhook: any) => {
          const usages = webhook?.usages;
          if (!Array.isArray(usages)) return false;

          return usages.some((u: any) => {
            const ar = u?.associated_resources;
            // Sometimes associated_resources is an object, sometimes an array
            if (Array.isArray(ar)) {
              return ar.some((r: any) => r?.agent_id === filterAgentId);
            }
            return ar?.agent_id === filterAgentId;
          });
        };

        if (agentWebhookId) {
          webhooks = webhooks.filter((w: any) => w?.webhook_id === agentWebhookId);
          console.log(`[elevenlabs-agent-config] Filtered by webhook_id => ${webhooks.length} webhooks`);
        } else {
          const usageFiltered = webhooks.filter(matchesUsage);
          console.log(`[elevenlabs-agent-config] Filtered by usages => ${usageFiltered.length} webhooks`);
          webhooks = usageFiltered;
        }

        // Helpful debug: log one sample webhook shape (without secrets)
        if (webhooks.length === 0 && webhooksData?.webhooks?.length) {
          const sample = webhooksData.webhooks[0];
          console.log(`[elevenlabs-agent-config] Sample webhook keys: ${Object.keys(sample || {}).join(', ')}`);
          console.log(`[elevenlabs-agent-config] Sample webhook.usages type: ${Array.isArray(sample?.usages) ? 'array' : typeof sample?.usages}`);
        }
      } else {
        console.log(`[elevenlabs-agent-config] Fetched ${webhooks.length} workspace webhooks (no filter)`);
      }

      // Fallback: ElevenLabs may not expose ConvAI post-call webhooks via workspace webhooks.
      // If we couldn't find anything, try to extract webhook configuration directly from the agent config.
      if (filterAgentId && webhooks.length === 0) {
        try {
          const agentResponse = await fetch(`${ELEVENLABS_BASE_URL}/convai/agents/${filterAgentId}`, {
            headers: { 'xi-api-key': apiKey },
          });

          if (agentResponse.ok) {
            const agentData = await agentResponse.json();
            const derived = normalizeAgentWebhookCandidates(agentData);
            console.log(`[elevenlabs-agent-config] Derived ${derived.length} webhook candidates from agent config`);
            if (derived.length) {
              webhooks = derived;
            }
          } else {
            console.log(`[elevenlabs-agent-config] Fallback agent webhook scan failed: ${agentResponse.status}`);
          }
        } catch (e) {
          console.log(`[elevenlabs-agent-config] Fallback agent webhook scan error: ${String(e)}`);
        }
      }

      return new Response(
        JSON.stringify({ webhooks }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get webhook delivery logs (conversations that triggered webhooks)
    if (action === 'get_webhook_delivery_logs') {
      const { webhookId, limit = 50 } = await req.json().catch(() => ({}));
      console.log(`[elevenlabs-agent-config] Fetching webhook delivery logs for agent ${targetAgentId || 'all'}`);

      // Build query params for conversations list
      const queryParams = new URLSearchParams();
      if (targetAgentId) {
        queryParams.append('agent_id', targetAgentId);
      }
      queryParams.append('page_size', String(limit));

      const conversationsResponse = await fetch(
        `${ELEVENLABS_BASE_URL}/convai/conversations?${queryParams.toString()}`, 
        {
          headers: { 'xi-api-key': apiKey },
        }
      );

      if (!conversationsResponse.ok) {
        const errorText = await conversationsResponse.text();
        throw new Error(`ElevenLabs API error: ${conversationsResponse.status} - ${errorText}`);
      }

      const conversationsData = await conversationsResponse.json();
      const conversations = conversationsData.conversations || [];
      
      console.log(`[elevenlabs-agent-config] Fetched ${conversations.length} conversations as webhook delivery logs`);

      // Transform conversations to look like webhook delivery logs
      const deliveryLogs = conversations.map((conv: any) => ({
        id: conv.conversation_id,
        webhook_id: webhookId || null,
        agent_id: conv.agent_id,
        agent_name: conv.agent_name,
        event_type: 'post_call_transcription',
        timestamp: conv.start_time_unix_secs ? new Date(conv.start_time_unix_secs * 1000).toISOString() : null,
        duration_secs: conv.call_duration_secs,
        status: conv.call_successful === 'success' ? 'success' : conv.call_successful === 'failure' ? 'failure' : 'unknown',
        message_count: conv.message_count,
        direction: conv.direction,
        rating: conv.rating,
        summary: conv.transcript_summary,
        title: conv.call_summary_title,
      }));

      return new Response(
        JSON.stringify({ 
          delivery_logs: deliveryLogs,
          has_more: conversationsData.has_more,
          next_cursor: conversationsData.next_cursor,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'update_workspace_webhook') {
      const { webhookId, webhookName, isDisabled } = await req.json().catch(() => ({}));
      console.log(`[elevenlabs-agent-config] Updating workspace webhook ${webhookId}`);

      if (!webhookId) {
        return new Response(
          JSON.stringify({ error: 'webhookId is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const updateResponse = await fetch(`${ELEVENLABS_BASE_URL}/workspace/webhooks/${webhookId}`, {
        method: 'PATCH',
        headers: { 
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: webhookName ?? '',
          is_disabled: isDisabled ?? false,
        }),
      });

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        throw new Error(`ElevenLabs API error: ${updateResponse.status} - ${errorText}`);
      }

      const updateData = await updateResponse.json();
      console.log(`[elevenlabs-agent-config] Successfully updated webhook ${webhookId}`);

      return new Response(
        JSON.stringify({ success: true, data: updateData }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'delete_workspace_webhook') {
      const { webhookId } = await req.json().catch(() => ({}));
      console.log(`[elevenlabs-agent-config] Deleting workspace webhook ${webhookId}`);

      if (!webhookId) {
        return new Response(
          JSON.stringify({ error: 'webhookId is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const deleteResponse = await fetch(`${ELEVENLABS_BASE_URL}/workspace/webhooks/${webhookId}`, {
        method: 'DELETE',
        headers: { 'xi-api-key': apiKey },
      });

      if (!deleteResponse.ok) {
        const errorText = await deleteResponse.text();
        throw new Error(`ElevenLabs API error: ${deleteResponse.status} - ${errorText}`);
      }

      console.log(`[elevenlabs-agent-config] Successfully deleted webhook ${webhookId}`);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!targetAgentId) {
      return new Response(
        JSON.stringify({ error: 'Agent ID required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const agentUrl = `${ELEVENLABS_BASE_URL}/convai/agents/${targetAgentId}`;

    switch (action) {
      case 'get': {
        console.log(`[elevenlabs-agent-config] Fetching config for agent ${targetAgentId}`);
        
        const configResponse = await fetch(agentUrl, {
          headers: { 'xi-api-key': apiKey },
        });

        if (!configResponse.ok) {
          const errorText = await configResponse.text();
          console.error('[elevenlabs-agent-config] ElevenLabs API error:', configResponse.status, errorText);
          throw new Error(`ElevenLabs API error: ${configResponse.status} - ${errorText}`);
        }

        const configData = await configResponse.json();
        console.log('[elevenlabs-agent-config] Successfully fetched agent config');
        
        // Normalize the response so the client always gets the same structure
        // ElevenLabs returns conversation_config.agent.prompt.prompt, etc.
        const conversationConfig = configData.conversation_config || {};
        const agentConfig = conversationConfig.agent || {};
        
        const normalizedAgent = {
          ...configData,
          // Flatten prompt access
          prompt: {
            prompt: agentConfig.prompt?.prompt || configData.prompt?.prompt || '',
          },
          // Flatten first_message access
          first_message: agentConfig.first_message || configData.first_message || '',
          // Flatten TTS settings
          tts: conversationConfig.tts || configData.tts || {},
          // Keep original for reference
          conversation_config: conversationConfig,
        };
        
        return new Response(
          JSON.stringify({ agent: normalizedAgent }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'update_prompt': {
        console.log(`[elevenlabs-agent-config] Updating prompt for agent ${targetAgentId}`);
        
        const updateBody: any = {
          conversation_config: {
            agent: {
              prompt: {
                prompt: prompt
              }
            }
          }
        };

        if (firstMessage) {
          updateBody.conversation_config.agent.first_message = firstMessage;
        }
        
        const promptResponse = await fetch(agentUrl, {
          method: 'PATCH',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updateBody),
        });

        if (!promptResponse.ok) {
          const errorText = await promptResponse.text();
          console.error('[elevenlabs-agent-config] ElevenLabs API error:', promptResponse.status, errorText);
          throw new Error(`ElevenLabs API error: ${promptResponse.status} - ${errorText}`);
        }

        const promptData = await promptResponse.json();
        console.log('[elevenlabs-agent-config] Successfully updated prompt');
        
        return new Response(
          JSON.stringify({ success: true, data: promptData }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'update_voice': {
        console.log(`[elevenlabs-agent-config] Updating voice settings for agent ${targetAgentId}`);
        
        const voiceBody: any = {
          conversation_config: {
            tts: voiceSettings
          }
        };
        
        const voiceResponse = await fetch(agentUrl, {
          method: 'PATCH',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(voiceBody),
        });

        if (!voiceResponse.ok) {
          const errorText = await voiceResponse.text();
          console.error('[elevenlabs-agent-config] ElevenLabs API error:', voiceResponse.status, errorText);
          throw new Error(`ElevenLabs API error: ${voiceResponse.status} - ${errorText}`);
        }

        const voiceData = await voiceResponse.json();
        console.log('[elevenlabs-agent-config] Successfully updated voice settings');
        
        return new Response(
          JSON.stringify({ success: true, data: voiceData }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'update_tts_full': {
        console.log(`[elevenlabs-agent-config] Updating full TTS settings for agent ${targetAgentId}`);
        
        if (!ttsSettings) {
          return new Response(
            JSON.stringify({ error: 'TTS settings required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const ttsBody = {
          conversation_config: {
            tts: ttsSettings
          }
        };
        
        const ttsResponse = await fetch(agentUrl, {
          method: 'PATCH',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(ttsBody),
        });

        if (!ttsResponse.ok) {
          const errorText = await ttsResponse.text();
          console.error('[elevenlabs-agent-config] ElevenLabs API error:', ttsResponse.status, errorText);
          throw new Error(`ElevenLabs API error: ${ttsResponse.status} - ${errorText}`);
        }

        const ttsData = await ttsResponse.json();
        console.log('[elevenlabs-agent-config] Successfully updated TTS settings');
        
        return new Response(
          JSON.stringify({ success: true, data: ttsData }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'update_asr': {
        console.log(`[elevenlabs-agent-config] Updating ASR settings for agent ${targetAgentId}`);
        
        if (!asrSettings) {
          return new Response(
            JSON.stringify({ error: 'ASR settings required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const asrBody = {
          conversation_config: {
            stt: asrSettings
          }
        };
        
        const asrResponse = await fetch(agentUrl, {
          method: 'PATCH',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(asrBody),
        });

        if (!asrResponse.ok) {
          const errorText = await asrResponse.text();
          console.error('[elevenlabs-agent-config] ElevenLabs API error:', asrResponse.status, errorText);
          throw new Error(`ElevenLabs API error: ${asrResponse.status} - ${errorText}`);
        }

        const asrData = await asrResponse.json();
        console.log('[elevenlabs-agent-config] Successfully updated ASR settings');
        
        return new Response(
          JSON.stringify({ success: true, data: asrData }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'update_turn': {
        console.log(`[elevenlabs-agent-config] Updating turn settings for agent ${targetAgentId}`);
        
        if (!turnSettings) {
          return new Response(
            JSON.stringify({ error: 'Turn settings required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const turnBody = {
          conversation_config: {
            turn: turnSettings
          }
        };
        
        const turnResponse = await fetch(agentUrl, {
          method: 'PATCH',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(turnBody),
        });

        if (!turnResponse.ok) {
          const errorText = await turnResponse.text();
          console.error('[elevenlabs-agent-config] ElevenLabs API error:', turnResponse.status, errorText);
          throw new Error(`ElevenLabs API error: ${turnResponse.status} - ${errorText}`);
        }

        const turnData = await turnResponse.json();
        console.log('[elevenlabs-agent-config] Successfully updated turn settings');
        
        return new Response(
          JSON.stringify({ success: true, data: turnData }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'update_conversation': {
        console.log(`[elevenlabs-agent-config] Updating conversation settings for agent ${targetAgentId}`);
        
        if (!conversationSettings) {
          return new Response(
            JSON.stringify({ error: 'Conversation settings required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const convBody = {
          conversation_config: {
            conversation: conversationSettings
          }
        };
        
        const convResponse = await fetch(agentUrl, {
          method: 'PATCH',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(convBody),
        });

        if (!convResponse.ok) {
          const errorText = await convResponse.text();
          console.error('[elevenlabs-agent-config] ElevenLabs API error:', convResponse.status, errorText);
          throw new Error(`ElevenLabs API error: ${convResponse.status} - ${errorText}`);
        }

        const convData = await convResponse.json();
        console.log('[elevenlabs-agent-config] Successfully updated conversation settings');
        
        return new Response(
          JSON.stringify({ success: true, data: convData }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'update_agent_advanced': {
        console.log(`[elevenlabs-agent-config] Updating advanced agent settings for agent ${targetAgentId}`);
        
        if (!agentAdvancedSettings) {
          return new Response(
            JSON.stringify({ error: 'Agent advanced settings required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const advancedBody = {
          conversation_config: {
            agent: agentAdvancedSettings
          }
        };
        
        const advancedResponse = await fetch(agentUrl, {
          method: 'PATCH',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(advancedBody),
        });

        if (!advancedResponse.ok) {
          const errorText = await advancedResponse.text();
          console.error('[elevenlabs-agent-config] ElevenLabs API error:', advancedResponse.status, errorText);
          throw new Error(`ElevenLabs API error: ${advancedResponse.status} - ${errorText}`);
        }

        const advancedData = await advancedResponse.json();
        console.log('[elevenlabs-agent-config] Successfully updated advanced agent settings');
        
        return new Response(
          JSON.stringify({ success: true, data: advancedData }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'update_platform_settings': {
        console.log(`[elevenlabs-agent-config] Updating platform settings for agent ${targetAgentId}`);
        
        if (!platformSettings) {
          return new Response(
            JSON.stringify({ error: 'Platform settings required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const platformBody = {
          platform_settings: platformSettings
        };
        
        const platformResponse = await fetch(agentUrl, {
          method: 'PATCH',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(platformBody),
        });

        if (!platformResponse.ok) {
          const errorText = await platformResponse.text();
          console.error('[elevenlabs-agent-config] ElevenLabs API error:', platformResponse.status, errorText);
          throw new Error(`ElevenLabs API error: ${platformResponse.status} - ${errorText}`);
        }

        const platformData = await platformResponse.json();
        console.log('[elevenlabs-agent-config] Successfully updated platform settings');
        
        return new Response(
          JSON.stringify({ success: true, data: platformData }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'update_tools': {
        console.log(`[elevenlabs-agent-config] Updating tools for agent ${targetAgentId}`);
        
        if (!tools) {
          return new Response(
            JSON.stringify({ error: 'Tools configuration required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const toolsBody = {
          conversation_config: {
            agent: {
              tools: tools
            }
          }
        };
        
        const toolsResponse = await fetch(agentUrl, {
          method: 'PATCH',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(toolsBody),
        });

        if (!toolsResponse.ok) {
          const errorText = await toolsResponse.text();
          console.error('[elevenlabs-agent-config] ElevenLabs API error:', toolsResponse.status, errorText);
          throw new Error(`ElevenLabs API error: ${toolsResponse.status} - ${errorText}`);
        }

        const toolsData = await toolsResponse.json();
        console.log('[elevenlabs-agent-config] Successfully updated tools');
        
        return new Response(
          JSON.stringify({ success: true, data: toolsData }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'update_webhooks': {
        console.log(`[elevenlabs-agent-config] Updating webhooks for agent ${targetAgentId}`);
        
        if (!webhookConfig) {
          return new Response(
            JSON.stringify({ error: 'Webhook configuration required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const webhookBody = {
          platform_settings: {
            webhooks: webhookConfig
          }
        };
        
        const webhookResponse = await fetch(agentUrl, {
          method: 'PATCH',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(webhookBody),
        });

        if (!webhookResponse.ok) {
          const errorText = await webhookResponse.text();
          console.error('[elevenlabs-agent-config] ElevenLabs API error:', webhookResponse.status, errorText);
          throw new Error(`ElevenLabs API error: ${webhookResponse.status} - ${errorText}`);
        }

        const webhookData = await webhookResponse.json();
        console.log('[elevenlabs-agent-config] Successfully updated webhooks');
        
        return new Response(
          JSON.stringify({ success: true, data: webhookData }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'update_llm': {
        console.log(`[elevenlabs-agent-config] Updating LLM settings for agent ${targetAgentId}`);
        
        if (!llmSettings) {
          return new Response(
            JSON.stringify({ error: 'LLM settings required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const llmBody: any = {
          conversation_config: {
            agent: {
              prompt: {
                llm: llmSettings
              }
            }
          }
        };
        
        const llmResponse = await fetch(agentUrl, {
          method: 'PATCH',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(llmBody),
        });

        if (!llmResponse.ok) {
          const errorText = await llmResponse.text();
          console.error('[elevenlabs-agent-config] ElevenLabs API error:', llmResponse.status, errorText);
          throw new Error(`ElevenLabs API error: ${llmResponse.status} - ${errorText}`);
        }

        const llmData = await llmResponse.json();
        console.log('[elevenlabs-agent-config] Successfully updated LLM settings');
        
        return new Response(
          JSON.stringify({ success: true, data: llmData }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'update_first_message': {
        console.log(`[elevenlabs-agent-config] Updating first message for agent ${targetAgentId}`);
        
        if (!firstMessage) {
          return new Response(
            JSON.stringify({ error: 'First message required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const fmBody: any = {
          conversation_config: {
            agent: {
              first_message: firstMessage
            }
          }
        };
        
        const fmResponse = await fetch(agentUrl, {
          method: 'PATCH',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(fmBody),
        });

        if (!fmResponse.ok) {
          const errorText = await fmResponse.text();
          console.error('[elevenlabs-agent-config] ElevenLabs API error:', fmResponse.status, errorText);
          throw new Error(`ElevenLabs API error: ${fmResponse.status} - ${errorText}`);
        }

        const fmData = await fmResponse.json();
        console.log('[elevenlabs-agent-config] Successfully updated first message');
        
        return new Response(
          JSON.stringify({ success: true, data: fmData }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'update_full': {
        console.log(`[elevenlabs-agent-config] Full update for agent ${targetAgentId}`);
        
        if (!fullConfig) {
          return new Response(
            JSON.stringify({ error: 'Full config required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const fullResponse = await fetch(agentUrl, {
          method: 'PATCH',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(fullConfig),
        });

        if (!fullResponse.ok) {
          const errorText = await fullResponse.text();
          console.error('[elevenlabs-agent-config] ElevenLabs API error:', fullResponse.status, errorText);
          throw new Error(`ElevenLabs API error: ${fullResponse.status} - ${errorText}`);
        }

        const fullData = await fullResponse.json();
        console.log('[elevenlabs-agent-config] Successfully performed full update');
        
        return new Response(
          JSON.stringify({ success: true, data: fullData }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'create_agent': {
        console.log('[elevenlabs-agent-config] Creating new agent on ElevenLabs');
        
        const { 
          name: agentName, 
          systemPrompt, 
          firstMessage: agentFirstMessage,
          voiceId,
          language,
          ttsSettings: createTtsSettings,
          asrSettings: createAsrSettings,
          turnSettings: createTurnSettings,
          conversationSettings: createConversationSettings,
          llmSettings: createLlmSettings,
          platformSettings: createPlatformSettings
        } = await req.json().catch(() => ({}));

        // ElevenLabs ConvAI validation: English agents must use turbo/flash v2.
        // We defensively normalize model_id to avoid 400s when a caller passes
        // a newer/unsupported model id (e.g. eleven_turbo_v2_5).
        const normalizedLanguage = (language || 'en').toLowerCase();
        const requestedTtsModelId = createTtsSettings?.model_id;
        const normalizeTtsModelId = (lang: string, modelId?: string) => {
          if (!modelId) return undefined;
          const isEnglish = lang === 'en' || lang.startsWith('en-');
          if (!isEnglish) return modelId;

          const allowed = new Set(['eleven_turbo_v2', 'eleven_flash_v2']);
          return allowed.has(modelId) ? modelId : 'eleven_turbo_v2';
        };
        const safeTtsModelId =
          normalizeTtsModelId(normalizedLanguage, requestedTtsModelId) ||
          (normalizedLanguage === 'en' || normalizedLanguage.startsWith('en-')
            ? 'eleven_turbo_v2'
            : 'eleven_turbo_v2_5');
        
        // Build the agent creation payload
        const createPayload: any = {
          conversation_config: {
            agent: {
              prompt: {
                prompt: systemPrompt || 'You are a helpful assistant.',
              },
              first_message: agentFirstMessage || 'Hello! How can I help you today?',
              language: language || 'en',
            },
            tts: {
              voice_id: voiceId || 'EXAVITQu4vr4xnSDxMaL', // Default to Sarah
              model_id: safeTtsModelId,
              stability: createTtsSettings?.stability ?? 0.5,
              similarity_boost: createTtsSettings?.similarity_boost ?? 0.75,
              ...(createTtsSettings?.style !== undefined && { style: createTtsSettings.style }),
              ...(createTtsSettings?.speed !== undefined && { speed: createTtsSettings.speed }),
            },
          },
        };
        
        // Add optional name, prefixed with the organization name so the
        // agent is easily identifiable on the ElevenLabs side when multiple
        // workspaces share the same ElevenLabs API key.
        let orgPrefix = '';
        let orgName = '';
        if (organizationId) {
          const { data: orgRow } = await supabaseService
            .from('organizations')
            .select('name')
            .eq('id', organizationId)
            .maybeSingle();
          if (orgRow?.name) {
            orgName = orgRow.name;
            orgPrefix = `[${orgRow.name}] `;
          }
        }
        if (agentName) {
          createPayload.name = `${orgPrefix}${agentName}`;
        } else if (orgPrefix) {
          createPayload.name = `${orgPrefix}Agent`;
        }

        // Tag metadata + tags so the agent is always identifiable by org
        // both in the ElevenLabs dashboard and in webhook payloads.
        if (organizationId) {
          createPayload.tags = Array.from(new Set([
            ...(Array.isArray(createPayload.tags) ? createPayload.tags : []),
            `org:${organizationId}`,
            ...(orgName ? [`org_name:${orgName}`] : []),
          ]));
          createPayload.metadata = {
            ...(createPayload.metadata || {}),
            organization_id: organizationId,
            organization_name: orgName || undefined,
            created_via: 'ava-statistic',
          };
        }
        
        
        // Add ASR settings if provided
        if (createAsrSettings) {
          createPayload.conversation_config.stt = {
            ...(createAsrSettings.provider && { provider: createAsrSettings.provider }),
            ...(createAsrSettings.quality && { quality: createAsrSettings.quality }),
            ...(createAsrSettings.keywords && { keywords: createAsrSettings.keywords }),
          };
        }
        
        // Add turn settings if provided
        if (createTurnSettings) {
          createPayload.conversation_config.turn = {
            ...(createTurnSettings.turn_timeout !== undefined && { turn_timeout: createTurnSettings.turn_timeout }),
            ...(createTurnSettings.silence_end_call_timeout !== undefined && { silence_end_call_timeout: createTurnSettings.silence_end_call_timeout }),
            ...(createTurnSettings.turn_eagerness && { mode: createTurnSettings.turn_eagerness }),
          };
        }
        
        // Add conversation settings if provided
        if (createConversationSettings) {
          createPayload.conversation_config.conversation = {
            ...(createConversationSettings.max_duration_seconds !== undefined && { max_duration_seconds: createConversationSettings.max_duration_seconds }),
          };
        }
        
        // Add LLM settings if provided
        if (createLlmSettings) {
          createPayload.conversation_config.agent.prompt.llm = {
            ...(createLlmSettings.model && { model: createLlmSettings.model }),
            ...(createLlmSettings.temperature !== undefined && { temperature: createLlmSettings.temperature }),
            ...(createLlmSettings.max_tokens !== undefined && { max_tokens: createLlmSettings.max_tokens }),
          };
        }
        
        // Add platform settings if provided
        if (createPlatformSettings) {
          createPayload.platform_settings = createPlatformSettings;
        }
        
        console.log('[elevenlabs-agent-config] Create payload:', JSON.stringify(createPayload, null, 2));
        
        const createResponse = await fetch(`${ELEVENLABS_BASE_URL}/convai/agents/create`, {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(createPayload),
        });

        if (!createResponse.ok) {
          const errorText = await createResponse.text();
          console.error('[elevenlabs-agent-config] ElevenLabs API error:', createResponse.status, errorText);
          throw new Error(`ElevenLabs API error: ${createResponse.status} - ${errorText}`);
        }

        const createdAgent = await createResponse.json();
        console.log('[elevenlabs-agent-config] Successfully created agent:', createdAgent.agent_id);

        // Audit log (best-effort, never blocks the response)
        if (organizationId) {
          try {
            await supabaseService.from('audit_logs').insert({
              organization_id: organizationId,
              action: 'create',
              resource_type: 'agents',
              metadata: {
                platform: 'elevenlabs',
                platform_agent_id: createdAgent.agent_id,
                name: createPayload.name,
                org_tag: `org:${organizationId}`,
              },
            });
          } catch (e) {
            console.warn('[elevenlabs-agent-config] audit log insert failed', e);
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            agent_id: createdAgent.agent_id,
            agent: createdAgent,
            organization_tag: organizationId ? `org:${organizationId}` : null,
            organization_name: orgName || null,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }




      default:
        throw new Error(`Action non supportée: ${action}`);
    }

  } catch (error) {
    console.error('[elevenlabs-agent-config] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        requiresSetup: true,
        message: 'Erreur lors de la configuration de l\'agent' 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
