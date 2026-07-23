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
    const { agentId, timeframe = '7days', includeRealtime = false, includeCharts = true, apiKey: providedApiKey, organizationId } = await req.json();
    
    let apiKey = providedApiKey;
    let targetAgentId = agentId;
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);
    
    console.log(`[analytics] agentId: ${agentId}, organizationId: ${organizationId}, timeframe: ${timeframe}, hasApiKey: ${!!apiKey}`);

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
        console.log(`[analytics] Looking up API key via organizationId: ${organizationId}`);
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
          console.log(`[analytics] Got API key from organization_integrations via organizationId`);
        }
      }
      
      // Strategy 2: Try agentId to find agent's organization
      if (!apiKey && agentId) {
        console.log(`[analytics] Looking up API key via agentId: ${agentId}`);
        const { data: agent } = await supabaseService
          .from('agents')
          .select('platform_agent_id, platform_api_key, organization_id, config')
          .or(`id.eq.${agentId},platform_agent_id.eq.${agentId}`)
          .maybeSingle();
        
        if (agent) {
          targetAgentId = agent.platform_agent_id || agentId;
          
          if (agent.platform_api_key) {
            apiKey = agent.platform_api_key;
            console.log(`[analytics] Got API key from agent.platform_api_key`);
          } else if ((agent.config as any)?.api_key) {
            apiKey = (agent.config as any).api_key;
            console.log(`[analytics] Got API key from agent.config.api_key`);
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
              console.log(`[analytics] Got API key from organization_integrations via agent's org`);
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
              console.log(`[analytics] Got API key from user's integration`);
            }
          }
        }
      }
    }

    if (!apiKey) {
      console.log('[analytics] No API key found after all strategies');
      return new Response(
        JSON.stringify({ 
          requiresSetup: true, 
          message: 'Configuration ElevenLabs requise',
          metrics: {
            total_conversations: 0,
            successful_conversations: 0,
            failed_conversations: 0,
            avg_duration: 0,
            total_duration: 0,
            avg_satisfaction: 0,
            today_conversations: 0,
            success_rate: 0,
          },
          trends: {},
          charts: includeCharts ? {
            conversations_over_time: [],
            satisfaction_trend: [],
            peak_hours: [],
          } : undefined,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!targetAgentId) {
      console.log('[analytics] No agent ID available');
      return new Response(
        JSON.stringify({ 
          requiresSetup: true, 
          message: 'Agent ID requis',
          metrics: {
            total_conversations: 0,
            successful_conversations: 0,
            failed_conversations: 0,
            avg_duration: 0,
            total_duration: 0,
            avg_satisfaction: 0,
            today_conversations: 0,
            success_rate: 0,
          },
          trends: {},
          charts: includeCharts ? {
            conversations_over_time: [],
            satisfaction_trend: [],
            peak_hours: [],
          } : undefined,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate start date based on timeframe
    const now = new Date();
    let startDate: Date;
    switch (timeframe) {
      case '24hours':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7days':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30days':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90days':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
        startDate = new Date(0); // Beginning of time
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    console.log(`[analytics] Fetching conversations for agent ${targetAgentId} since ${startDate.toISOString()}`);
    
    // Paginate through ALL conversations using cursor
    const allConversations: any[] = [];
    let cursor: string | undefined;
    let hasMore = true;
    const maxPages = 100; // Safety limit
    let pageCount = 0;

    while (hasMore && pageCount < maxPages) {
      let url = `https://api.elevenlabs.io/v1/convai/conversations?agent_id=${targetAgentId}&page_size=100`;
      if (cursor) {
        url += `&cursor=${cursor}`;
      }

      console.log(`[analytics] Fetching page ${pageCount + 1}, cursor: ${cursor || 'none'}`);

      const conversationsResponse = await fetch(url, {
        method: 'GET',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
      });

      if (!conversationsResponse.ok) {
        const errorText = await conversationsResponse.text();
        console.error('ElevenLabs API error:', conversationsResponse.status, errorText);
        
        if (conversationsResponse.status === 401) {
          return new Response(
            JSON.stringify({ 
              requiresSetup: true, 
              message: 'API Key invalide. Veuillez vérifier votre configuration.' 
            }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        if (conversationsResponse.status === 404) {
          console.log('No conversations found, returning empty analytics');
          break;
        }
        
        throw new Error(`ElevenLabs API error: ${conversationsResponse.status} - ${errorText}`);
      }

      const data = await conversationsResponse.json();
      const pageConversations = data.conversations || [];
      
      console.log(`[analytics] Page ${pageCount + 1} returned ${pageConversations.length} conversations`);
      
      if (pageConversations.length === 0) {
        hasMore = false;
        break;
      }

      // Filter by timeframe and add to collection
      let reachedOldData = false;
      for (const conv of pageConversations) {
        const convDate = new Date(conv.start_time_unix_secs ? conv.start_time_unix_secs * 1000 : conv.created_at);
        
        if (convDate >= startDate) {
          allConversations.push(conv);
        } else {
          // Conversation is older than our timeframe, stop paginating
          reachedOldData = true;
        }
      }

      // Check if we should continue
      if (reachedOldData && timeframe !== 'all') {
        console.log(`[analytics] Reached data older than timeframe, stopping pagination`);
        hasMore = false;
      } else if (data.has_more && data.next_cursor) {
        cursor = data.next_cursor;
        pageCount++;
      } else {
        hasMore = false;
      }
    }
    
    console.log(`[analytics] Total conversations fetched: ${allConversations.length} across ${pageCount + 1} pages`);

    // Calculate analytics from conversations
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    let totalDuration = 0;
    let todayConversations = 0;
    let successfulConversations = 0;
    let failedConversations = 0;
    const dailyStats: Record<string, number> = {};
    const hourlyStats: Record<number, number> = {};
    
    for (const conv of allConversations) {
      // Calculate duration
      const duration = conv.call_duration_secs || conv.duration || 0;
      totalDuration += duration;
      
      // Check if today
      const convDate = new Date(conv.start_time_unix_secs ? conv.start_time_unix_secs * 1000 : conv.created_at);
      if (convDate >= todayStart) {
        todayConversations++;
      }
      
      // Count success/failure
      if (conv.status === 'done' || conv.status === 'completed') {
        successfulConversations++;
      } else if (conv.status === 'failed' || conv.status === 'error') {
        failedConversations++;
      } else {
        successfulConversations++;
      }
      
      // Daily stats for charts
      const dateKey = convDate.toISOString().split('T')[0];
      dailyStats[dateKey] = (dailyStats[dateKey] || 0) + 1;
      
      // Peak hours
      const hour = convDate.getHours();
      hourlyStats[hour] = (hourlyStats[hour] || 0) + 1;
    }
    
    const totalConversations = allConversations.length;
    const avgDuration = totalConversations > 0 ? Math.round(totalDuration / totalConversations) : 0;
    const successRate = totalConversations > 0 ? Math.round((successfulConversations / totalConversations) * 100) : 0;
    
    // Build charts data - return all days for the timeframe
    const sortedDailyStats = Object.entries(dailyStats)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // For "all time", aggregate by week/month if too many points
    let conversationsOverTime = sortedDailyStats;
    if (timeframe === 'all' && sortedDailyStats.length > 90) {
      // Aggregate by month
      const monthlyStats: Record<string, number> = {};
      for (const { date, count } of sortedDailyStats) {
        const monthKey = date.substring(0, 7); // YYYY-MM
        monthlyStats[monthKey] = (monthlyStats[monthKey] || 0) + count;
      }
      conversationsOverTime = Object.entries(monthlyStats)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));
    } else if (sortedDailyStats.length > 30) {
      // Aggregate by week
      const weeklyStats: Record<string, number> = {};
      for (const { date, count } of sortedDailyStats) {
        const d = new Date(date);
        const weekStart = new Date(d.setDate(d.getDate() - d.getDay()));
        const weekKey = weekStart.toISOString().split('T')[0];
        weeklyStats[weekKey] = (weeklyStats[weekKey] || 0) + count;
      }
      conversationsOverTime = Object.entries(weeklyStats)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));
    }
    
    // Build full hourly distribution (0-23)
    const peakHours: { hour: number; count: number }[] = [];
    for (let h = 0; h < 24; h++) {
      peakHours.push({ hour: h, count: hourlyStats[h] || 0 });
    }

    const normalizedData = {
      metrics: {
        total_conversations: totalConversations,
        successful_conversations: successfulConversations,
        failed_conversations: failedConversations,
        avg_duration: avgDuration,
        total_duration: totalDuration,
        avg_satisfaction: 0,
        today_conversations: todayConversations,
        success_rate: successRate,
      },
      trends: {
        conversations: {
          direction: 'neutral' as const,
          value: undefined,
        },
        duration: {
          direction: 'neutral' as const,
          value: undefined,
        },
        satisfaction: {
          direction: 'neutral' as const,
          value: undefined,
        },
      },
      realtime: includeRealtime ? {
        active_conversations: 0,
        queue_size: 0,
        system_status: 'operational',
      } : undefined,
      charts: includeCharts ? {
        conversations_over_time: conversationsOverTime,
        satisfaction_trend: [],
        peak_hours: peakHours,
      } : undefined,
      data_range: {
        start: startDate.toISOString(),
        end: now.toISOString(),
        timeframe,
      },
      source: 'elevenlabs',
    };

    return new Response(
      JSON.stringify(normalizedData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Analytics error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        requiresSetup: false,
        message: 'Erreur lors de la récupération des analytics. Veuillez réessayer.' 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
