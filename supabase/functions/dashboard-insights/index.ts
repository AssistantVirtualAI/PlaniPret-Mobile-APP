import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');

    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request body for date range
    let startDate: string | undefined;
    let endDate: string | undefined;
    let requestedOrganizationId: string | undefined;
    
    try {
      const body = await req.json();
      startDate = body.startDate;
      endDate = body.endDate;
      requestedOrganizationId = body.organizationId;
    } catch {
      // No body or invalid JSON, use defaults
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let organizationId = typeof requestedOrganizationId === 'string' && requestedOrganizationId.length > 0 ? requestedOrganizationId : null;

    if (organizationId) {
      const { data: membership } = await serviceClient
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (!membership) {
        return new Response(JSON.stringify({ error: 'Forbidden for selected organization' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      const { data: memberships } = await serviceClient
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .limit(1);
      organizationId = memberships?.[0]?.organization_id ?? null;
    }

    if (!organizationId) {
      return new Response(JSON.stringify({ error: 'No organization found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate date ranges based on input or defaults
    const now = new Date();
    const periodEnd = endDate ? new Date(endDate) : now;
    const periodStart = startDate 
      ? new Date(startDate) 
      : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Calculate previous period for comparison
    const periodDuration = periodEnd.getTime() - periodStart.getTime();
    const previousPeriodEnd = periodStart;
    const previousPeriodStart = new Date(periodStart.getTime() - periodDuration);

    // Fetch insights for current period
    const { data: currentInsights, error: currentError } = await serviceClient
      .from('agent_insights')
      .select('*')
      .eq('organization_id', organizationId)
      .gte('analyzed_at', periodStart.toISOString())
      .lte('analyzed_at', periodEnd.toISOString())
      .order('analyzed_at', { ascending: false });

    // Fetch insights for previous period (comparison)
    const { data: previousInsights } = await serviceClient
      .from('agent_insights')
      .select('*')
      .eq('organization_id', organizationId)
      .gte('analyzed_at', previousPeriodStart.toISOString())
      .lt('analyzed_at', previousPeriodEnd.toISOString());

    if (currentError) {
      console.error('Error fetching insights:', currentError);
      throw currentError;
    }

    // Fetch total conversations count for current period
    const { count: currentConversations } = await serviceClient
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('created_at', periodStart.toISOString())
      .lte('created_at', periodEnd.toISOString());

    // Fetch total conversations count for previous period
    const { count: previousConversations } = await serviceClient
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('created_at', previousPeriodStart.toISOString())
      .lt('created_at', previousPeriodEnd.toISOString());

    const allInsights = currentInsights || [];
    const prevInsights = previousInsights || [];

    // Calculate metrics for a period
    const calcMetrics = (data: typeof allInsights) => {
      if (data.length === 0) {
        return {
          avgSatisfaction: 0,
          sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 },
          count: 0,
          totalDuration: 0
        };
      }

      const avgSatisfaction = data.reduce((sum, i) => 
        sum + (Number(i.satisfaction_score) || 0), 0
      ) / data.length;

      const sentimentBreakdown = {
        positive: data.filter(i => i.overall_sentiment === 'positive').length,
        neutral: data.filter(i => i.overall_sentiment === 'neutral').length,
        negative: data.filter(i => i.overall_sentiment === 'negative').length,
      };

      return { avgSatisfaction, sentimentBreakdown, count: data.length, totalDuration: 0 };
    };

    const currentMetrics = calcMetrics(allInsights);
    const previousMetrics = calcMetrics(prevInsights);

    // Calculate period comparison
    const conversationsChange = previousConversations && previousConversations > 0
      ? Math.round(((currentConversations || 0) - previousConversations) / previousConversations * 100)
      : 0;
    
    const satisfactionChange = previousMetrics.avgSatisfaction > 0
      ? Math.round((currentMetrics.avgSatisfaction - previousMetrics.avgSatisfaction) * 10) / 10
      : 0;

    // Aggregate smart tags
    const tagCounts: Record<string, number> = {};
    allInsights.forEach(insight => {
      const tags = (insight.smart_tags as string[]) || [];
      tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => ({ tag, count }));

    // Aggregate improvements by category
    const improvementCounts: Record<string, number> = {};
    const improvementMap: Record<string, { suggestion: string; count: number }> = {};

    allInsights.forEach(insight => {
      const improvements = (insight.improvements as any[]) || [];
      improvements.forEach(imp => {
        if (imp.category) {
          improvementCounts[imp.category] = (improvementCounts[imp.category] || 0) + 1;
          
          const key = `${imp.category}:${(imp.suggestion || '').substring(0, 50)}`;
          if (!improvementMap[key]) {
            improvementMap[key] = { suggestion: imp.suggestion || '', count: 0 };
          }
          improvementMap[key].count++;
        }
      });
    });

    const sortedImprovements = Object.entries(improvementMap)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([key, value]) => ({
        category: key.split(':')[0],
        suggestion: value.suggestion,
        count: value.count
      }));

    // Coverage rate
    const coverageRate = currentConversations ? 
      Math.round((allInsights.length / currentConversations) * 100) : 0;

    // Determine overall health based on metrics
    let overallHealth: 'good' | 'warning' | 'critical' = 'good';
    if (currentMetrics.avgSatisfaction < 5 || currentMetrics.sentimentBreakdown.negative > currentMetrics.sentimentBreakdown.positive) {
      overallHealth = 'critical';
    } else if (currentMetrics.avgSatisfaction < 7 || conversationsChange < -20) {
      overallHealth = 'warning';
    }

    const response = {
      // Current period metrics
      period7d: {
        avgSatisfaction: Math.round(currentMetrics.avgSatisfaction * 10) / 10,
        sentimentBreakdown: currentMetrics.sentimentBreakdown,
        analyzedCount: currentMetrics.count
      },
      // Full period metrics (same as 7d for custom range)
      period30d: {
        avgSatisfaction: Math.round(currentMetrics.avgSatisfaction * 10) / 10,
        sentimentBreakdown: currentMetrics.sentimentBreakdown,
        analyzedCount: currentMetrics.count
      },
      // Period comparison
      periodComparison: {
        conversationsChange,
        satisfactionChange,
        previousConversations: previousConversations || 0,
        previousSatisfaction: Math.round(previousMetrics.avgSatisfaction * 10) / 10,
      },
      // Top insights
      topTags,
      topImprovements: sortedImprovements,
      improvementsByCategory: improvementCounts,
      coverageRate,
      totalConversations: currentConversations || 0,
      lastAnalyzedAt: allInsights[0]?.analyzed_at || null,
      // Date range info
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      // Health indicators
      overallHealth,
      healthScore: Math.round((currentMetrics.avgSatisfaction / 10) * 100),
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[dashboard-insights] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
