import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { format, subDays, startOfDay, getHours, getDay } from 'date-fns';
import { useLanguage } from '@/context/LanguageContext';

export interface AgentMetrics {
  agentId: string;
  agentName: string;
  platform: string;
  totalConversations: number;
  avgSatisfaction: number;
  avgDuration: number;
  sentimentDistribution: {
    positive: number;
    neutral: number;
    negative: number;
  };
  resolutionRate: number;
  successRate: number;
  topTags: { tag: string; count: number }[];
  topImprovements: string[];
  recentTrend: 'up' | 'down' | 'stable';
  dataSource: 'platform' | 'local' | 'mixed';
}

export interface DailyTrend {
  day: string;
  date: string;
  dateKey: string; // YYYY-MM-DD for sorting/grouping
  conversations: number;
  satisfaction: number;
}

export interface HourlyDistribution {
  hour: string;
  conversations: number;
}

export interface AgentReportsData {
  agents: AgentMetrics[];
  globalMetrics: {
    totalConversations: number;
    avgSatisfaction: number;
    totalVoiceMinutes: number;
    successRate: number;
    bestPerformingAgent: string | null;
    worstPerformingAgent: string | null;
  };
  dailyTrends: DailyTrend[];
  hourlyDistribution: HourlyDistribution[];
  peakHour: string;
  quietHour: string;
  busiestDay: string;
  dataSource: 'platform' | 'local' | 'mixed';
  lastSync?: string;
  usingFallbackLanguage?: boolean;
  dataLanguage?: string;
}

interface DateRange {
  start: Date;
  end: Date;
}

const DAY_NAMES_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const FULL_DAY_NAMES_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const FULL_DAY_NAMES_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

// Helper to calculate timeframe string from date range
function getTimeframe(dateRange?: DateRange): string {
  if (!dateRange) return '7days';
  const diffDays = Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 1) return '24hours';
  if (diffDays <= 7) return '7days';
  if (diffDays <= 30) return '30days';
  if (diffDays <= 90) return '90days';
  return 'all';
}

export function useAgentReports(selectedAgentId?: string, dateRange?: DateRange) {
  const { selectedOrg } = useOrganization();
  const { language } = useLanguage();

  const dayNames = language === 'fr' ? DAY_NAMES_FR : DAY_NAMES_EN;
  const fullDayNames = language === 'fr' ? FULL_DAY_NAMES_FR : FULL_DAY_NAMES_EN;

  return useQuery({
    queryKey: ['agent-reports', selectedOrg?.id, selectedAgentId, dateRange?.start?.toISOString(), dateRange?.end?.toISOString(), language],
    queryFn: async (): Promise<AgentReportsData> => {
      if (!selectedOrg?.id) {
        return getEmptyReportsData(language);
      }

      // Fetch agents with their platform info
      const { data: agents } = await supabase
        .from('agents_safe')
        .select('id, name, platform, platform_agent_id')
        .eq('organization_id', selectedOrg.id);

      if (!agents || agents.length === 0) {
        return getEmptyReportsData(language);
      }

      // Filter by selected agent if provided
      const targetAgents = selectedAgentId && selectedAgentId !== 'all'
        ? agents.filter(a => a.id === selectedAgentId)
        : agents;

      // Fetch local conversations with date filtering
      let conversationsQuery = supabase
        .from('conversations')
        .select('id, agent_id, satisfaction_score, sentiment, duration, smart_tags, resolution_status, created_at, platform')
        .eq('organization_id', selectedOrg.id);

      // Apply date range filter
      if (dateRange) {
        conversationsQuery = conversationsQuery
          .gte('created_at', dateRange.start.toISOString())
          .lte('created_at', dateRange.end.toISOString());
      }

      if (selectedAgentId && selectedAgentId !== 'all') {
        conversationsQuery = conversationsQuery.eq('agent_id', selectedAgentId);
      }

      const { data: conversations } = await conversationsQuery;

      // Fetch all insights (we'll prioritize by language in processing)
      let insightsQuery = supabase
        .from('agent_insights')
        .select('agent_id, satisfaction_score, overall_sentiment, improvements, smart_tags, analyzed_at, language')
        .eq('organization_id', selectedOrg.id);

      // Apply date range filter to insights
      if (dateRange) {
        insightsQuery = insightsQuery
          .gte('analyzed_at', dateRange.start.toISOString())
          .lte('analyzed_at', dateRange.end.toISOString());
      }

      if (selectedAgentId && selectedAgentId !== 'all') {
        insightsQuery = insightsQuery.eq('agent_id', selectedAgentId);
      }

      const { data: allInsights } = await insightsQuery;

      // Separate insights by language preference
      const preferredLangInsights = allInsights?.filter(i => i.language === language) || [];
      const fallbackInsights = allInsights?.filter(i => i.language !== language) || [];
      
      // Use preferred language insights first, fallback to others if none
      const insights = preferredLangInsights.length > 0 ? preferredLangInsights : fallbackInsights;
      const usingFallbackLanguage = preferredLangInsights.length === 0 && fallbackInsights.length > 0;
      const dataLanguage = usingFallbackLanguage ? (fallbackInsights[0]?.language || 'fr') : language;

      const timeframe = getTimeframe(dateRange);

      // Fetch analytics for each agent based on their platform
      const platformAnalyticsPromises = targetAgents.map(async (agent) => {
        try {
          if (agent.platform === 'elevenlabs' && agent.platform_agent_id) {
            const { data, error } = await supabase.functions.invoke('elevenlabs-convai-analytics', {
              body: { 
                agentId: agent.platform_agent_id,
                timeframe,
                includeCharts: true,
                organizationId: selectedOrg.id
              }
            });
            
            if (error) {
              console.warn(`Failed to fetch ElevenLabs analytics for ${agent.name}:`, error);
              return { agentId: agent.id, platform: 'elevenlabs', data: null };
            }
            
            return { agentId: agent.id, platform: 'elevenlabs', data };
          } else if (agent.platform === 'retell' && agent.platform_agent_id) {
            const { data, error } = await supabase.functions.invoke('retell-proxy', {
              body: { 
                action: 'getAnalytics',
                agentId: agent.platform_agent_id,
                timeframe: timeframe === '24hours' ? '24h' : timeframe === '7days' ? '7d' : timeframe === '30days' ? '30d' : timeframe === '90days' ? '90d' : 'all',
                organizationId: selectedOrg.id
              }
            });
            
            if (error) {
              console.warn(`Failed to fetch Retell analytics for ${agent.name}:`, error);
              return { agentId: agent.id, platform: 'retell', data: null };
            }
            
            // Normalize Retell analytics to match ElevenLabs structure
            const retellData = data?.data || data;
            return { 
              agentId: agent.id, 
              platform: 'retell', 
              data: {
                metrics: {
                  total_conversations: retellData?.totalCalls || 0,
                  successful_conversations: retellData?.completedCalls || 0,
                  failed_conversations: (retellData?.totalCalls || 0) - (retellData?.completedCalls || 0),
                  avg_duration: retellData?.avgDuration || 0,
                  total_duration: retellData?.totalDuration || 0,
                  success_rate: retellData?.successRate || 0,
                },
                charts: {
                  conversations_over_time: retellData?.callsByDay 
                    ? Object.entries(retellData.callsByDay).map(([date, count]) => ({ date, count }))
                    : [],
                  peak_hours: [],
                }
              }
            };
          } else if (agent.platform === 'vapi' && agent.platform_agent_id) {
            // Add VAPI support if needed
            return { agentId: agent.id, platform: 'vapi', data: null };
          }
          
          return { agentId: agent.id, platform: agent.platform, data: null };
        } catch (err) {
          console.warn(`Error fetching analytics for ${agent.name}:`, err);
          return { agentId: agent.id, platform: agent.platform, data: null };
        }
      });

      const platformAnalyticsResults = await Promise.all(platformAnalyticsPromises);
      const platformAnalyticsMap = new Map(
        platformAnalyticsResults.map(r => [r.agentId, r])
      );

      // Aggregate charts from all platforms
      let aggregatedDailyData: Record<string, number> = {};
      let aggregatedHourlyData: Record<number, number> = {};
      
      // First, try to use platform data for charts
      for (const result of platformAnalyticsResults) {
        if (result.data?.charts?.conversations_over_time) {
          for (const point of result.data.charts.conversations_over_time) {
            const date = point.date || point.timestamp;
            if (date) {
              aggregatedDailyData[date] = (aggregatedDailyData[date] || 0) + (point.count || point.value || 0);
            }
          }
        }
        if (result.data?.charts?.peak_hours) {
          for (const point of result.data.charts.peak_hours) {
            const hour = point.hour;
            if (hour !== undefined) {
              aggregatedHourlyData[hour] = (aggregatedHourlyData[hour] || 0) + (point.count || point.value || 0);
            }
          }
        }
      }

      // If no platform data, fall back to local conversations
      let dailyTrends: DailyTrend[] = [];
      let hourlyDistribution: HourlyDistribution[] = [];
      let peakHour = '—';
      let quietHour = '—';

      if (Object.keys(aggregatedDailyData).length > 0) {
        // Use aggregated platform data
        dailyTrends = Object.entries(aggregatedDailyData)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([dateStr, count]) => {
            const d = new Date(dateStr);
            return {
              day: dayNames[d.getDay()],
              date: d.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: '2-digit', month: '2-digit' }),
              dateKey: dateStr,
              conversations: count,
              satisfaction: 0,
            };
          });
        
        // Keep only last entries based on timeframe - more points for longer periods
        const maxPoints = timeframe === 'all' ? 60 : timeframe === '90days' ? 30 : timeframe === '30days' ? 30 : 7;
        if (dailyTrends.length > maxPoints) {
          dailyTrends = dailyTrends.slice(-maxPoints);
        }
      } else if (conversations && conversations.length > 0) {
        // Use local data - calculate based on actual date range
        dailyTrends = calculateDailyTrends(conversations, dayNames, language, dateRange);
      }

      if (Object.keys(aggregatedHourlyData).length > 0) {
        // Use aggregated platform data for hourly distribution
        hourlyDistribution = [];
        for (let h = 0; h < 24; h++) {
          hourlyDistribution.push({
            hour: `${h}h`,
            conversations: aggregatedHourlyData[h] || 0,
          });
        }
        
        // Find peak and quiet hours
        const maxHour = Object.entries(aggregatedHourlyData).reduce((max, [h, c]) => c > max.count ? { hour: parseInt(h), count: c } : max, { hour: 0, count: 0 });
        const minHour = Object.entries(aggregatedHourlyData).reduce((min, [h, c]) => c < min.count ? { hour: parseInt(h), count: c } : min, { hour: 0, count: Infinity });
        peakHour = `${maxHour.hour}h`;
        quietHour = `${minHour.hour}h`;
      } else if (conversations && conversations.length > 0) {
        const hourlyResult = calculateHourlyDistribution(conversations);
        hourlyDistribution = hourlyResult.hourlyDistribution;
        peakHour = hourlyResult.peakHour;
        quietHour = hourlyResult.quietHour;
      }

      // Calculate busiest day
      const busiestDay = calculateBusiestDay(conversations || [], fullDayNames);

      // Build agent metrics combining local + platform data
      const agentMetrics: AgentMetrics[] = targetAgents.map(agent => {
        const agentConversations = conversations?.filter(c => c.agent_id === agent.id) || [];
        const agentInsights = insights?.filter(i => i.agent_id === agent.id) || [];
        const platformResult = platformAnalyticsMap.get(agent.id);
        const platformData = platformResult?.data;

        // Use platform data if available, otherwise use local data
        let totalConversations = agentConversations.length;
        let avgSatisfaction = 0;
        let avgDuration = 0;
        let successRate = 0;
        let dataSource: 'platform' | 'local' | 'mixed' = 'local';

        if (platformData?.metrics) {
          // Prefer platform data for totals
          totalConversations = platformData.metrics.total_conversations || 0;
          avgDuration = platformData.metrics.avg_duration || 0;
          successRate = platformData.metrics.success_rate || 0;
          dataSource = agentConversations.length > 0 ? 'mixed' : 'platform';
        }

        // Calculate satisfaction from local conversations first
        if (agentConversations.length > 0) {
          const scores = agentConversations.filter(c => c.satisfaction_score).map(c => Number(c.satisfaction_score));
          avgSatisfaction = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
        }

        // Fallback: Use agent_insights satisfaction if no local conversation data or zero
        if (avgSatisfaction === 0 && agentInsights.length > 0) {
          const insightScores = agentInsights
            .filter(i => i.satisfaction_score !== null && i.satisfaction_score !== undefined)
            .map(i => Number(i.satisfaction_score));
          if (insightScores.length > 0) {
            avgSatisfaction = insightScores.reduce((a, b) => a + b, 0) / insightScores.length;
          }
        }

        // Duration from local if not from platform
        if (!platformData?.metrics && agentConversations.length > 0) {
          const durations = agentConversations.filter(c => c.duration).map(c => c.duration as number);
          avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
        }

        // Sentiment distribution
        const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
        agentConversations.forEach(c => {
          const sentiment = c.sentiment?.toLowerCase() || 'neutral';
          if (sentiment.includes('positif') || sentiment === 'positive') {
            sentimentCounts.positive++;
          } else if (sentiment.includes('négatif') || sentiment === 'negative') {
            sentimentCounts.negative++;
          } else {
            sentimentCounts.neutral++;
          }
        });

        agentInsights.forEach(i => {
          const sentiment = i.overall_sentiment?.toLowerCase() || '';
          if (sentiment.includes('positif') || sentiment === 'positive') {
            sentimentCounts.positive++;
          } else if (sentiment.includes('négatif') || sentiment === 'negative') {
            sentimentCounts.negative++;
          }
        });

        // Resolution rate
        const resolved = agentConversations.filter(c => c.resolution_status === 'resolved').length;
        const resolutionRate = agentConversations.length > 0 ? (resolved / agentConversations.length) * 100 : 0;

        // Success rate based on positive sentiment if not from platform
        if (!platformData?.metrics) {
          successRate = totalConversations > 0 
            ? ((sentimentCounts.positive / totalConversations) * 100) 
            : 0;
        }

        // Top tags
        const tagCounts: Record<string, number> = {};
        agentConversations.forEach(c => {
          (c.smart_tags || []).forEach(tag => {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          });
        });
        agentInsights.forEach(i => {
          (i.smart_tags || []).forEach(tag => {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          });
        });
        const topTags = Object.entries(tagCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([tag, count]) => ({ tag, count }));

        // Top improvements
        const allImprovements: string[] = [];
        agentInsights.forEach(i => {
          const improvements = i.improvements as any[];
          if (Array.isArray(improvements)) {
            improvements.forEach(imp => {
              if (typeof imp === 'string') {
                allImprovements.push(imp);
              } else if (imp?.suggestion) {
                allImprovements.push(imp.suggestion);
              }
            });
          }
        });
        const improvementCounts: Record<string, number> = {};
        allImprovements.forEach(imp => {
          improvementCounts[imp] = (improvementCounts[imp] || 0) + 1;
        });
        const topImprovements = Object.entries(improvementCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([imp]) => imp);

        // Recent trend
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        
        const recentConversations = agentConversations.filter(c => new Date(c.created_at) >= sevenDaysAgo);
        const previousConversations = agentConversations.filter(c => {
          const date = new Date(c.created_at);
          return date >= fourteenDaysAgo && date < sevenDaysAgo;
        });

        const recentAvgSat = recentConversations
          .filter(c => c.satisfaction_score)
          .reduce((sum, c) => sum + Number(c.satisfaction_score), 0) / (recentConversations.length || 1);
        const prevAvgSat = previousConversations
          .filter(c => c.satisfaction_score)
          .reduce((sum, c) => sum + Number(c.satisfaction_score), 0) / (previousConversations.length || 1);

        let recentTrend: 'up' | 'down' | 'stable' = 'stable';
        if (recentAvgSat > prevAvgSat + 0.5) recentTrend = 'up';
        else if (recentAvgSat < prevAvgSat - 0.5) recentTrend = 'down';

        return {
          agentId: agent.id,
          agentName: agent.name,
          platform: agent.platform || 'unknown',
          totalConversations,
          avgSatisfaction,
          avgDuration,
          sentimentDistribution: sentimentCounts,
          resolutionRate,
          successRate,
          topTags,
          topImprovements,
          recentTrend,
          dataSource,
        };
      });

      // Global metrics - sum from all agents
      const totalConversations = agentMetrics.reduce((sum, a) => sum + a.totalConversations, 0);
      
      // Calculate weighted average satisfaction based on conversation count
      const agentsWithSatisfaction = agentMetrics.filter(a => a.avgSatisfaction > 0);
      const totalWeightedSat = agentsWithSatisfaction.reduce(
        (sum, a) => sum + (a.avgSatisfaction * Math.max(a.totalConversations, 1)), 0
      );
      const totalWeight = agentsWithSatisfaction.reduce(
        (sum, a) => sum + Math.max(a.totalConversations, 1), 0
      );
      const avgSatisfaction = totalWeight > 0 ? totalWeightedSat / totalWeight : 0;

      // Calculate total voice minutes from platform data
      let totalVoiceMinutes = 0;
      for (const result of platformAnalyticsResults) {
        if (result.data?.metrics?.total_duration) {
          totalVoiceMinutes += Math.round(result.data.metrics.total_duration / 60);
        }
      }
      // Fallback to calculated from agent metrics
      if (totalVoiceMinutes === 0) {
        totalVoiceMinutes = Math.round(agentMetrics.reduce((sum, a) => sum + (a.avgDuration * a.totalConversations / 60), 0));
      }

      const globalSuccessRate = agentMetrics.length > 0 
        ? agentMetrics.reduce((sum, a) => sum + a.successRate, 0) / agentMetrics.length 
        : 0;

      const sortedByPerformance = [...agentMetrics].sort((a, b) => b.avgSatisfaction - a.avgSatisfaction);
      const bestPerformingAgent = sortedByPerformance[0]?.agentName || null;
      const worstPerformingAgent = sortedByPerformance.length > 1 
        ? sortedByPerformance[sortedByPerformance.length - 1]?.agentName 
        : null;

      // Determine overall data source
      const hasPlatformData = agentMetrics.some(a => a.dataSource === 'platform' || a.dataSource === 'mixed');
      const hasLocalData = agentMetrics.some(a => a.dataSource === 'local' || a.dataSource === 'mixed');
      const overallDataSource: 'platform' | 'local' | 'mixed' = 
        hasPlatformData && hasLocalData ? 'mixed' : 
        hasPlatformData ? 'platform' : 'local';

      return {
        agents: agentMetrics,
        globalMetrics: {
          totalConversations,
          avgSatisfaction,
          totalVoiceMinutes,
          successRate: globalSuccessRate,
          bestPerformingAgent,
          worstPerformingAgent,
        },
        dailyTrends,
        hourlyDistribution,
        peakHour,
        quietHour,
        busiestDay,
        dataSource: overallDataSource,
        lastSync: new Date().toISOString(),
        usingFallbackLanguage,
        dataLanguage,
      };
    },
    enabled: !!selectedOrg?.id,
    staleTime: 2 * 60 * 1000,
  });
}

function calculateDailyTrends(conversations: any[], dayNames: string[], language: string, dateRange?: DateRange): DailyTrend[] {
  const trends: DailyTrend[] = [];
  const now = new Date();
  
  // Calculate number of days to show based on date range
  let daysToShow = 7;
  if (dateRange) {
    const diffDays = Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24));
    daysToShow = Math.min(diffDays, 60); // Cap at 60 days for performance
  }

  for (let i = daysToShow - 1; i >= 0; i--) {
    const date = subDays(now, i);
    const dayStart = startOfDay(date);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const dayConversations = conversations.filter(c => {
      const convDate = new Date(c.created_at);
      return convDate >= dayStart && convDate < dayEnd;
    });

    const satisfactionScores = dayConversations
      .filter(c => c.satisfaction_score)
      .map(c => Number(c.satisfaction_score));

    const avgSatisfaction = satisfactionScores.length > 0
      ? satisfactionScores.reduce((a, b) => a + b, 0) / satisfactionScores.length
      : 0;

    trends.push({
      day: dayNames[getDay(date)],
      date: format(date, 'dd/MM'),
      dateKey: format(date, 'yyyy-MM-dd'),
      conversations: dayConversations.length,
      satisfaction: parseFloat(avgSatisfaction.toFixed(1)),
    });
  }

  return trends;
}

function calculateHourlyDistribution(conversations: any[]): {
  hourlyDistribution: HourlyDistribution[];
  peakHour: string;
  quietHour: string;
} {
  const hourCounts: Record<number, number> = {};
  
  for (let i = 0; i < 24; i++) {
    hourCounts[i] = 0;
  }

  conversations.forEach(conv => {
    const hour = getHours(new Date(conv.created_at));
    hourCounts[hour]++;
  });

  const hourlyDistribution: HourlyDistribution[] = Object.entries(hourCounts).map(([hour, count]) => ({
    hour: `${hour}h`,
    conversations: count,
  }));

  const sortedByCount = Object.entries(hourCounts).sort((a, b) => b[1] - a[1]);
  const peakHour = sortedByCount[0] ? `${sortedByCount[0][0]}h` : '—';
  const quietHour = sortedByCount[sortedByCount.length - 1] ? `${sortedByCount[sortedByCount.length - 1][0]}h` : '—';

  return { hourlyDistribution, peakHour, quietHour };
}

function calculateBusiestDay(conversations: any[], fullDayNames: string[]): string {
  if (conversations.length === 0) return '—';

  const dayCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

  conversations.forEach(conv => {
    const day = getDay(new Date(conv.created_at));
    dayCounts[day]++;
  });

  const maxDay = Object.entries(dayCounts).reduce((max, [day, count]) => 
    count > max.count ? { day: parseInt(day), count } : max, 
    { day: 0, count: 0 }
  );

  return fullDayNames[maxDay.day] || '—';
}

function getEmptyReportsData(language: string): AgentReportsData {
  return {
    agents: [],
    globalMetrics: {
      totalConversations: 0,
      avgSatisfaction: 0,
      totalVoiceMinutes: 0,
      successRate: 0,
      bestPerformingAgent: null,
      worstPerformingAgent: null,
    },
    dailyTrends: [],
    hourlyDistribution: [],
    peakHour: '—',
    quietHour: '—',
    busiestDay: '—',
    dataSource: 'local',
  };
}
