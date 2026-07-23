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
    const {
      action = 'sync',
      agentId,
      limit = 100,
      analyzeConversations = true,
      mode = 'recent',
      language = 'fr',
      organizationId,
      cursor: startCursor,
    } = await req.json();

    // mode can be 'recent' (default) or 'all' for full historical sync
    // When mode='all', this function is intentionally chunked to avoid timeouts.

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    const supabase = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
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

    // Fetch organization-level ElevenLabs API key from organization_integrations
    const { data: orgIntegration } = await supabaseAdmin
      .from('organization_integrations')
      .select('api_key')
      .eq('organization_id', orgId)
      .eq('platform', 'elevenlabs')
      .eq('is_active', true)
      .maybeSingle();

    const orgApiKey = orgIntegration?.api_key;
    console.log(`[sync] Organization has ElevenLabs integration: ${!!orgApiKey}`);

    let agentsQuery = supabase
      .from('agents')
      .select('id, name, platform_agent_id, platform_api_key')
      .eq('organization_id', orgId)
      .eq('platform', 'elevenlabs');
    
    if (agentId) {
      agentsQuery = agentsQuery.eq('id', agentId);
    }

    const { data: agents, error: agentsError } = await agentsQuery;

    if (agentsError || !agents || agents.length === 0) {
      return new Response(
        JSON.stringify({ 
          error: 'No ElevenLabs agents found',
          synced: 0,
          created: 0,
          updated: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let totalSynced = 0;
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalAnalyzed = 0;
    const syncErrors: string[] = [];

    // Paging is only supported for single-agent sync (agentId provided)
    let nextCursor: string | null = null;
    let hasMore = false;

    for (const agent of agents) {
      // Use agent's API key if available, otherwise fallback to organization integration
      const apiKey = agent.platform_api_key || orgApiKey;
      
      if (!agent.platform_agent_id) {
        console.log(`[sync] Skipping agent ${agent.name} - missing platform_agent_id`);
        syncErrors.push(`Agent ${agent.name}: missing platform_agent_id`);
        continue;
      }

      if (!apiKey) {
        console.log(`[sync] Skipping agent ${agent.name} - no API key available (agent or org integration)`);
        syncErrors.push(`Agent ${agent.name}: no API key configured`);
        continue;
      }

      try {
        // Hard cap to keep requests fast/stable (caller can page using cursor)
        const totalLimit = Math.max(1, Math.min(Number(limit) || 100, 500));

        console.log(`[sync] Syncing conversations for agent ${agent.name} (mode: ${mode}, limit: ${totalLimit})`);

        let allConversations: any[] = [];
        let cursor: string | null = agentId && typeof startCursor === 'string' && startCursor.length > 0 ? startCursor : null;
        let pageCount = 0;
        const pageLimit = 100;

        // In 'recent' mode we only fetch a few pages.
        const maxPages = mode === 'all' ? 100 : 3;

        do {
          const remaining = totalLimit - allConversations.length;
          if (remaining <= 0) break;

          const url = new URL('https://api.elevenlabs.io/v1/convai/conversations');
          url.searchParams.set('agent_id', agent.platform_agent_id);
          url.searchParams.set('page_size', String(Math.min(pageLimit, remaining)));
          if (cursor) {
            url.searchParams.set('cursor', cursor);
          }

          console.log(`[sync] Fetching: ${url.toString()}`);

          const response = await fetch(url.toString(), {
            headers: {
              'xi-api-key': apiKey,
            },
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[sync] Error fetching conversations for ${agent.name}: ${response.status} - ${errorText}`);
            syncErrors.push(`Agent ${agent.name}: API error ${response.status}`);
            break;
          }

          const data = await response.json();
          const conversations = data.conversations || [];
          allConversations = allConversations.concat(conversations);

          cursor = data.next_cursor || null;
          pageCount++;

          console.log(`[sync] Page ${pageCount}: Got ${conversations.length} conversations, total so far: ${allConversations.length}`);

          // Stop if no more pages, reached maxPages, or reached our requested totalLimit
          if (!cursor || pageCount >= maxPages || allConversations.length >= totalLimit) {
            break;
          }

          // Also stop early in 'recent' mode once we reached caller limit
          if (mode !== 'all' && allConversations.length >= totalLimit) {
            break;
          }
        } while (cursor);

        const agentHasMore = mode === 'all' && !!cursor && allConversations.length >= totalLimit;
        if (agentId) {
          hasMore = agentHasMore;
          nextCursor = cursor;
        }
        console.log(`[sync] Found ${allConversations.length} conversations for ${agent.name} (hasMore: ${agentHasMore})`);



        for (const conv of allConversations) {
          // Check if conversation already exists using external_id
          const { data: existing } = await supabaseAdmin
            .from('conversations')
            .select('id, external_id, satisfaction_score, sentiment')
            .eq('external_id', conv.conversation_id)
            .eq('organization_id', orgId)
            .single();

          // Fetch detailed conversation data for transcript
          let detailedConv = conv;
          try {
            const detailResponse = await fetch(
              `https://api.elevenlabs.io/v1/convai/conversations/${conv.conversation_id}`,
              {
                headers: {
                  'xi-api-key': apiKey,
                },
              }
            );
            if (detailResponse.ok) {
              detailedConv = await detailResponse.json();
            }
          } catch (e) {
            console.log(`[sync] Could not fetch details for ${conv.conversation_id}`);
          }

          // Extract transcript from detailed response
          const transcript = detailedConv.transcript || [];
          const userMessages = transcript.filter((m: any) => m.role === 'user').map((m: any) => ({
            message: m.message,
            time_in_call_secs: m.time_in_call_secs
          }));
          const agentMessages = transcript.filter((m: any) => m.role === 'agent').map((m: any) => ({
            message: m.message,
            time_in_call_secs: m.time_in_call_secs
          }));

          // Extract analysis from ElevenLabs if available
          const elevenLabsAnalysis = detailedConv.analysis || conv.analysis || {};
          const sentiment = elevenLabsAnalysis.user_sentiment || elevenLabsAnalysis.sentiment || null;
          
          // Map rating (1-5) to satisfaction score (1-10)
          let satisfactionScore: number | null = null;
          if (conv.rating && typeof conv.rating === 'number') {
            satisfactionScore = conv.rating * 2; // 1-5 -> 2-10
          } else if (elevenLabsAnalysis.call_successful === true) {
            satisfactionScore = 8;
          } else if (elevenLabsAnalysis.call_successful === false) {
            satisfactionScore = 4;
          } else if (elevenLabsAnalysis.satisfaction_score) {
            satisfactionScore = elevenLabsAnalysis.satisfaction_score;
          }

          const normalizeConversationStatus = (raw: unknown): string => {
            const s = typeof raw === 'string' ? raw.toLowerCase() : '';
            // DB constraint doesn't accept ElevenLabs "done"; map to our canonical statuses.
            if (s === 'done' || s === 'completed' || s === 'complete') return 'completed';
            if (s === 'pending' || s === 'queued') return 'pending';
            if (s === 'active' || s === 'in_progress' || s === 'in-progress' || s === 'running') return 'active';
            // Default to completed to avoid constraint failures blocking sync.
            return 'completed';
          };

          const conversationData = {
            external_id: conv.conversation_id,
            title: `Conversation ${conv.conversation_id.substring(0, 8)}`,
            agent_id: agent.id,
            organization_id: orgId,
            user_id: user.id,
            platform: 'elevenlabs',
            status: normalizeConversationStatus(conv.status),
            duration: detailedConv.call_duration_secs || conv.call_duration_secs || conv.duration || 0,
            created_at: conv.start_time || conv.created_at || new Date().toISOString(),
            transcript: JSON.stringify(transcript),
            user_messages: userMessages,
            agent_messages: agentMessages,
            sentiment: sentiment,
            satisfaction_score: satisfactionScore,
            keywords: elevenLabsAnalysis.keywords || [],
            smart_tags: elevenLabsAnalysis.data_collection_results ? 
              Object.keys(elevenLabsAnalysis.data_collection_results) : [],
            metadata: {
              start_time: conv.start_time,
              end_time: conv.end_time || detailedConv.end_time,
              caller_id: conv.caller_id || detailedConv.caller_id,
              summary: elevenLabsAnalysis.summary || elevenLabsAnalysis.transcript_summary,
              platform_agent_id: agent.platform_agent_id,
              call_duration_secs: detailedConv.call_duration_secs || conv.call_duration_secs,
              call_successful: elevenLabsAnalysis.call_successful,
              data_collection: elevenLabsAnalysis.data_collection_results,
              transcript: transcript,
            }
          };

          if (existing) {
            // Only update if we have new analysis data
            const updateData = { ...conversationData };
            if (existing.satisfaction_score && !satisfactionScore) {
              delete (updateData as any).satisfaction_score;
            }
            if (existing.sentiment && !sentiment) {
              delete (updateData as any).sentiment;
            }

            const { error: updateError } = await supabaseAdmin
              .from('conversations')
              .update(updateData)
              .eq('id', existing.id);

            if (updateError) {
              console.error(`[sync] Error updating conversation ${conv.conversation_id}:`, updateError);
            } else {
              totalUpdated++;
            }
          } else {
            const { data: inserted, error: insertError } = await supabaseAdmin
              .from('conversations')
              .insert(conversationData)
              .select('id')
              .single();

            if (insertError) {
              console.error(`[sync] Error inserting conversation ${conv.conversation_id}:`, insertError);
            } else {
              totalCreated++;
              
              // Trigger AI analysis for new conversations without satisfaction score
              if (analyzeConversations && !satisfactionScore && inserted?.id && transcript.length > 0) {
                try {
                  const transcriptText = transcript.map((m: any) => `${m.role}: ${m.message}`).join('\n');
                  
                  const analysisResponse = await fetch(`${supabaseUrl}/functions/v1/analyze-conversation`, {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${supabaseServiceKey}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      conversationId: inserted.id,
                      transcript: transcriptText,
                      agentId: agent.id,
                      organizationId: orgId,
                      language,
                    }),
                  });
                  
                  if (analysisResponse.ok) {
                    const analysisResult = await analysisResponse.json();
                    totalAnalyzed++;
                    console.log(`[sync] Analysis triggered for conversation ${inserted.id}, satisfaction: ${analysisResult?.analysis?.satisfaction_score}`);
                    
                    // Update conversation with analysis results
                    if (analysisResult?.analysis?.satisfaction_score) {
                      await supabaseAdmin
                        .from('conversations')
                        .update({
                          satisfaction_score: analysisResult.analysis.satisfaction_score,
                          sentiment: analysisResult.analysis.sentiment,
                          smart_tags: analysisResult.analysis.smart_tags,
                        })
                        .eq('id', inserted.id);
                    }
                  }
                } catch (analysisError) {
                  console.log(`[sync] Could not trigger analysis for ${inserted.id}:`, analysisError);
                }
              }
            }
          }

          totalSynced++;
        }
      } catch (error) {
        console.error(`[sync] Error syncing agent ${agent.name}:`, error);
        syncErrors.push(`Agent ${agent.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    console.log(`[sync] Complete: synced=${totalSynced}, created=${totalCreated}, updated=${totalUpdated}, analyzed=${totalAnalyzed}`);

    return new Response(
      JSON.stringify({
        success: true,
        synced: totalSynced,
        created: totalCreated,
        updated: totalUpdated,
        analyzed: totalAnalyzed,
        errors: syncErrors,
        hasMore,
        nextCursor,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[sync] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        synced: 0,
        created: 0,
        updated: 0
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
