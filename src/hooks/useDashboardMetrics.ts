import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { format } from 'date-fns';
import { t } from '@/lib/i18n';

export interface DateRange {
  start: Date;
  end: Date;
}

export interface DashboardMetrics {
  totalConversations: number;
  conversationsToday: number;
  conversationsThisWeek: number;
  conversationsThisMonth: number;
  previousPeriodConversations: number;
  conversationsTrend: number;
  incomingMessages: number;
  previousPeriodMessages: number;
  messagesTrend: number;
  uniqueUsers: number;
  previousPeriodUsers: number;
  usersTrend: number;
  avgInteractions: number;
  avgSatisfaction: number;
  avgDuration: number;
  activeClients: number;
  totalAgents: number;
  platformDistribution: { platform: string; count: number }[];
  recentActivity: {
    id: string;
    type: 'conversation' | 'client' | 'agent';
    title: string;
    timestamp: string;
  }[];
  lastUpdated: string;
  dataSource: 'elevenlabs' | 'local' | 'mixed';
  weeklyData: { name: string; conversations: number; satisfaction: number }[];
  agentPerformance: { name: string; conversations: number; satisfaction: number; duration: number }[];
  // New enhanced metrics
  resolutionRate: number;
  resolvedConversations: number;
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  peakHours: { hour: number; count: number }[];
  qualityScore: number;
  weeklyGrowth: number;
  totalDurationMinutes: number;
  // AI insights data
  aiInsightsAvailable: boolean;
  analysisCoverageRate: number;
  topSmartTags: { tag: string; count: number }[];
  topImprovements: { category: string; suggestion: string; count: number }[];
  // Period comparison
  periodLabel?: string;
  previousPeriodLabel?: string;
  periodComparison?: {
    conversationsChange: number;
    satisfactionChange: number;
    durationChange: number;
  };
}

const defaultMetrics: DashboardMetrics = {
  totalConversations: 0,
  conversationsToday: 0,
  conversationsThisWeek: 0,
  conversationsThisMonth: 0,
  previousPeriodConversations: 0,
  conversationsTrend: 0,
  incomingMessages: 0,
  previousPeriodMessages: 0,
  messagesTrend: 0,
  uniqueUsers: 0,
  previousPeriodUsers: 0,
  usersTrend: 0,
  avgInteractions: 0,
  avgSatisfaction: 0,
  avgDuration: 0,
  activeClients: 0,
  totalAgents: 0,
  platformDistribution: [],
  recentActivity: [],
  lastUpdated: new Date().toISOString(),
  dataSource: 'local',
  weeklyData: [],
  agentPerformance: [],
  // New enhanced metrics defaults
  resolutionRate: 0,
  resolvedConversations: 0,
  sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 },
  peakHours: [],
  qualityScore: 0,
  weeklyGrowth: 0,
  totalDurationMinutes: 0,
  aiInsightsAvailable: false,
  analysisCoverageRate: 0,
  topSmartTags: [],
  topImprovements: [],
};

export const useDashboardMetrics = (dateRange?: DateRange) => {
  const { selectedOrgId } = useOrganization();

  // Calculate timeframe based on dateRange
  const getTimeframe = () => {
    if (!dateRange) return '30d';
    const diffDays = Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 1) return '1d';
    if (diffDays <= 7) return '7d';
    if (diffDays <= 30) return '30d';
    return '90d';
  };

  return useQuery({
    queryKey: ['dashboard-metrics', selectedOrgId, dateRange?.start?.toISOString(), dateRange?.end?.toISOString()],
    queryFn: async (): Promise<DashboardMetrics> => {
      if (!selectedOrgId) {
        return defaultMetrics;
      }

      const timeframe = getTimeframe();
      const startDate = dateRange ? format(dateRange.start, 'yyyy-MM-dd') : undefined;
      const endDate = dateRange ? format(dateRange.end, 'yyyy-MM-dd') : undefined;

      // Fetch ElevenLabs analytics, conversations, AI insights, and local data in parallel
      const [
        elevenLabsAnalytics,
        elevenLabsConversations,
        dashboardInsights,
        clientsRes,
        agentsRes,
      ] = await Promise.all([
        supabase.functions.invoke('elevenlabs-all-agents-analytics', {
          body: { organizationId: selectedOrgId, timeframe, includeCharts: true, startDate, endDate }
        }).catch(() => ({ data: null, error: 'Failed' })),
        supabase.functions.invoke('elevenlabs-all-agents-conversations', {
          body: { organizationId: selectedOrgId, page: 1, limit: 100, action: 'list', startDate, endDate }
        }).catch(() => ({ data: null, error: 'Failed' })),
        supabase.functions.invoke('dashboard-insights', {
          body: { organizationId: selectedOrgId, startDate, endDate }
        }).catch(() => ({ data: null, error: 'Failed' })),
        supabase
          .from('clients')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', selectedOrgId)
          .eq('status', 'active'),
        supabase
          .from('agents_safe')
          .select('id, name, platform, platform_agent_id')
          .eq('organization_id', selectedOrgId),
      ]);

      const agents = agentsRes.data || [];
      const elevenLabsData = elevenLabsAnalytics.data;
      const conversationsData = elevenLabsConversations.data;
      const aiInsights = dashboardInsights.data;
      
      let dataSource: 'elevenlabs' | 'local' | 'mixed' = 'local';
      let totalConversations = 0;
      let avgSatisfaction = 0;
      let avgDuration = 0;
      let platformDistribution: { platform: string; count: number }[] = [];
      let recentActivity: DashboardMetrics['recentActivity'] = [];
      let weeklyData: DashboardMetrics['weeklyData'] = [];
      let agentPerformance: DashboardMetrics['agentPerformance'] = [];

      // Process ElevenLabs data if available
      if (elevenLabsData && !elevenLabsData.requiresSetup) {
        dataSource = 'elevenlabs';
        
        // API returns snake_case: total_conversations, avg_conversation_duration, satisfaction_score
        totalConversations = elevenLabsData.metrics?.total_conversations || elevenLabsData.metrics?.totalConversations || 0;
        avgSatisfaction = elevenLabsData.metrics?.satisfaction_score || elevenLabsData.metrics?.avgSatisfaction || 0;
        avgDuration = elevenLabsData.metrics?.avg_conversation_duration || elevenLabsData.metrics?.avgDuration || 0;

        // Process agent performance - API returns "perAgent" array
        const agentsArray = elevenLabsData.perAgent || elevenLabsData.agents;
        if (agentsArray && Array.isArray(agentsArray)) {
          agentPerformance = agentsArray.map((agent: any) => ({
            name: agent.name || 'Agent',
            conversations: agent.metrics?.total_conversations || agent.totalConversations || 0,
            satisfaction: agent.metrics?.satisfaction_score || agent.avgSatisfaction || 0,
            duration: agent.metrics?.avg_duration || agent.avgDuration || 0,
          }));
        }

        // Process chart data for weekly view - API returns "charts.conversations_over_time"
        const chartDaily = elevenLabsData.charts?.conversations_over_time || elevenLabsData.chartData?.daily;
        if (chartDaily && Array.isArray(chartDaily)) {
          const last7Days = chartDaily.slice(-7);
          const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
          const dayNames = dayKeys.map(k => t(`dashboard.charts.days.${k}`));
          weeklyData = last7Days.map((day: any) => {
            const date = new Date(day.date);
            return {
              name: dayNames[date.getDay()],
              conversations: day.conversations || 0,
              satisfaction: day.avgSatisfaction || 0,
            };
          });
        }
      }

      // Process conversations for recent activity and platform distribution
      if (conversationsData?.conversations && Array.isArray(conversationsData.conversations)) {
        const conversations = conversationsData.conversations;
        
        // Helper to parse conversation timestamps (handles both start_time and start_time_unix_secs)
        const parseConvDate = (c: any): Date => {
          if (c.start_time_unix_secs) return new Date(c.start_time_unix_secs * 1000);
          if (c.start_time) {
            const d = new Date(c.start_time);
            if (!isNaN(d.getTime())) return d;
          }
          if (c.created_at) return new Date(c.created_at);
          return new Date(0);
        };

        // Calculate today's conversations
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const conversationsToday = conversations.filter((c: any) => parseConvDate(c) >= today).length;

        // Calculate this week's conversations
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const conversationsThisWeek = conversations.filter((c: any) => parseConvDate(c) >= weekAgo).length;

        // Platform distribution
        const platformCounts: Record<string, number> = {};
        conversations.forEach((c: any) => {
          const platform = c.agent_name || 'ElevenLabs';
          platformCounts[platform] = (platformCounts[platform] || 0) + 1;
        });
        platformDistribution = Object.entries(platformCounts).map(([platform, count]) => ({
          platform,
          count,
        }));

        // Recent activity - filter out invalid dates
        recentActivity = conversations
          .filter((c: any) => parseConvDate(c).getTime() > 0)
          .slice(0, 10)
          .map((c: any) => ({
            id: c.conversation_id || c.id,
            type: 'conversation' as const,
            title: c.call_summary_title || `Conversation ${(c.conversation_id || c.id)?.substring(0, 8) || 'N/A'}`,
            timestamp: parseConvDate(c).toISOString(),
          }));

        // Generate weekly data if not from analytics
        if (weeklyData.length === 0) {
          const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map(k => t(`dashboard.charts.days.${k}`));
          const dayCounts: Record<string, { conversations: number; satisfaction: number[] }> = {};
          
          for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dayName = dayNames[date.getDay()];
            dayCounts[dayName] = { conversations: 0, satisfaction: [] };
          }

          conversations.forEach((c: any) => {
            const convDate = parseConvDate(c);
            const dayName = dayNames[convDate.getDay()];
            if (dayCounts[dayName]) {
              dayCounts[dayName].conversations++;
              if (c.analysis?.satisfaction_score) {
                dayCounts[dayName].satisfaction.push(c.analysis.satisfaction_score);
              }
            }
          });

          weeklyData = Object.entries(dayCounts).map(([name, data]) => ({
            name,
            conversations: data.conversations,
            satisfaction: data.satisfaction.length > 0 
              ? data.satisfaction.reduce((a, b) => a + b, 0) / data.satisfaction.length 
              : 0,
          }));
        }

        // Update total if not from analytics
        if (totalConversations === 0) {
          totalConversations = conversationsData.total || conversations.length;
        }

        // Calculate sentiment breakdown from conversations
        const sentimentBreakdown = { positive: 0, neutral: 0, negative: 0 };
        let resolvedCount = 0;
        let totalDuration = 0;
        const hourCounts: Record<number, number> = {};

        conversations.forEach((c: any) => {
          // Sentiment
          const sentiment = c.analysis?.overall_sentiment || 'neutral';
          if (sentiment === 'positive') sentimentBreakdown.positive++;
          else if (sentiment === 'negative') sentimentBreakdown.negative++;
          else sentimentBreakdown.neutral++;
          
          // Resolution
          if (c.status === 'done' || c.analysis?.call_successful === 'success' || c.call_successful === 'success') resolvedCount++;
          
          // Duration
          if (c.call_duration_secs) totalDuration += c.call_duration_secs;
          
          // Peak hours (from conversations as fallback)
          const hour = parseConvDate(c).getHours();
          if (!isNaN(hour)) {
            hourCounts[hour] = (hourCounts[hour] || 0) + 1;
          }
        });

        // Use analytics API peak_hours if available, otherwise use computed from conversations
        let peakHours: { hour: number; count: number }[] = [];
        if (elevenLabsData?.charts?.peak_hours && Array.isArray(elevenLabsData.charts.peak_hours)) {
          peakHours = elevenLabsData.charts.peak_hours
            .map((h: any) => ({ hour: h.hour, count: h.count }))
            .sort((a: any, b: any) => a.hour - b.hour);
        } else {
          peakHours = Object.entries(hourCounts)
            .map(([hour, count]) => ({ hour: parseInt(hour), count }))
            .sort((a, b) => a.hour - b.hour);
        }

        const resolutionRate = conversations.length > 0 
          ? Math.round((resolvedCount / conversations.length) * 100) 
          : 0;

        // Use AI insights for quality score if available, otherwise calculate from avgSatisfaction
        const qualityScore = aiInsights?.period7d?.avgSatisfaction 
          ? Math.round((aiInsights.period7d.avgSatisfaction / 10) * 100)
          : avgSatisfaction > 0 
            ? Math.round((avgSatisfaction / 5) * 100) 
            : 0;
        
        // Merge sentiment breakdown from AI insights if available
        const finalSentimentBreakdown = aiInsights?.period7d?.sentimentBreakdown 
          ? {
              positive: aiInsights.period7d.sentimentBreakdown.positive,
              neutral: aiInsights.period7d.sentimentBreakdown.neutral,
              negative: aiInsights.period7d.sentimentBreakdown.negative,
            }
          : sentimentBreakdown;

        return {
          totalConversations,
          conversationsToday,
          conversationsThisWeek,
          conversationsThisMonth: totalConversations,
          previousPeriodConversations: 0,
          conversationsTrend: elevenLabsData?.trends?.conversations_change || elevenLabsData?.trends?.conversationsTrend || 0,
          incomingMessages: totalConversations,
          previousPeriodMessages: 0,
          messagesTrend: 0,
          uniqueUsers: conversationsData.total || conversations.length,
          previousPeriodUsers: 0,
          usersTrend: 0,
          avgInteractions: 0,
          avgSatisfaction: Math.round(avgSatisfaction * 10) / 10,
          avgDuration: Math.round(avgDuration),
          activeClients: clientsRes.count || 0,
          totalAgents: agents.length,
          platformDistribution,
          recentActivity,
          lastUpdated: new Date().toISOString(),
          dataSource,
          weeklyData,
          agentPerformance,
          // Enhanced metrics - prefer AI insights when available
          resolutionRate,
          resolvedConversations: resolvedCount,
          sentimentBreakdown: finalSentimentBreakdown,
          peakHours,
          qualityScore,
          weeklyGrowth: elevenLabsData?.trends?.conversations_change || elevenLabsData?.trends?.conversationsTrend || 0,
          totalDurationMinutes: Math.round(totalDuration / 60),
          // Additional AI insights data
          aiInsightsAvailable: !!aiInsights,
          analysisCoverageRate: aiInsights?.coverageRate || 0,
          topSmartTags: aiInsights?.topTags || [],
          topImprovements: aiInsights?.topImprovements || [],
        };
      }

      // Fallback to local data
      return {
        ...defaultMetrics,
        activeClients: clientsRes.count || 0,
        totalAgents: agents.length,
        lastUpdated: new Date().toISOString(),
        dataSource: 'local',
      };
    },
    enabled: !!selectedOrgId,
    refetchInterval: 30000,
  });
};

// Hook for syncing ElevenLabs conversations
export const useSyncElevenLabsConversations = () => {
  return useQuery({
    queryKey: ['sync-elevenlabs-conversations'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('sync-elevenlabs-conversations', {
        body: { action: 'sync' }
      });
      
      if (error) throw error;
      return data;
    },
    enabled: false, // Manual trigger only
  });
};
