import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FAQItem {
  question: string;
  answer: string;
  frequency: number;
  category: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { agent_id, organization_id } = await req.json();

    if (!organization_id) {
      throw new Error('organization_id is required');
    }

    // Require authenticated org member
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: { user } } = await supabaseClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: membership } = await supabaseClient
      .from('organization_members')
      .select('id')
      .eq('organization_id', organization_id)
      .eq('user_id', user.id)
      .maybeSingle();
    const { data: isSuper } = await supabaseClient.rpc('is_super_admin', { _user_id: user.id });
    if (!membership && !isSuper) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch conversations for analysis
    let query = supabaseClient
      .from('conversations')
      .select('id, transcript, user_messages, agent_messages, keywords, sentiment')
      .eq('organization_id', organization_id)
      .not('transcript', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100);

    if (agent_id) {
      query = query.eq('agent_id', agent_id);
    }

    const { data: conversations, error } = await query;

    if (error) throw error;

    // Extract patterns and generate FAQs using simple NLP
    const faqMap = new Map<string, FAQItem>();
    const questionPatterns = [
      /(?:comment|how|pourquoi|why|quand|when|où|where|qui|who|quel|what|est-ce que|is|can|puis-je|may i|do you)[^.?!]*\?/gi,
      /(?:je voudrais|i would like|j'aimerais|i'd like|pouvez-vous|can you|could you)[^.?!]*/gi,
    ];

    const categoryKeywords: Record<string, string[]> = {
      'Produits': ['produit', 'product', 'article', 'item', 'prix', 'price', 'achat', 'purchase'],
      'Services': ['service', 'prestation', 'offre', 'offer', 'abonnement', 'subscription'],
      'Support': ['problème', 'problem', 'aide', 'help', 'erreur', 'error', 'bug', 'issue'],
      'Facturation': ['facture', 'invoice', 'paiement', 'payment', 'remboursement', 'refund'],
      'Compte': ['compte', 'account', 'connexion', 'login', 'mot de passe', 'password'],
      'Livraison': ['livraison', 'delivery', 'expédition', 'shipping', 'suivi', 'tracking'],
      'Général': []
    };

    for (const conv of conversations || []) {
      const text = conv.transcript || '';
      const userMsgs = Array.isArray(conv.user_messages) ? conv.user_messages : [];
      
      // Extract questions from transcript
      for (const pattern of questionPatterns) {
        const matches = text.match(pattern) || [];
        for (const match of matches) {
          const normalizedQ = match.trim().toLowerCase();
          if (normalizedQ.length < 10) continue;
          
          // Determine category
          let category = 'Général';
          for (const [cat, keywords] of Object.entries(categoryKeywords)) {
            if (keywords.some(kw => normalizedQ.includes(kw))) {
              category = cat;
              break;
            }
          }

          // Generate answer from context
          const existingFaq = faqMap.get(normalizedQ);
          if (existingFaq) {
            existingFaq.frequency++;
          } else {
            // Extract potential answer (text after question in transcript)
            const qIndex = text.toLowerCase().indexOf(normalizedQ);
            const answerText = text.slice(qIndex + normalizedQ.length, qIndex + normalizedQ.length + 500);
            const answer = answerText.split(/[.!?]/)[0]?.trim() || 'Réponse à compléter';
            
            faqMap.set(normalizedQ, {
              question: match.charAt(0).toUpperCase() + match.slice(1),
              answer: answer.length > 20 ? answer : 'Réponse à compléter par l\'équipe',
              frequency: 1,
              category
            });
          }
        }
      }

      // Also analyze user messages for common intents
      for (const msg of userMsgs) {
        const msgText = typeof msg === 'string' ? msg : (msg as any)?.content || '';
        if (msgText.includes('?')) {
          const normalizedQ = msgText.trim().toLowerCase();
          if (normalizedQ.length >= 10 && !faqMap.has(normalizedQ)) {
            let category = 'Général';
            for (const [cat, keywords] of Object.entries(categoryKeywords)) {
              if (keywords.some(kw => normalizedQ.includes(kw))) {
                category = cat;
                break;
              }
            }
            faqMap.set(normalizedQ, {
              question: msgText.charAt(0).toUpperCase() + msgText.slice(1),
              answer: 'Réponse à compléter par l\'équipe',
              frequency: 1,
              category
            });
          }
        }
      }
    }

    // Sort by frequency and limit results
    const faqs = Array.from(faqMap.values())
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 20);

    // Calculate misunderstood queries (low satisfaction or negative sentiment)
    const misunderstoodQueries = (conversations || [])
      .filter(c => c.sentiment === 'negative' || (c as any).satisfaction_score < 3)
      .map(c => ({
        transcript_excerpt: (c.transcript || '').slice(0, 200),
        keywords: c.keywords || [],
        sentiment: c.sentiment
      }))
      .slice(0, 10);

    console.log(`Generated ${faqs.length} FAQs from ${conversations?.length || 0} conversations`);

    return new Response(
      JSON.stringify({
        success: true,
        faqs,
        misunderstood_queries: misunderstoodQueries,
        conversations_analyzed: conversations?.length || 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating FAQ:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
