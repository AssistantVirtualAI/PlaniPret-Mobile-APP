import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const resolveStartDate = (days: number | 'all' | string): Date | undefined => {
  if (days === 'all') return undefined;
  const numericDays = Number(days);
  if (!Number.isFinite(numericDays) || numericDays <= 0) return undefined;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - numericDays);
  return startDate;
};

const buildDefaultGlobalAdvice = (language: string, message?: string) => ({
  globalSummary: message || (language === 'en'
    ? 'No organization context is available yet. Select an organization to load AI advice.'
    : 'Aucun contexte d’organisation n’est disponible pour le moment. Sélectionnez une organisation pour charger les conseils IA.'),
  overallHealth: 'warning',
  keyInsights: [],
  globalStrengths: [],
  globalWeaknesses: [],
  priorityActions: [],
  agentRecommendations: {},
});

const buildEmptyAdviceResponse = ({
  days,
  language,
  organizationId = null,
  reason,
}: {
  days: number | 'all' | string;
  language: string;
  organizationId?: string | null;
  reason?: string;
}) => {
  const startDate = resolveStartDate(days);
  return new Response(
    JSON.stringify({
      success: true,
      organizationId,
      fallback: true,
      reason,
      period: { days, from: startDate?.toISOString() || null, to: new Date().toISOString() },
      globalMetrics: {
        totalConversations: 0,
        avgSatisfaction: 0,
        avgDuration: 0,
        sentiment: { positive: 0, neutral: 0, negative: 0 },
        agentCount: 0,
        bestAgent: null,
        worstAgent: null,
      },
      agentMetrics: [],
      globalAdvice: buildDefaultGlobalAdvice(language),
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
};

async function resolveOrganizationId(supabaseAdmin: any, userId: string, requestedOrganizationId?: string | null) {
  const requestedOrgId = typeof requestedOrganizationId === 'string' && requestedOrganizationId.trim().length > 0
    ? requestedOrganizationId.trim()
    : null;

  const [{ data: isSuper }, { data: isMaster }] = await Promise.all([
    supabaseAdmin.rpc('is_super_admin', { _user_id: userId }),
    supabaseAdmin.rpc('is_master_admin', { _user_id: userId }),
  ]);

  // Prefer the explicit frontend organization context. This prevents /dashboard
  // from accidentally using the first/default org when the user is switching
  // between AVA, Planipret, and Lemtel.
  if (requestedOrgId) {
    if (isSuper === true || isMaster === true) {
      return requestedOrgId;
    }

    const [modernMembership, legacyMembership] = await Promise.all([
      supabaseAdmin
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .eq('organization_id', requestedOrgId)
        .limit(1),
      supabaseAdmin
        .from('org_members')
        .select('org_id')
        .eq('user_id', userId)
        .eq('org_id', requestedOrgId)
        .limit(1),
    ]);

    if (modernMembership.data?.[0]?.organization_id || legacyMembership.data?.[0]?.org_id) {
      return requestedOrgId;
    }

    console.warn(`[global-advice] Ignoring unauthorized requested organization ${requestedOrgId} for user ${userId}`);
  }

  // Modern membership table first.
  const modernRes = await supabaseAdmin
    .from('organization_members')
    .select('organization_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1);
  if (modernRes.error) console.warn('[global-advice] organization_members lookup failed:', modernRes.error.message);
  if (modernRes.data?.[0]?.organization_id) return modernRes.data[0].organization_id;

  // Legacy org_members table for the newer standalone portals.
  const legacyRes = await supabaseAdmin
    .from('org_members')
    .select('org_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1);
  if (legacyRes.error) console.warn('[global-advice] org_members lookup failed:', legacyRes.error.message);
  if (legacyRes.data?.[0]?.org_id) return legacyRes.data[0].org_id;

  // If available, use the centralized org-access RPC. It includes master/super
  // admin access and avoids softphone-only org expansion.
  const accessibleRes = await supabaseAdmin.rpc('get_accessible_org_ids', { _user_id: userId });
  if (!accessibleRes.error && Array.isArray(accessibleRes.data) && accessibleRes.data.length > 0) {
    const firstAccessible = accessibleRes.data
      .map((row: any) => typeof row === 'string' ? row : row?.get_accessible_org_ids || row?.id || row?.org_id)
      .filter(Boolean)[0];
    if (firstAccessible) return firstAccessible;
  } else if (accessibleRes.error) {
    console.warn('[global-advice] get_accessible_org_ids lookup failed:', accessibleRes.error.message);
  }

  // Final super/master admin fallback: choose any active organization so the
  // function can still render a safe empty dashboard instead of crashing.
  if (isSuper === true || isMaster === true) {
    const { data: anyOrg, error: anyOrgError } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (anyOrgError) console.warn('[global-advice] active organization fallback failed:', anyOrgError.message);
    return anyOrg?.id ?? null;
  }

  return null;
}

// Bilingual prompt templates
const getSystemPrompt = (language: string) => {
  if (language === 'en') {
    return 'You are an expert in AI agent optimization. Respond only in valid JSON.';
  }
  return 'Tu es un expert en optimisation d\'agents IA. Réponds uniquement en JSON valide.';
};

const getGlobalAnalysisPrompt = (language: string, data: any) => {
  const periodLabel = data.days === 'all' 
    ? (language === 'en' ? 'All time' : 'Tout le temps') 
    : `${data.days} ${language === 'en' ? 'day(s)' : 'jour(s)'}`;

  if (language === 'en') {
    return `You are an expert in AI conversational agent optimization. Analyze this data from ALL agents and generate a consolidated report.

PERIOD: ${periodLabel}
NUMBER OF AGENTS: ${data.agentCount}

GLOBAL METRICS:
- Total conversations: ${data.totalConversations}
- Average satisfaction: ${data.avgSatisfaction.toFixed(1)}/10
- Average duration: ${Math.round(data.avgDuration)}s
- Global sentiment: ${data.positiveCount} positive, ${data.neutralCount} neutral, ${data.negativeCount} negative

PERFORMANCE BY AGENT:
${data.agentPerformance}

BEST AGENT: ${data.bestAgent?.agentName || 'N/A'} (${data.bestAgent?.avgSatisfaction?.toFixed(1) || 'N/A'}/10)
AGENT TO IMPROVE: ${data.worstAgent?.agentName || 'N/A'} (${data.worstAgent?.avgSatisfaction?.toFixed(1) || 'N/A'}/10)

Generate a JSON report with this exact structure:
{
  "globalSummary": "Global summary in 3-4 sentences about all agents performance",
  "overallHealth": "good|warning|critical",
  "keyInsights": ["Key insight 1", "Key insight 2", "Key insight 3"],
  "globalStrengths": ["Global strength 1", "Global strength 2"],
  "globalWeaknesses": ["Global weakness 1", "Global weakness 2"],
  "priorityActions": [
    {"action": "Priority action 1", "agent": "All or specific agent name", "impact": "high"},
    {"action": "Priority action 2", "agent": "All or specific agent name", "impact": "medium"}
  ],
  "agentRecommendations": {
    "${data.bestAgent?.agentName || 'agent1'}": "Specific advice for this agent",
    "${data.worstAgent?.agentName || 'agent2'}": "Specific advice for this agent"
  }
}`;
  }
  
  return `Tu es un expert en optimisation d'agents IA conversationnels. Analyse ces données de TOUS les agents et génère un rapport consolidé.

PÉRIODE: ${periodLabel}
NOMBRE D'AGENTS: ${data.agentCount}

MÉTRIQUES GLOBALES:
- Total conversations: ${data.totalConversations}
- Satisfaction moyenne: ${data.avgSatisfaction.toFixed(1)}/10
- Durée moyenne: ${Math.round(data.avgDuration)}s
- Sentiment global: ${data.positiveCount} positif, ${data.neutralCount} neutre, ${data.negativeCount} négatif

PERFORMANCE PAR AGENT:
${data.agentPerformance}

MEILLEUR AGENT: ${data.bestAgent?.agentName || 'N/A'} (${data.bestAgent?.avgSatisfaction?.toFixed(1) || 'N/A'}/10)
AGENT À AMÉLIORER: ${data.worstAgent?.agentName || 'N/A'} (${data.worstAgent?.avgSatisfaction?.toFixed(1) || 'N/A'}/10)

Génère un rapport JSON avec cette structure exacte:
{
  "globalSummary": "Résumé global en 3-4 phrases sur la performance de tous les agents",
  "overallHealth": "good|warning|critical",
  "keyInsights": ["Insight clé 1", "Insight clé 2", "Insight clé 3"],
  "globalStrengths": ["Force globale 1", "Force globale 2"],
  "globalWeaknesses": ["Faiblesse globale 1", "Faiblesse globale 2"],
  "priorityActions": [
    {"action": "Action prioritaire 1", "agent": "Tous ou nom agent spécifique", "impact": "high"},
    {"action": "Action prioritaire 2", "agent": "Tous ou nom agent spécifique", "impact": "medium"}
  ],
  "agentRecommendations": {
    "${data.bestAgent?.agentName || 'agent1'}": "Conseil spécifique pour cet agent",
    "${data.worstAgent?.agentName || 'agent2'}": "Conseil spécifique pour cet agent"
  }
}`;
};

// Fetch conversations from ElevenLabs API directly
async function fetchElevenLabsConversations(apiKey: string, platformAgentId: string, startDate?: Date, maxConversations = 500) {
  const allConversations: any[] = [];
  let cursor: string | null = null;
  let pageCount = 0;
  const maxPages = 10;

  do {
    const url = new URL('https://api.elevenlabs.io/v1/convai/conversations');
    url.searchParams.set('agent_id', platformAgentId);
    url.searchParams.set('page_size', '100');
    if (cursor) {
      url.searchParams.set('cursor', cursor);
    }
    if (startDate) {
      url.searchParams.set('call_start_after_unix', String(Math.floor(startDate.getTime() / 1000)));
    }

    const response = await fetch(url.toString(), {
      headers: { 'xi-api-key': apiKey },
    });

    if (!response.ok) {
      console.error(`[global-advice] ElevenLabs API error: ${response.status}`);
      break;
    }

    const data = await response.json();
    const conversations = data.conversations || [];
    allConversations.push(...conversations);

    cursor = data.next_cursor || null;
    pageCount++;

    if (!cursor || pageCount >= maxPages || allConversations.length >= maxConversations) {
      break;
    }
  } while (cursor);

  return allConversations;
}

// Fetch all conversations with pagination (no limit)
async function fetchAllOrgConversations(supabaseAdmin: any, organizationId: string, startDate?: Date) {
  const allConversations: any[] = [];
  const pageSize = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabaseAdmin
      .from('conversations')
      .select('id, agent_id, title, transcript, sentiment, satisfaction_score, duration, smart_tags, resolution_status, created_at, metadata')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      console.error('[global-advice] Error fetching conversations:', error);
      break;
    }

    if (data && data.length > 0) {
      allConversations.push(...data);
      offset += pageSize;
      hasMore = data.length === pageSize;
    } else {
      hasMore = false;
    }
  }

  return allConversations;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { days = 7, language = 'en', forceRegenerate = false, organizationId: requestedOrganizationId = null } = await req.json().catch(() => ({}));

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
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY') ?? '';

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

    const organizationId = await resolveOrganizationId(supabaseAdmin, user.id, requestedOrganizationId);

    if (!organizationId) {
      console.warn(`[global-advice] No organization context found for user ${user.id}; returning safe empty payload`);
      return buildEmptyAdviceResponse({ days, language, reason: 'no_organization_context' });
    }

    const orgMember = { organization_id: organizationId };


    console.log(`[global-advice] Generating for organization: ${orgMember.organization_id}, language: ${language}, days: ${days}`);

    // Get organization's ElevenLabs API key
    const { data: orgIntegration } = await supabaseAdmin
      .from('organization_integrations')
      .select('api_key')
      .eq('organization_id', orgMember.organization_id)
      .eq('platform', 'elevenlabs')
      .eq('is_active', true)
      .maybeSingle();

    const orgApiKey = orgIntegration?.api_key;

    // Get all agents
    const { data: agents } = await supabaseAdmin
      .from('agents')
      .select('id, name, platform, platform_agent_id, platform_api_key')
      .eq('organization_id', orgMember.organization_id);

    if (!agents || agents.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'No agents found',
        agentAdvice: [],
        globalSummary: null 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate start date (null for "all time")
    const startDate = resolveStartDate(days);

    // First try to fetch from local database
    let conversations = await fetchAllOrgConversations(supabaseAdmin, orgMember.organization_id, startDate);
    console.log(`[global-advice] Local DB conversations: ${conversations.length}`);

    // If local DB is empty, try fetching directly from ElevenLabs
    if (conversations.length === 0 && orgApiKey) {
      console.log(`[global-advice] Local DB empty, fetching from ElevenLabs API...`);
      
      const elevenlabsAgents = agents.filter(a => a.platform === 'elevenlabs' && a.platform_agent_id);
      
      for (const agent of elevenlabsAgents) {
        const apiKey = agent.platform_api_key || orgApiKey;
        if (!apiKey) continue;

        try {
          const platformConvs = await fetchElevenLabsConversations(apiKey, agent.platform_agent_id!, startDate);
          console.log(`[global-advice] Fetched ${platformConvs.length} from ElevenLabs for ${agent.name}`);
          
          // Map to local format
          for (const conv of platformConvs) {
            const analysis = conv.analysis || {};
            conversations.push({
              id: conv.conversation_id,
              agent_id: agent.id,
              title: `Conversation ${conv.conversation_id?.substring(0, 8) || 'unknown'}`,
              duration: conv.call_duration_secs || conv.duration || 0,
              satisfaction_score: conv.rating ? conv.rating * 2 : (analysis.call_successful === true ? 8 : analysis.call_successful === false ? 4 : null),
              sentiment: analysis.user_sentiment || analysis.sentiment || null,
              smart_tags: analysis.data_collection_results ? Object.keys(analysis.data_collection_results) : [],
              created_at: conv.start_time || conv.created_at,
              metadata: { summary: analysis.summary || analysis.transcript_summary },
            });
          }
        } catch (e) {
          console.error(`[global-advice] Error fetching from ElevenLabs for ${agent.name}:`, e);
        }
      }
    }

    // Also fetch from agent_insights for additional satisfaction data
    const { data: insights } = await supabaseAdmin
      .from('agent_insights')
      .select('agent_id, satisfaction_score, overall_sentiment')
      .eq('organization_id', orgMember.organization_id);

    // Create a map of conversation satisfaction from insights
    const insightMap = new Map();
    insights?.forEach(i => {
      if (!insightMap.has(i.agent_id)) {
        insightMap.set(i.agent_id, { scores: [], sentiments: [] });
      }
      if (i.satisfaction_score) {
        insightMap.get(i.agent_id).scores.push(i.satisfaction_score);
      }
      if (i.overall_sentiment) {
        insightMap.get(i.agent_id).sentiments.push(i.overall_sentiment);
      }
    });

    // Calculate global metrics
    const totalConversations = conversations?.length || 0;
    const conversationsWithSatisfaction = conversations?.filter(c => c.satisfaction_score) || [];
    const avgSatisfaction = conversationsWithSatisfaction.length > 0
      ? conversationsWithSatisfaction.reduce((sum, c) => sum + Number(c.satisfaction_score), 0) / conversationsWithSatisfaction.length
      : 0;
    const avgDuration = conversations && conversations.length > 0
      ? conversations.filter(c => c.duration).reduce((sum, c) => sum + (c.duration || 0), 0) /
        conversations.filter(c => c.duration).length || 0
      : 0;

    // Sentiment distribution
    let positiveCount = 0, neutralCount = 0, negativeCount = 0;
    conversations?.forEach(c => {
      const s = (c.sentiment || '').toLowerCase();
      if (s.includes('positif') || s === 'positive') positiveCount++;
      else if (s.includes('négatif') || s === 'negative') negativeCount++;
      else neutralCount++;
    });

    // Calculate per-agent metrics
    const agentMetrics = agents.map(agent => {
      const agentConvs = conversations?.filter(c => c.agent_id === agent.id) || [];
      const agentInsights = insightMap.get(agent.id) || { scores: [], sentiments: [] };
      
      // Combine satisfaction from conversations and insights
      const allScores = [
        ...agentConvs.filter(c => c.satisfaction_score).map(c => Number(c.satisfaction_score)),
        ...agentInsights.scores
      ];
      
      const agentSatisfaction = allScores.length > 0
        ? allScores.reduce((a, b) => a + b, 0) / allScores.length
        : 0;
        
      const agentDuration = agentConvs.length > 0
        ? agentConvs.filter(c => c.duration).reduce((sum, c) => sum + (c.duration || 0), 0) /
          agentConvs.filter(c => c.duration).length || 0
        : 0;

      let positive = 0, neutral = 0, negative = 0;
      agentConvs.forEach(c => {
        const s = (c.sentiment || '').toLowerCase();
        if (s.includes('positif') || s === 'positive') positive++;
        else if (s.includes('négatif') || s === 'negative') negative++;
        else neutral++;
      });
      
      // Also count from insights
      agentInsights.sentiments.forEach((s: string) => {
        const sl = (s || '').toLowerCase();
        if (sl.includes('positif') || sl === 'positive') positive++;
        else if (sl.includes('négatif') || sl === 'negative') negative++;
        else neutral++;
      });

      const allTags: string[] = [];
      agentConvs.forEach(c => {
        if (Array.isArray(c.smart_tags)) allTags.push(...c.smart_tags);
      });

      const tagCounts: Record<string, number> = {};
      allTags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });

      return {
        agentId: agent.id,
        agentName: agent.name,
        platform: agent.platform,
        totalConversations: agentConvs.length,
        avgSatisfaction: agentSatisfaction,
        avgDuration: agentDuration,
        sentiment: { positive, neutral, negative },
        topTags: Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([tag, count]) => ({ tag, count })),
      };
    }).sort((a, b) => b.totalConversations - a.totalConversations);

    const agentsWithConversations = agentMetrics.filter(a => a.totalConversations > 0);
    const bestAgent = agentsWithConversations.length > 0
      ? agentsWithConversations.reduce((best, a) => a.avgSatisfaction > best.avgSatisfaction ? a : best)
      : null;
    const worstAgent = agentsWithConversations.length > 0
      ? agentsWithConversations.reduce((worst, a) => a.avgSatisfaction < worst.avgSatisfaction ? a : worst)
      : null;

    // Generate global AI advice
    let globalAdvice = null;
    if (lovableApiKey && totalConversations > 0) {
      try {
        const promptData = {
          days,
          agentCount: agents.length,
          totalConversations,
          avgSatisfaction,
          avgDuration,
          positiveCount,
          neutralCount,
          negativeCount,
          agentPerformance: agentMetrics.map(a => 
            `- ${a.agentName}: ${a.totalConversations} conv, ${a.avgSatisfaction.toFixed(1)}/10, ${a.sentiment.positive}+ ${a.sentiment.neutral}= ${a.sentiment.negative}-`
          ).join('\n'),
          bestAgent,
          worstAgent,
        };

        const prompt = getGlobalAnalysisPrompt(language, promptData);

        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { role: 'system', content: getSystemPrompt(language) },
              { role: 'user', content: prompt }
            ],
            temperature: 0.7,
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const content = aiData.choices?.[0]?.message?.content || '';
          
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            globalAdvice = JSON.parse(jsonMatch[0]);
          }
        } else if (aiResponse.status === 429) {
          console.log('[global-advice] Rate limited');
        } else if (aiResponse.status === 402) {
          console.log('[global-advice] Credits exhausted');
        }
      } catch (aiError) {
        console.error('[global-advice] AI advice generation error:', aiError);
      }
    }

    // Generate default advice if AI failed or no conversations
    if (!globalAdvice) {
      const noDataMessage = language === 'en'
        ? 'No conversation data available. Please sync conversations first using the "Sync All" button.'
        : 'Aucune donnée de conversation disponible. Veuillez d\'abord synchroniser les conversations avec le bouton "Sync All".';

      const summaryTemplate = totalConversations > 0
        ? (language === 'en'
          ? `${totalConversations} conversations analyzed across ${agents.length} agents. Average satisfaction of ${avgSatisfaction.toFixed(1)}/10.`
          : `${totalConversations} conversations analysées sur ${agents.length} agents. Satisfaction moyenne de ${avgSatisfaction.toFixed(1)}/10.`)
        : noDataMessage;

      const insightTemplates = totalConversations > 0 ? (language === 'en' ? [
        `${positiveCount} positive conversations (${totalConversations > 0 ? ((positiveCount / totalConversations) * 100).toFixed(0) : 0}%)`,
        `Average duration of ${Math.round(avgDuration / 60)} minutes`,
        `${agents.length} active agents in the period`
      ] : [
        `${positiveCount} conversations positives (${totalConversations > 0 ? ((positiveCount / totalConversations) * 100).toFixed(0) : 0}%)`,
        `Durée moyenne de ${Math.round(avgDuration / 60)} minutes`,
        `${agents.length} agents actifs dans la période`
      ]) : [];

      globalAdvice = {
        globalSummary: summaryTemplate,
        overallHealth: totalConversations === 0 ? 'warning' : avgSatisfaction >= 7 ? 'good' : avgSatisfaction >= 5 ? 'warning' : 'critical',
        keyInsights: insightTemplates,
        globalStrengths: [],
        globalWeaknesses: [],
        priorityActions: totalConversations === 0 ? [
          { action: language === 'en' ? 'Sync conversations from ElevenLabs' : 'Synchroniser les conversations depuis ElevenLabs', agent: 'All', impact: 'high' }
        ] : [],
        agentRecommendations: {}
      };
    }

    return new Response(
      JSON.stringify({
        success: true,
        period: { days, from: startDate?.toISOString() || null, to: new Date().toISOString() },
        globalMetrics: {
          totalConversations,
          avgSatisfaction,
          avgDuration,
          sentiment: { positive: positiveCount, neutral: neutralCount, negative: negativeCount },
          agentCount: agents.length,
          bestAgent: bestAgent ? { name: bestAgent.agentName, satisfaction: bestAgent.avgSatisfaction } : null,
          worstAgent: worstAgent ? { name: worstAgent.agentName, satisfaction: worstAgent.avgSatisfaction } : null,
        },
        agentMetrics,
        globalAdvice,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[global-advice] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
