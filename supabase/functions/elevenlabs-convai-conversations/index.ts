import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { agentId, conversationId, page = 1, limit = 50, filters, format = 'mp3', apiKey: providedApiKey, organizationId } = body;
    // Default action to 'list' if not provided for backward compatibility
    const action = body.action || 'list';
    
    let apiKey = providedApiKey;
    let targetAgentId = agentId;
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    
    // Create service client for fallback queries
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);
    
    console.log(`[conversations] Action: ${action}, agentId: ${agentId}, organizationId: ${organizationId}, hasApiKey: ${!!apiKey}`);

    // SECURITY: require a valid user JWT before any service-role lookup.
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
        console.log(`[conversations] Looking up API key via organizationId: ${organizationId}`);
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
          console.log(`[conversations] Got API key from organization_integrations via organizationId`);
        }
      }
      
      // Strategy 2: Try agentId to find agent's organization
      if (!apiKey && agentId) {
        console.log(`[conversations] Looking up API key via agentId: ${agentId}`);
        const { data: agent } = await supabaseService
          .from('agents')
          .select('platform_agent_id, platform_api_key, organization_id, config')
          .or(`id.eq.${agentId},platform_agent_id.eq.${agentId}`)
          .maybeSingle();
        
        if (agent) {
          targetAgentId = agent.platform_agent_id || agentId;
          
          if (agent.platform_api_key) {
            apiKey = agent.platform_api_key;
            console.log(`[conversations] Got API key from agent.platform_api_key`);
          } else if ((agent.config as any)?.api_key) {
            apiKey = (agent.config as any).api_key;
            console.log(`[conversations] Got API key from agent.config.api_key`);
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
              console.log(`[conversations] Got API key from organization_integrations via agent's org`);
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
              console.log(`[conversations] Got API key from user's integration`);
            }
          }
        }
      }
    }

    if (!apiKey) {
      console.log('[conversations] No API key found after all strategies');
      return new Response(
        JSON.stringify({ 
          requiresSetup: true, 
          message: 'Configuration ElevenLabs requise',
          conversations: [],
          total: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    switch (action) {
      case 'list': {
        console.log(`Fetching conversations for agent ${targetAgentId}, page ${page}, limit ${limit}`);

        // ElevenLabs API uses cursor-based pagination.
        // We keep page/limit for backwards compatibility, but only the first page is guaranteed
        // unless the caller provides a cursor.
        const cursor = (filters as any)?.cursor ?? undefined;
        const qs = new URLSearchParams();
        if (targetAgentId) qs.set('agent_id', targetAgentId);
        if (cursor) qs.set('cursor', String(cursor));

        const conversationsResponse = await fetch(
          `https://api.elevenlabs.io/v1/convai/conversations?${qs.toString()}`,
          {
            headers: {
              'xi-api-key': apiKey,
            },
          }
        );

        if (!conversationsResponse.ok) {
          const errorText = await conversationsResponse.text();
          console.error('ElevenLabs API error:', conversationsResponse.status, errorText);
          throw new Error(`ElevenLabs API error: ${conversationsResponse.status}`);
        }

        const conversationsData = await conversationsResponse.json();
        const rawConversations = conversationsData.conversations || [];

        // Batch-fetch details for the first 30 conversations to get caller_number
        const convsToEnrich = rawConversations.slice(0, 30);
        const detailResults = await Promise.allSettled(
          convsToEnrich.map(async (conv: any) => {
            try {
              const detailRes = await fetch(
                `https://api.elevenlabs.io/v1/convai/conversations/${conv.conversation_id}`,
                { headers: { 'xi-api-key': apiKey, 'accept': 'application/json' } }
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

        // Build caller map
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

        // Enrich conversations with caller_number
        const enrichedConversations = rawConversations.map((conv: any) => ({
          ...conv,
          caller_number: conv.caller_id || conv.metadata?.caller_id || conv.metadata?.caller_number || conv.metadata?.phone_number || conv.user_id || callerMap.get(conv.conversation_id) || undefined,
        }));

        return new Response(
          JSON.stringify({
            conversations: enrichedConversations,
            total: enrichedConversations.length,
            has_more: !!conversationsData.has_more,
            next_cursor: conversationsData.next_cursor ?? null,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'details': {
        console.log(`[conversations] Fetching details for conversation ${conversationId}`);
        
        const detailsResponse = await fetch(
          `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`,
          {
            headers: {
              'xi-api-key': apiKey,
            },
          }
        );

        if (!detailsResponse.ok) {
          const errorText = await detailsResponse.text();
          console.error('[conversations] ElevenLabs API error:', detailsResponse.status, errorText);
          throw new Error(`ElevenLabs API error: ${detailsResponse.status} - ${errorText}`);
        }

        const detailsData = await detailsResponse.json();
        console.log(`[conversations] Got details for ${conversationId}, transcript type: ${typeof detailsData.transcript}, isArray: ${Array.isArray(detailsData.transcript)}`);
        
        // Log analysis availability for debugging
        console.log(`[conversations] Analysis available:`, {
          hasSentiment: !!detailsData.analysis?.sentiment,
          hasSatisfaction: detailsData.analysis?.satisfaction_score !== undefined,
          hasSummary: !!detailsData.analysis?.summary,
          hasDataCollection: !!detailsData.analysis?.data_collection_results,
          hasEvaluation: !!detailsData.analysis?.evaluation_criteria_results,
          analysisKeys: detailsData.analysis ? Object.keys(detailsData.analysis) : [],
        });
        
        // Normalize transcript to always be an array
        let normalizedTranscript: Array<{ role: string; message: string; time_in_call_secs?: number }> = [];
        if (Array.isArray(detailsData.transcript)) {
          normalizedTranscript = detailsData.transcript;
        } else if (typeof detailsData.transcript === 'string' && detailsData.transcript.trim()) {
          // If transcript is a string, wrap it as a single agent message
          normalizedTranscript = [{ role: 'agent', message: detailsData.transcript }];
        }
        
        return new Response(
          JSON.stringify({
            ...detailsData,
            transcript: normalizedTranscript,
            transcript_raw: detailsData.transcript,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'audio': {
        console.log(`[conversations] Fetching audio for conversation ${conversationId}, format: ${format}`);
        
        try {
          const audioResponse = await fetch(
            `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}/audio?format=${format}`,
            {
              headers: {
                'xi-api-key': apiKey,
              },
            }
          );
  
          const contentType = audioResponse.headers.get('content-type') || '';
          console.log(`[conversations] Audio response status: ${audioResponse.status}, content-type: ${contentType}`);
  
          if (!audioResponse.ok) {
            const errorText = await audioResponse.text();
            console.error('[conversations] Audio API error:', audioResponse.status, errorText);
            
            return new Response(
              JSON.stringify({ 
                error: 'Audio not available',
                audio_unavailable: true,
                reason: audioResponse.status === 404 ? 'not_found' : 'api_error',
                details: errorText.substring(0, 200)
              }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
  
          // Get audio as ArrayBuffer
          const audioBuffer = await audioResponse.arrayBuffer();
          const uint8Array = new Uint8Array(audioBuffer);
          
          console.log(`[conversations] Audio buffer size: ${uint8Array.length} bytes`);
          
          // Check for empty or too small audio
          if (uint8Array.length < 100) {
            console.error('[conversations] Audio buffer too small, likely empty');
            return new Response(
              JSON.stringify({ 
                error: 'Audio content is empty',
                audio_unavailable: true,
                reason: 'empty_audio',
                size: uint8Array.length
              }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          
          // Safe base64 encoding for large files using chunked approach
          const CHUNK_SIZE = 0x8000; // 32KB chunks
          const chunks: string[] = [];
          
          for (let i = 0; i < uint8Array.length; i += CHUNK_SIZE) {
            const chunk = uint8Array.subarray(i, Math.min(i + CHUNK_SIZE, uint8Array.length));
            chunks.push(String.fromCharCode.apply(null, Array.from(chunk)));
          }
          
          const binaryString = chunks.join('');
          const base64Audio = btoa(binaryString);
          
          console.log(`[conversations] Audio encoded successfully, base64 length: ${base64Audio.length}`);
          
          // Verify base64 is valid
          if (base64Audio.length < 100) {
            console.error('[conversations] Base64 encoding produced unexpected result');
            return new Response(
              JSON.stringify({ 
                error: 'Audio encoding failed',
                audio_unavailable: true,
                reason: 'encoding_error'
              }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          
          return new Response(
            JSON.stringify({ 
              audio_base64: base64Audio,
              audio_url: `data:audio/${format};base64,${base64Audio}`,
              format,
              size_bytes: uint8Array.length
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (audioError) {
          console.error('[conversations] Audio fetch/encode error:', audioError);
          return new Response(
            JSON.stringify({ 
              error: 'Audio processing failed',
              audio_unavailable: true,
              reason: 'processing_error',
              details: audioError instanceof Error ? audioError.message : 'Unknown error'
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      default:
        throw new Error('Action non supportée');
    }

  } catch (error) {
    console.error('Conversations error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        requiresSetup: true,
        message: 'Erreur lors de la récupération des conversations' 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
