import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validation helpers
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(value: unknown): boolean {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

function sanitizeString(value: unknown, maxLength: number = 50000): string | null {
  if (typeof value !== 'string') return null;
  return value.slice(0, maxLength);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const t0 = Date.now();
  const timings: Record<string, number> = {};

  try {
    const requestId = crypto.randomUUID();
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');

    console.log('[analyze-conversation] Request started', { requestId, t0 });

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Try to authenticate user if auth header is provided
    let user = null;
    let isAuthenticated = false;
    
    if (authHeader) {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: { user: authUser }, error: userError } = await supabaseClient.auth.getUser();
      if (!userError && authUser) {
        user = authUser;
        isAuthenticated = true;
      }
    }
    
    timings.auth = Date.now() - t0;

    const body = await req.json();
    const { 
      conversationId, 
      externalConversationId,
      agentId: providedAgentId, 
      organizationId: providedOrgId, 
      transcript: externalTranscript,
      platformAgentId,
      forceRegenerate = false,
      language = 'fr' // Default to French for backward compatibility
    } = body;
    
    const isEnglish = language === 'en';

    // Input validation
    if (conversationId && !isValidUUID(conversationId)) {
      return new Response(JSON.stringify({ error: 'Invalid conversationId format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (providedAgentId && !isValidUUID(providedAgentId)) {
      return new Response(JSON.stringify({ error: 'Invalid agentId format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (providedOrgId && !isValidUUID(providedOrgId)) {
      return new Response(JSON.stringify({ error: 'Invalid organizationId format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Sanitize external inputs
    const sanitizedTranscript = externalTranscript ? sanitizeString(externalTranscript, 100000) : null;
    const sanitizedExternalConvId = externalConversationId ? sanitizeString(externalConversationId, 100) : null;
    const sanitizedPlatformAgentId = platformAgentId ? sanitizeString(platformAgentId, 100) : null;
    
    const effectiveConversationId = conversationId || sanitizedExternalConvId;
    const isExternalConversation = !conversationId && !!sanitizedExternalConvId;
    
    console.log('[analyze-conversation] Params', {
      requestId,
      effectiveConversationId,
      isExternalConversation,
      forceRegenerate,
      hasTranscript: !!sanitizedTranscript
    });

    // CACHE CHECK: Return existing analysis if available and not forcing regenerate
    if (!forceRegenerate && effectiveConversationId) {
      const { data: existingInsight } = await serviceClient
        .from('agent_insights')
        .select('*')
        .eq('conversation_id', effectiveConversationId)
        .maybeSingle();

      if (existingInsight) {
        console.log('[analyze-conversation] Returning cached analysis', {
          requestId,
          totalTime: Date.now() - t0
        });
        
        const cachedAnalysis = {
          ...getDefaultAnalysis(),
          satisfaction_score: existingInsight.satisfaction_score,
          sentiment: existingInsight.overall_sentiment,
          sentiment_timeline: existingInsight.sentiment_timeline,
          improvements: existingInsight.improvements,
          smart_tags: existingInsight.smart_tags,
          cached: true
        };
        
        return new Response(JSON.stringify({
          analysis: cachedAnalysis,
          cached: true
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    timings.cacheCheck = Date.now() - t0;

    let conversation: any = null;
    let agentId = providedAgentId;
    let organizationId = providedOrgId;

    // For internal conversations, fetch from database
    if (!isExternalConversation && effectiveConversationId) {
      const { data: convData } = await serviceClient
        .from('conversations')
        .select('*')
        .eq('id', effectiveConversationId)
        .single();

      if (convData) {
        conversation = convData;
        agentId = agentId || conversation?.agent_id;
        organizationId = organizationId || conversation?.organization_id;
      }
    }

    // If we have a platformAgentId but no agentId, try to find the agent
    if (!agentId && sanitizedPlatformAgentId) {
      const { data: agentData } = await serviceClient
        .from('agents')
        .select('id, organization_id')
        .eq('platform_agent_id', sanitizedPlatformAgentId)
        .single();
      
      if (agentData) {
        agentId = agentData.id;
        organizationId = organizationId || agentData.organization_id;
      }
    }

    timings.dataFetch = Date.now() - t0;

    // Build transcript from best available source
    let transcriptText = sanitizedTranscript;
    let transcriptSource = 'external';
    
    if (!transcriptText && conversation) {
      const meta = conversation.metadata as any;
      
      if (meta?.transcript && Array.isArray(meta.transcript)) {
        transcriptText = meta.transcript.map((msg: any) => {
          const role = msg.role === 'agent' ? 'Agent' : 'Client';
          const text = msg.message || msg.text || msg.content || '';
          return `${role}: ${text}`;
        }).join('\n');
        transcriptSource = 'metadata.transcript';
      }
      else if ((conversation.user_messages?.length || 0) > 0 || (conversation.agent_messages?.length || 0) > 0) {
        const userMsgs = conversation.user_messages || [];
        const agentMsgs = conversation.agent_messages || [];
        const combined: string[] = [];
        const maxLen = Math.max(userMsgs.length, agentMsgs.length);
        
        for (let i = 0; i < maxLen; i++) {
          if (i < agentMsgs.length && agentMsgs[i]) {
            const msg = typeof agentMsgs[i] === 'string' ? agentMsgs[i] : (agentMsgs[i] as any)?.message || '';
            if (msg) combined.push(`Agent: ${msg}`);
          }
          if (i < userMsgs.length && userMsgs[i]) {
            const msg = typeof userMsgs[i] === 'string' ? userMsgs[i] : (userMsgs[i] as any)?.message || '';
            if (msg) combined.push(`Client: ${msg}`);
          }
        }
        transcriptText = combined.join('\n');
        transcriptSource = 'user_agent_messages';
      }
      else if (conversation.transcript && typeof conversation.transcript === 'string') {
        transcriptText = conversation.transcript;
        transcriptSource = 'transcript_string';
      }
    }

    if (!transcriptText) {
      return new Response(JSON.stringify({ 
        error: 'No transcript available',
        analysis: getDefaultAnalysis()
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate transcript stats (non-AI, instant)
    const transcriptStats = calculateTranscriptStats(transcriptText);
    
    console.log('[analyze-conversation] Transcript ready', {
      requestId,
      source: transcriptSource,
      wordCount: transcriptStats.wordCount,
      turnCount: transcriptStats.turnCount
    });

    timings.transcriptReady = Date.now() - t0;

    // Prepare optimized transcript (smart slicing)
    const optimizedTranscript = optimizeTranscript(transcriptText, 4000);

    // Call Lovable AI for analysis
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ 
        error: 'AI service not configured',
        analysis: { ...getDefaultAnalysis(), transcriptStats }
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const analysisPrompt = isEnglish 
      ? `Analyze this customer/agent conversation and provide a JSON evaluation.

Conversation:
${optimizedTranscript}

Respond ONLY with valid JSON using this structure:
{
  "satisfaction_score": <1.0-10.0>,
  "satisfaction_reason": "<short justification max 20 words>",
  "sentiment": "positive" | "negative" | "neutral",
  "confidence": <0.0-1.0>,
  "sentiment_timeline": [
    {"time_percent": 0, "sentiment": "neutral", "reason": "Start"},
    {"time_percent": 50, "sentiment": "...", "reason": "..."},
    {"time_percent": 100, "sentiment": "...", "reason": "End"}
  ],
  "topics": ["topic1", "topic2"],
  "intentions": ["intention1"],
  "smart_tags": ["complaint" | "info_request" | "purchase" | "technical_support" | "appointment" | "billing" | "callback" | "other"],
  "key_moments": [
    {"time_percent": <0-100>, "quote": "<short quote>", "significance": "..."}
  ],
  "callMetrics": {
    "talkTime": <0-100>,
    "silenceTime": <0-100>,
    "interruptionCount": <number>,
    "wordsPerMinute": <number>
  },
  "summary": "<max 2 sentences>",
  "improvements": [
    {
      "category": "tone" | "response_speed" | "knowledge" | "clarity" | "problem_solving" | "handoff",
      "priority": "high" | "medium" | "low",
      "suggestion": "...",
      "recommended_action": "..."
    }
  ]
}`
      : `Analyse cette conversation client/agent et fournis une évaluation JSON.

Conversation:
${optimizedTranscript}

Réponds UNIQUEMENT en JSON valide avec cette structure:
{
  "satisfaction_score": <1.0-10.0>,
  "satisfaction_reason": "<justification courte max 20 mots>",
  "sentiment": "positive" | "negative" | "neutral",
  "confidence": <0.0-1.0>,
  "sentiment_timeline": [
    {"time_percent": 0, "sentiment": "neutral", "reason": "Début"},
    {"time_percent": 50, "sentiment": "...", "reason": "..."},
    {"time_percent": 100, "sentiment": "...", "reason": "Fin"}
  ],
  "topics": ["sujet1", "sujet2"],
  "intentions": ["intention1"],
  "smart_tags": ["reclamation" | "demande_info" | "achat" | "support_technique" | "rendez_vous" | "facturation" | "rappel" | "autre"],
  "key_moments": [
    {"time_percent": <0-100>, "quote": "<citation courte>", "significance": "..."}
  ],
  "callMetrics": {
    "talkTime": <0-100>,
    "silenceTime": <0-100>,
    "interruptionCount": <nombre>,
    "wordsPerMinute": <nombre>
  },
  "summary": "<max 2 phrases>",
  "improvements": [
    {
      "category": "tone" | "response_speed" | "knowledge" | "clarity" | "problem_solving" | "handoff",
      "priority": "high" | "medium" | "low",
      "suggestion": "...",
      "recommended_action": "..."
    }
  ]
}`;

    timings.aiStart = Date.now() - t0;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { 
            role: 'system', 
            content: isEnglish 
              ? 'You are an expert in customer service conversation analysis. Respond only in valid JSON.'
              : 'Tu es un expert en analyse de conversations service client. Réponds uniquement en JSON valide.' 
          },
          { role: 'user', content: analysisPrompt }
        ],
      }),
    });

    timings.aiEnd = Date.now() - t0;

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[analyze-conversation] AI error', { status: aiResponse.status, errorText });
      
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Rate limit exceeded',
          analysis: { ...getDefaultAnalysis(), transcriptStats }
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'AI credits exhausted',
          analysis: { ...getDefaultAnalysis(), transcriptStats }
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      return new Response(JSON.stringify({ 
        error: 'AI analysis failed',
        analysis: { ...getDefaultAnalysis(), transcriptStats }
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiResponse.json();
    const analysisText = aiData.choices[0]?.message?.content || '{}';

    // Parse AI response
    let analysis;
    try {
      let cleanJson = analysisText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : getDefaultAnalysis();
      
      analysis = {
        ...getDefaultAnalysis(),
        ...analysis,
        satisfaction_score: analysis.satisfaction_score || 5.0,
        sentiment_timeline: analysis.sentiment_timeline || [],
        improvements: analysis.improvements || [],
        smart_tags: analysis.smart_tags || ['autre'],
        transcriptStats
      };
    } catch (e) {
      console.error('[analyze-conversation] Parse error', e);
      analysis = { ...getDefaultAnalysis(), transcriptStats };
    }

    timings.parsed = Date.now() - t0;

    console.log('[analyze-conversation] Analysis complete', {
      requestId,
      satisfaction: analysis.satisfaction_score,
      sentiment: analysis.sentiment,
      improvements: analysis.improvements?.length || 0,
      aiDuration: timings.aiEnd - timings.aiStart
    });

    // Update internal conversation if we have one
    if (!isExternalConversation && effectiveConversationId) {
      await serviceClient
        .from('conversations')
        .update({ 
          satisfaction_score: analysis.satisfaction_score,
          sentiment: analysis.sentiment,
          smart_tags: analysis.smart_tags,
          metadata: {
            ...(conversation?.metadata || {}),
            aiAnalysis: analysis,
            analyzedAt: new Date().toISOString()
          }
        })
        .eq('id', effectiveConversationId);
    }

    // Save to agent_insights with language tag
    if (agentId && organizationId && effectiveConversationId) {
      await serviceClient
        .from('agent_insights')
        .upsert({
          agent_id: agentId,
          conversation_id: effectiveConversationId,
          organization_id: organizationId,
          satisfaction_score: analysis.satisfaction_score,
          sentiment_timeline: analysis.sentiment_timeline,
          overall_sentiment: analysis.sentiment,
          improvements: analysis.improvements,
          smart_tags: analysis.smart_tags,
          analyzed_at: new Date().toISOString(),
          language: language // Store the language used for analysis
        }, {
          onConflict: 'conversation_id'
        });

      // Send alert for low satisfaction
      if (analysis.satisfaction_score < 5) {
        try {
          await fetch(
            `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-satisfaction-alert`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                conversationId: effectiveConversationId,
                agentId,
                organizationId,
                satisfactionScore: analysis.satisfaction_score,
                summary: analysis.summary
              })
            }
          );
        } catch (e) {
          console.error('[analyze-conversation] Alert error', e);
        }
      }
    }

    timings.saved = Date.now() - t0;

    console.log('[analyze-conversation] Complete', {
      requestId,
      totalTime: Date.now() - t0,
      timings
    });

    return new Response(JSON.stringify({ analysis }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[analyze-conversation] Error', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      analysis: getDefaultAnalysis()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function getDefaultAnalysis() {
  return {
    satisfaction_score: 5.0,
    sentiment: 'neutral',
    confidence: 0.5,
    sentiment_timeline: [
      { time_percent: 0, sentiment: 'neutral', reason: 'Début' },
      { time_percent: 100, sentiment: 'neutral', reason: 'Fin' }
    ],
    topics: [],
    intentions: [],
    actionItems: [],
    smart_tags: ['autre'],
    callMetrics: {
      talkTime: 50,
      silenceTime: 10,
      interruptionCount: 0,
      wordsPerMinute: 120
    },
    summary: '',
    improvements: [],
    key_moments: []
  };
}

function calculateTranscriptStats(text: string) {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  const charCount = text.length;
  
  // Count turns
  const agentTurns = (text.match(/^Agent:/gm) || []).length;
  const clientTurns = (text.match(/^Client:/gm) || []).length;
  const turnCount = agentTurns + clientTurns;
  
  // Count words per role
  const agentWords = (text.match(/Agent:.*$/gm) || [])
    .join(' ')
    .split(/\s+/)
    .filter(w => w.length > 0 && w !== 'Agent:').length;
  const clientWords = wordCount - agentWords;
  
  const talkRatio = wordCount > 0 ? Math.round((agentWords / wordCount) * 100) : 50;
  
  // Simple keyword extraction (top 5 words > 4 chars, excluding common words)
  const stopwords = new Set(['agent', 'client', 'bonjour', 'merci', 'alors', 'donc', 'votre', 'notre', 'cette', 'cette', 'pour', 'avec', 'dans', 'vous', 'nous', 'leur', 'etes', 'avez', 'fait', 'bien', 'plus', 'tout', 'tres', 'peut', 'comme']);
  const wordFreq: Record<string, number> = {};
  
  words.forEach(w => {
    const clean = w.toLowerCase().replace(/[^a-zàâäéèêëïîôùûüç]/g, '');
    if (clean.length > 4 && !stopwords.has(clean)) {
      wordFreq[clean] = (wordFreq[clean] || 0) + 1;
    }
  });
  
  const topKeywords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);

  return {
    wordCount,
    charCount,
    turnCount,
    agentTurns,
    clientTurns,
    talkRatio,
    topKeywords
  };
}

function optimizeTranscript(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  
  const lines = text.split('\n');
  if (lines.length <= 10) return text.substring(0, maxLength);
  
  // Take first 30%, middle 20%, last 50% (weighted toward recent messages)
  const firstCount = Math.floor(lines.length * 0.3);
  const middleStart = Math.floor(lines.length * 0.4);
  const middleCount = Math.floor(lines.length * 0.1);
  const lastCount = Math.floor(lines.length * 0.5);
  
  const firstPart = lines.slice(0, firstCount);
  const middlePart = lines.slice(middleStart, middleStart + middleCount);
  const lastPart = lines.slice(-lastCount);
  
  const combined = [
    ...firstPart,
    '--- [messages intermédiaires omis] ---',
    ...middlePart,
    '--- [suite] ---',
    ...lastPart
  ].join('\n');
  
  return combined.substring(0, maxLength);
}
