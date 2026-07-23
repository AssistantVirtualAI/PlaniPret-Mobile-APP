import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireOrgMember, corsHeaders } from "../_shared/auth.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { organization_id, conversation_id, transcript, analyze_all } = await req.json();

    if (!organization_id) {
      return new Response(JSON.stringify({ error: 'organization_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const authCheck = await requireOrgMember(req, organization_id);
    if ('error' in authCheck) return authCheck.error;

    console.log('Analyzing topics for org:', organization_id);


    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let transcriptsToAnalyze: { id: string; transcript: string }[] = [];

    if (analyze_all && organization_id) {
      // Fetch recent conversations without topic analysis
      const { data: conversations, error } = await supabase
        .from('conversations')
        .select('id, transcript')
        .eq('organization_id', organization_id)
        .not('transcript', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      transcriptsToAnalyze = conversations?.filter(c => c.transcript) || [];
    } else if (conversation_id && transcript) {
      transcriptsToAnalyze = [{ id: conversation_id, transcript }];
    } else {
      throw new Error('Either provide analyze_all with organization_id, or conversation_id with transcript');
    }

    if (transcriptsToAnalyze.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No transcripts to analyze',
        topics: [] 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Combine transcripts for batch analysis
    const combinedText = transcriptsToAnalyze
      .map((t, i) => `[Conversation ${i + 1}]: ${t.transcript}`)
      .join('\n\n');

    // Use Lovable AI to extract topics
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
            content: `You are an NLP analyst. Extract the main topics and themes from customer conversations. 
For each topic, provide:
- topic: The main subject (2-4 words)
- category: Category like "Support", "Sales", "Technical", "Billing", "General"
- sentiment: "positive", "neutral", or "negative"
- frequency: How many times this topic appears (estimate)

Return ONLY a valid JSON array of topics. No markdown, no explanation.
Example: [{"topic":"Product Installation","category":"Technical","sentiment":"neutral","frequency":3}]`
          },
          {
            role: 'user',
            content: `Analyze these conversations and extract the main topics:\n\n${combinedText.substring(0, 8000)}`
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'extract_topics',
              description: 'Extract topics from conversations',
              parameters: {
                type: 'object',
                properties: {
                  topics: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        topic: { type: 'string', description: 'Topic name (2-4 words)' },
                        category: { type: 'string', enum: ['Support', 'Sales', 'Technical', 'Billing', 'General', 'Product', 'Shipping', 'Returns'] },
                        sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
                        frequency: { type: 'number', description: 'Estimated occurrences' }
                      },
                      required: ['topic', 'category', 'sentiment', 'frequency']
                    }
                  }
                },
                required: ['topics']
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'extract_topics' } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add funds.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI API error: ${errorText}`);
    }

    const aiResult = await response.json();
    console.log('AI result:', JSON.stringify(aiResult).substring(0, 500));

    let topics: any[] = [];
    
    // Extract topics from tool call response
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        topics = parsed.topics || [];
      } catch (e) {
        console.error('Failed to parse tool response:', e);
      }
    }

    // Fallback: try parsing content directly
    if (topics.length === 0 && aiResult.choices?.[0]?.message?.content) {
      try {
        const content = aiResult.choices[0].message.content;
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          topics = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.error('Failed to parse content:', e);
      }
    }

    console.log(`Extracted ${topics.length} topics`);

    // Store topics in database
    if (topics.length > 0 && organization_id) {
      // Insert individual topic records
      const topicRecords = topics.map((t: any) => ({
        organization_id,
        conversation_id: conversation_id || null,
        topic: t.topic,
        category: t.category,
        sentiment: t.sentiment,
        frequency: t.frequency || 1,
        confidence: 0.85,
        analyzed_at: new Date().toISOString()
      }));

      const { error: insertError } = await supabase
        .from('conversation_topics')
        .insert(topicRecords);

      if (insertError) {
        console.error('Failed to insert topics:', insertError);
      }

      // Update aggregates using upsert
      for (const topic of topics) {
        const { error: upsertError } = await supabase
          .from('topic_aggregates')
          .upsert({
            organization_id,
            topic: topic.topic,
            category: topic.category,
            total_mentions: topic.frequency || 1,
            avg_sentiment: topic.sentiment === 'positive' ? 0.8 : topic.sentiment === 'negative' ? 0.2 : 0.5,
            last_mentioned_at: new Date().toISOString()
          }, {
            onConflict: 'organization_id,topic',
            ignoreDuplicates: false
          });

        if (upsertError) {
          console.error('Failed to upsert aggregate:', upsertError);
        }
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      topics,
      analyzed_count: transcriptsToAnalyze.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('analyze-topics error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
