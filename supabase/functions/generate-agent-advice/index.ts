import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Bilingual prompt templates
const getSystemPrompt = (language: string) => {
  if (language === 'en') {
    return 'You are an expert in AI agent optimization. Respond only in valid JSON.';
  }
  return 'Tu es un expert en optimisation d\'agents IA. Réponds uniquement en JSON valide.';
};

const getAnalysisPrompt = (language: string, agent: any, days: number | string, metrics: any, conversationSummaries: any[]) => {
  const periodLabel = days === 'all' ? (language === 'en' ? 'All time' : 'Tout le temps') : `${days} ${language === 'en' ? 'day(s)' : 'jour(s)'}`;
  
  if (language === 'en') {
    return `You are an expert in AI conversational agent optimization. Analyze this data and generate a structured report.

AGENT: ${agent.name}
PERIOD: ${periodLabel}

METRICS:
- Conversations: ${metrics.totalConversations}
- Average satisfaction: ${metrics.avgSatisfaction.toFixed(1)}/10
- Average duration: ${Math.round(metrics.avgDuration)}s
- Resolution rate: ${metrics.successRate.toFixed(0)}%
- Sentiment: ${metrics.positiveCount} positive, ${metrics.neutralCount} neutral, ${metrics.negativeCount} negative

FREQUENT TAGS: ${metrics.topTags || 'None'}

ALREADY IDENTIFIED IMPROVEMENTS: ${metrics.topImprovements || 'None'}

CONVERSATION SAMPLES:
${JSON.stringify(conversationSummaries, null, 2)}

Generate a JSON report with this exact structure:
{
  "summary": "Summary in 2-3 sentences",
  "strengths": ["Strength 1", "Strength 2", "Strength 3"],
  "weaknesses": ["Weakness 1", "Weakness 2"],
  "recommendations": [
    {"priority": "high", "category": "prompt", "action": "Concrete action", "impact": "Expected impact"},
    {"priority": "medium", "category": "knowledge", "action": "Concrete action", "impact": "Expected impact"}
  ],
  "prompt_suggestions": ["Prompt modification suggestion 1"],
  "kb_suggestions": ["Add documentation about X"],
  "priority_actions": [
    {"action": "Priority action 1", "effort": "low", "impact": "high"},
    {"action": "Priority action 2", "effort": "medium", "impact": "high"}
  ]
}`;
  }
  
  return `Tu es un expert en optimisation d'agents IA conversationnels. Analyse ces données et génère un rapport structuré.

AGENT: ${agent.name}
PÉRIODE: ${periodLabel}

MÉTRIQUES:
- Conversations: ${metrics.totalConversations}
- Satisfaction moyenne: ${metrics.avgSatisfaction.toFixed(1)}/10
- Durée moyenne: ${Math.round(metrics.avgDuration)}s
- Taux de résolution: ${metrics.successRate.toFixed(0)}%
- Sentiment: ${metrics.positiveCount} positif, ${metrics.neutralCount} neutre, ${metrics.negativeCount} négatif

TAGS FRÉQUENTS: ${metrics.topTags || 'Aucun'}

AMÉLIORATIONS DÉJÀ IDENTIFIÉES: ${metrics.topImprovements || 'Aucune'}

ÉCHANTILLON DE CONVERSATIONS:
${JSON.stringify(conversationSummaries, null, 2)}

Génère un rapport JSON avec cette structure exacte:
{
  "summary": "Résumé en 2-3 phrases",
  "strengths": ["Force 1", "Force 2", "Force 3"],
  "weaknesses": ["Faiblesse 1", "Faiblesse 2"],
  "recommendations": [
    {"priority": "high", "category": "prompt", "action": "Action concrète", "impact": "Impact attendu"},
    {"priority": "medium", "category": "knowledge", "action": "Action concrète", "impact": "Impact attendu"}
  ],
  "prompt_suggestions": ["Suggestion modification prompt 1"],
  "kb_suggestions": ["Ajouter documentation sur X"],
  "priority_actions": [
    {"action": "Action prioritaire 1", "effort": "low", "impact": "high"},
    {"action": "Action prioritaire 2", "effort": "medium", "impact": "high"}
  ]
}`;
};

// Fetch conversations from ElevenLabs API directly
async function fetchElevenLabsConversations(apiKey: string, platformAgentId: string, startDate?: Date, maxConversations = 500) {
  const allConversations: any[] = [];
  let cursor: string | null = null;
  let pageCount = 0;
  const maxPages = 50;
  
  do {
    const url = new URL(`https://api.elevenlabs.io/v1/convai/agents/${platformAgentId}/conversations`);
    url.searchParams.set('limit', '100');
    if (cursor) {
      url.searchParams.set('cursor', cursor);
    }
    
    const response = await fetch(url.toString(), {
      headers: { 'xi-api-key': apiKey },
    });

    if (!response.ok) {
      console.error(`ElevenLabs API error: ${response.status}`);
      break;
    }

    const data = await response.json();
    const conversations = data.conversations || [];
    
    // Filter by start date if provided
    const filteredConversations = startDate 
      ? conversations.filter((c: any) => new Date(c.start_time || c.created_at) >= startDate)
      : conversations;
    
    allConversations.push(...filteredConversations);
    
    cursor = data.next_cursor || null;
    pageCount++;
    
    // Stop if we have enough or reached date limit
    if (!cursor || pageCount >= maxPages || allConversations.length >= maxConversations) {
      break;
    }
    
    // If we filtered out conversations due to date, we might have reached the cutoff
    if (startDate && filteredConversations.length < conversations.length) {
      break;
    }
  } while (cursor);

  return allConversations;
}

// Fetch conversation details from ElevenLabs
async function fetchConversationDetails(apiKey: string, conversationId: string) {
  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`,
      { headers: { 'xi-api-key': apiKey } }
    );
    if (response.ok) {
      return await response.json();
    }
  } catch (e) {
    console.log(`Could not fetch details for ${conversationId}`);
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { agentId, days = 7, language = 'en' } = await req.json();

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

    // Get user's organization
    const { data: orgMember } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!orgMember) {
      return new Response(JSON.stringify({ error: 'No organization found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get agent info
    const { data: agent, error: agentError } = await supabaseAdmin
      .from('agents')
      .select('id, name, platform, platform_agent_id, platform_api_key, config')
      .eq('id', agentId)
      .single();

    if (agentError || !agent) {
      return new Response(JSON.stringify({ error: 'Agent not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Generating advice for agent: ${agent.name}, platform: ${agent.platform}, language: ${language}, days: ${days}`);

    // Get API key from agent or organization integration
    let apiKey = agent.platform_api_key;
    
    if (!apiKey) {
      const { data: orgIntegration } = await supabaseAdmin
        .from('organization_integrations')
        .select('api_key')
        .eq('organization_id', orgMember.organization_id)
        .eq('platform', agent.platform)
        .eq('is_active', true)
        .maybeSingle();
      
      apiKey = orgIntegration?.api_key;
    }

    // Calculate start date (null for "all time")
    let startDate: Date | undefined;
    if (days !== 'all' && days > 0) {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
    }

    let platformConversations: any[] = [];
    let totalConversations = 0;
    let avgDuration = 0;
    let successfulCount = 0;

    // Fetch conversations from platform API directly
    if (agent.platform === 'elevenlabs' && apiKey && agent.platform_agent_id) {
      console.log('Fetching conversations directly from ElevenLabs API...');
      
      platformConversations = await fetchElevenLabsConversations(
        apiKey,
        agent.platform_agent_id,
        startDate,
        500
      );
      
      totalConversations = platformConversations.length;
      console.log(`Fetched ${totalConversations} conversations from ElevenLabs`);
      
      // Calculate metrics from platform data
      const durations = platformConversations
        .map(c => c.call_duration_secs || c.duration || 0)
        .filter(d => d > 0);
      avgDuration = durations.length > 0 
        ? durations.reduce((a, b) => a + b, 0) / durations.length 
        : 0;
      
      // Count successful conversations based on status
      successfulCount = platformConversations.filter(c => 
        c.status === 'done' || 
        c.analysis?.call_successful === true
      ).length;
    }

    // Fetch local conversations and insights for satisfaction data
    const { data: localConversations } = await supabaseAdmin
      .from('conversations')
      .select('id, satisfaction_score, sentiment, smart_tags, resolution_status, duration, metadata')
      .eq('agent_id', agentId)
      .gte('created_at', startDate?.toISOString() || '1970-01-01');

    const { data: insights } = await supabaseAdmin
      .from('agent_insights')
      .select('satisfaction_score, overall_sentiment, improvements, smart_tags')
      .eq('agent_id', agentId)
      .gte('created_at', startDate?.toISOString() || '1970-01-01');

    // Use platform total if available, otherwise local
    if (totalConversations === 0) {
      totalConversations = localConversations?.length || 0;
    }

    // Calculate satisfaction from local data (agent_insights)
    const satisfactionScores = [
      ...(insights?.filter(i => i.satisfaction_score).map(i => i.satisfaction_score) || []),
      ...(localConversations?.filter(c => c.satisfaction_score).map(c => c.satisfaction_score) || [])
    ].filter(s => s !== null && s !== undefined);

    const avgSatisfaction = satisfactionScores.length > 0
      ? satisfactionScores.reduce((a, b) => a + Number(b), 0) / satisfactionScores.length
      : 0;

    // Use local duration if platform didn't provide
    if (avgDuration === 0 && localConversations?.length) {
      const localDurations = localConversations
        .map(c => c.duration || 0)
        .filter(d => d > 0);
      avgDuration = localDurations.length > 0
        ? localDurations.reduce((a, b) => a + b, 0) / localDurations.length
        : 0;
    }

    // Calculate success rate
    const resolvedCount = localConversations?.filter(c => c.resolution_status === 'resolved').length || 0;
    const successRate = totalConversations > 0 
      ? ((successfulCount || resolvedCount) / totalConversations) * 100 
      : 0;

    // Collect all improvements and tags
    const allImprovements: string[] = [];
    const allTags: string[] = [];
    
    insights?.forEach(i => {
      if (Array.isArray(i.improvements)) {
        i.improvements.forEach((imp: any) => {
          if (typeof imp === 'string') allImprovements.push(imp);
          else if (imp?.suggestion) allImprovements.push(imp.suggestion);
        });
      }
      if (Array.isArray(i.smart_tags)) {
        allTags.push(...i.smart_tags);
      }
    });

    localConversations?.forEach(c => {
      if (Array.isArray(c.smart_tags)) {
        allTags.push(...c.smart_tags);
      }
    });

    // Count frequencies
    const improvementCounts: Record<string, number> = {};
    allImprovements.forEach(imp => {
      improvementCounts[imp] = (improvementCounts[imp] || 0) + 1;
    });

    const tagCounts: Record<string, number> = {};
    allTags.forEach(tag => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });

    // Sentiment distribution from insights
    let positiveCount = 0, neutralCount = 0, negativeCount = 0;
    
    insights?.forEach(i => {
      const s = (i.overall_sentiment || '').toLowerCase();
      if (s.includes('positif') || s === 'positive') positiveCount++;
      else if (s.includes('négatif') || s === 'negative') negativeCount++;
      else neutralCount++;
    });

    localConversations?.forEach(c => {
      const s = (c.sentiment || '').toLowerCase();
      if (s.includes('positif') || s === 'positive') positiveCount++;
      else if (s.includes('négatif') || s === 'negative') negativeCount++;
      else neutralCount++;
    });

    // Prepare conversation summaries for AI analysis
    const conversationSummaries: any[] = [];
    
    // Add summaries from platform conversations (first 30)
    for (const conv of platformConversations.slice(0, 30)) {
      const details = apiKey ? await fetchConversationDetails(apiKey, conv.conversation_id) : null;
      conversationSummaries.push({
        sentiment: details?.analysis?.user_sentiment || conv.analysis?.user_sentiment,
        satisfaction: null, // ElevenLabs doesn't provide this directly
        duration: conv.call_duration_secs || conv.duration,
        tags: details?.analysis?.data_collection_results ? Object.keys(details.analysis.data_collection_results) : [],
        resolution: conv.status === 'done' ? 'completed' : conv.status,
        summary: details?.analysis?.transcript_summary || details?.analysis?.summary || null,
        call_successful: details?.analysis?.call_successful
      });
    }

    // Add local summaries
    localConversations?.slice(0, 20).forEach(c => {
      conversationSummaries.push({
        sentiment: c.sentiment,
        satisfaction: c.satisfaction_score,
        duration: c.duration,
        tags: c.smart_tags,
        resolution: c.resolution_status,
        summary: (c.metadata as any)?.summary || (c.metadata as any)?.aiAnalysis?.summary || null
      });
    });

    const metrics = {
      totalConversations,
      avgSatisfaction,
      avgDuration,
      successRate,
      positiveCount,
      neutralCount,
      negativeCount,
      topTags: Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t, c]) => `${t} (${c})`).join(', '),
      topImprovements: Object.entries(improvementCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([i, c]) => `${i} (${c}x)`).join('; '),
    };

    console.log('Metrics:', metrics);

    // Generate AI advice
    let aiAdvice = null;
    if (lovableApiKey && totalConversations > 0) {
      try {
        const prompt = getAnalysisPrompt(language, agent, days, metrics, conversationSummaries.slice(0, 50));

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
          
          // Extract JSON from response
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            aiAdvice = JSON.parse(jsonMatch[0]);
          }
        } else if (aiResponse.status === 429) {
          console.log('Rate limited, using default advice');
        } else if (aiResponse.status === 402) {
          console.log('Credits exhausted, using default advice');
        }
      } catch (aiError) {
        console.error('AI advice generation error:', aiError);
      }
    }

    // Create report data with language and period info
    const periodDays = days === 'all' ? 'all' : String(days);
    const reportData = {
      agent_id: agentId,
      organization_id: orgMember.organization_id,
      report_date: new Date().toISOString().split('T')[0],
      language: language,
      period_days: periodDays,
      period_start: startDate?.toISOString() || null,
      period_end: new Date().toISOString(),
      total_conversations: totalConversations,
      avg_satisfaction: avgSatisfaction || null,
      avg_duration_seconds: Math.round(avgDuration) || null,
      success_rate: successRate || null,
      summary: aiAdvice?.summary || (language === 'en' 
        ? `${totalConversations} conversations analyzed. Average satisfaction: ${avgSatisfaction > 0 ? avgSatisfaction.toFixed(1) + '/10' : 'N/A'}.`
        : `${totalConversations} conversations analysées. Satisfaction moyenne: ${avgSatisfaction > 0 ? avgSatisfaction.toFixed(1) + '/10' : 'N/A'}.`),
      strengths: aiAdvice?.strengths || [],
      weaknesses: aiAdvice?.weaknesses || [],
      recommendations: aiAdvice?.recommendations || [],
      prompt_suggestions: aiAdvice?.prompt_suggestions || [],
      kb_suggestions: aiAdvice?.kb_suggestions || [],
      priority_actions: aiAdvice?.priority_actions || [],
      conversations_analyzed: conversationSummaries.length,
      generated_at: new Date().toISOString(),
    };

    // Upsert report with new unique constraint (agent_id, report_date, language, period_days)
    const { data: savedReport, error: saveError } = await supabaseAdmin
      .from('agent_daily_reports')
      .upsert(reportData, { onConflict: 'agent_id,report_date,language,period_days' })
      .select()
      .single();

    if (saveError) {
      console.error('Error saving report:', saveError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        report: savedReport || reportData,
        metrics: {
          totalConversations,
          avgSatisfaction,
          avgDuration,
          successRate,
          sentimentDistribution: { positive: positiveCount, neutral: neutralCount, negative: negativeCount },
          topTags: Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 10),
          topImprovements: Object.entries(improvementCounts).sort((a, b) => b[1] - a[1]).slice(0, 5),
          dataSource: apiKey ? 'platform+local' : 'local'
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Generate advice error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
