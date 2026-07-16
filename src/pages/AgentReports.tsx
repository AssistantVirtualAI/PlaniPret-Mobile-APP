import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { useAgentReports, AgentMetrics } from '@/hooks/useAgentReports';
import { useSyncElevenLabsConversations } from '@/hooks/useAgentAdvice';
import { useSendWeeklyReport } from '@/hooks/useWeeklyReport';
import { useOrganization } from '@/context/OrganizationContext';
import { AgentAIAdvice } from '@/components/agents/AgentAIAdvice';
import { GlobalAIAdvice } from '@/components/agents/GlobalAIAdvice';
import { DateRangeSelector } from '@/components/dashboard/DateRangeSelector';
import { ReportGenerator } from '@/components/reports/ReportGenerator';
import { useTranslation } from '@/hooks/useTranslation';
import { 
  RefreshCw, 
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Users,
  Clock,
  ThumbsUp,
  Smile,
  Meh,
  Frown,
  Target,
  Lightbulb,
  Tag,
  Activity,
  Sparkles,
  Download,
  CheckCircle,
  Database,
  Mail,
  Layers,
  AlertTriangle,
  Zap
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { subDays } from 'date-fns';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, AreaChart, Area, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';

const SENTIMENT_COLORS = {
  positive: '#22c55e',
  neutral: '#f59e0b',
  negative: '#ef4444',
};

const AgentReports = () => {
  const { t } = useTranslation();
  const { selectedOrg } = useOrganization();
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>({
    start: subDays(new Date(), 7),
    end: new Date()
  });
  
  const { data: reportsData, isLoading: isLoadingReports, refetch } = useAgentReports(
    selectedAgent !== 'all' ? selectedAgent : undefined,
    dateRange
  );

  const { mutate: syncConversations, isPending: isSyncing } = useSyncElevenLabsConversations();
  const { mutate: sendWeeklyReport, isPending: isSendingReport } = useSendWeeklyReport();

  // Fetch agents for filter
  const { data: agents } = useQuery({
    queryKey: ['agents-list', selectedOrg?.id],
    queryFn: async () => {
      if (!selectedOrg?.id) return [];
      const { data } = await supabase
        .from('agents_safe')
        .select('id, name')
        .eq('organization_id', selectedOrg.id);
      return data || [];
    },
    enabled: !!selectedOrg?.id
  });

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'down':
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      default:
        return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getTrendLabel = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up': return t('reports.trends.up');
      case 'down': return t('reports.trends.down');
      default: return t('reports.trends.stable');
    }
  };

  const renderAgentCard = (agent: AgentMetrics) => {
    const sentimentData = [
      { name: t('reports.sentiment.positive'), value: agent.sentimentDistribution.positive, color: SENTIMENT_COLORS.positive },
      { name: t('reports.sentiment.neutral'), value: agent.sentimentDistribution.neutral, color: SENTIMENT_COLORS.neutral },
      { name: t('reports.sentiment.negative'), value: agent.sentimentDistribution.negative, color: SENTIMENT_COLORS.negative },
    ].filter(d => d.value > 0);

    return (
      <Card key={agent.agentId} className="group relative overflow-hidden border-0 bg-gradient-to-br from-card to-card/80 shadow-lg hover:shadow-xl transition-all duration-300">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground font-bold text-lg">
                {agent.agentName.charAt(0).toUpperCase()}
              </div>
              <div>
                <CardTitle className="text-lg">{agent.agentName}</CardTitle>
                <Badge variant="secondary" className="text-xs mt-1">
                  {agent.platform}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted/50">
              {getTrendIcon(agent.recentTrend)}
              <span className="text-xs text-muted-foreground">
                {getTrendLabel(agent.recentTrend)}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-muted/30 space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                {t('reports.metrics.conversations')}
              </div>
              <p className="text-2xl font-bold">{agent.totalConversations}</p>
            </div>
            <div className="p-3 rounded-xl bg-muted/30 space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ThumbsUp className="h-3.5 w-3.5" />
                {t('reports.metrics.satisfaction')}
              </div>
              <p className="text-2xl font-bold">
                {agent.avgSatisfaction > 0 
                  ? <>{agent.avgSatisfaction.toFixed(1)}<span className="text-sm text-muted-foreground">/10</span></>
                  : <span className="text-muted-foreground text-lg">N/A</span>
                }
              </p>
            </div>
            <div className="p-3 rounded-xl bg-muted/30 space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {t('reports.metrics.avgDuration')}
              </div>
              <p className="text-lg font-semibold">{Math.round(agent.avgDuration / 60)}min</p>
            </div>
            <div className="p-3 rounded-xl bg-muted/30 space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Target className="h-3.5 w-3.5" />
                {agent.resolutionRate > 0 ? t('reports.metrics.resolution') : 'Success'}
              </div>
              <p className="text-lg font-semibold">
                {(agent.resolutionRate > 0 ? agent.resolutionRate : agent.successRate) > 0 
                  ? `${(agent.resolutionRate > 0 ? agent.resolutionRate : agent.successRate).toFixed(0)}%`
                  : <span className="text-muted-foreground">N/A</span>
                }
              </p>
            </div>
          </div>

          {/* Sentiment Distribution */}
          {sentimentData.length > 0 && (
            <div className="pt-3 border-t border-border/50">
              <p className="text-xs text-muted-foreground mb-2">{t('reports.metrics.sentiment')}</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 flex gap-0.5 h-2 rounded-full overflow-hidden bg-muted/30">
                  {agent.sentimentDistribution.positive > 0 && (
                    <div 
                      className="bg-green-500 transition-all" 
                      style={{ width: `${(agent.sentimentDistribution.positive / agent.totalConversations) * 100}%` }}
                    />
                  )}
                  {agent.sentimentDistribution.neutral > 0 && (
                    <div 
                      className="bg-yellow-500 transition-all" 
                      style={{ width: `${(agent.sentimentDistribution.neutral / agent.totalConversations) * 100}%` }}
                    />
                  )}
                  {agent.sentimentDistribution.negative > 0 && (
                    <div 
                      className="bg-red-500 transition-all" 
                      style={{ width: `${(agent.sentimentDistribution.negative / agent.totalConversations) * 100}%` }}
                    />
                  )}
                </div>
              </div>
              <div className="flex justify-between text-xs mt-2">
                <span className="text-green-500 flex items-center gap-1">
                  <Smile className="h-3 w-3" /> {agent.sentimentDistribution.positive}
                </span>
                <span className="text-yellow-500 flex items-center gap-1">
                  <Meh className="h-3 w-3" /> {agent.sentimentDistribution.neutral}
                </span>
                <span className="text-red-500 flex items-center gap-1">
                  <Frown className="h-3 w-3" /> {agent.sentimentDistribution.negative}
                </span>
              </div>
            </div>
          )}

          {/* Top Tags */}
          {agent.topTags.length > 0 && (
            <div className="pt-3 border-t border-border/50">
              <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <Tag className="h-3 w-3" /> {t('reports.frequentTags')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {agent.topTags.slice(0, 4).map(({ tag, count }) => (
                  <Badge key={tag} variant="outline" className="text-xs bg-muted/30">
                    {tag} ({count})
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Top Improvements */}
          {agent.topImprovements.length > 0 && (
            <div className="pt-3 border-t border-border/50">
              <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <Lightbulb className="h-3 w-3" /> {t('reports.suggestedImprovements')}
              </p>
              <ul className="space-y-1.5">
                {agent.topImprovements.slice(0, 3).map((imp, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                    <Zap className="h-3 w-3 text-primary mt-0.5 flex-shrink-0" />
                    <span className="line-clamp-1">{imp}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  // Prepare data for radar chart
  const radarData = reportsData?.agents.slice(0, 5).map(agent => ({
    agent: agent.agentName.slice(0, 10),
    [t('reports.metrics.satisfaction')]: agent.avgSatisfaction,
    [t('reports.metrics.resolution')]: agent.resolutionRate / 10,
    [t('reports.volume')]: Math.min(agent.totalConversations / 10, 10),
  })) || [];

  // Use real hourly distribution from reports data
  const hourlyData = reportsData?.hourlyDistribution || [];

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
              {t('reports.title')}
            </h1>
            <p className="text-muted-foreground mt-1">
              {t('reports.description')}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <DateRangeSelector 
              value={dateRange}
              onChange={setDateRange}
              showQuickButtons={true}
            />
            <Select value={selectedAgent} onValueChange={setSelectedAgent}>
              <SelectTrigger className="w-48 bg-card border-border/50">
                <SelectValue placeholder={t('reports.allAgents')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('reports.allAgents')}</SelectItem>
                {agents?.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ReportGenerator
              reportsData={reportsData}
              agents={agents || []}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
            />
            <Button 
              variant="outline" 
              onClick={() => sendWeeklyReport()}
              disabled={isSendingReport}
              className="bg-card border-border/50"
            >
              {isSendingReport ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
              {t('reports.email')}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => syncConversations({ 
                agentId: selectedAgent !== 'all' ? selectedAgent : undefined,
                mode: 'all' // Sync all historical conversations
              })}
              disabled={isSyncing}
              className="bg-card border-border/50"
              title={t('reports.syncAll')}
            >
              {isSyncing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              {t('reports.syncAll')}
            </Button>
            <Button variant="outline" size="icon" onClick={() => refetch()} className="bg-card border-border/50">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Data Source Indicator */}
        {reportsData && (
          <div className="flex items-center gap-3 text-sm">
            {reportsData.dataSource === 'platform' || reportsData.dataSource === 'mixed' ? (
              <Badge className="gap-1.5 bg-green-500/10 text-green-500 border-green-500/30 hover:bg-green-500/20">
                <CheckCircle className="h-3.5 w-3.5" />
                {t('reports.connectedToPlatforms')}
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1.5 text-muted-foreground">
                <Database className="h-3.5 w-3.5" />
                {t('reports.localData')}
              </Badge>
            )}
            {reportsData.usingFallbackLanguage && (
              <Badge variant="outline" className="gap-1.5 text-amber-600 border-amber-500/30 bg-amber-500/10">
                <AlertTriangle className="h-3.5 w-3.5" />
                {reportsData.dataLanguage === 'fr' ? t('reports.dataInFrench') : t('reports.dataInEnglish')}
              </Badge>
            )}
            {reportsData.globalMetrics.totalConversations > 0 && (
              <span className="text-muted-foreground">
                {reportsData.globalMetrics.totalConversations} {t('reports.conversations')} • {reportsData.globalMetrics.totalVoiceMinutes} {t('reports.voiceMinutes')}
              </span>
            )}
          </div>
        )}

        {/* Global Metrics */}
        {reportsData && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-blue-500/10 to-blue-600/5 shadow-lg">
              <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/10 rounded-full blur-2xl" />
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2 text-blue-500">
                  <Users className="h-4 w-4" />
                  {t('reports.totalConversations')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold">{reportsData.globalMetrics.totalConversations}</p>
              </CardContent>
            </Card>
            <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-green-500/10 to-green-600/5 shadow-lg">
              <div className="absolute top-0 right-0 w-20 h-20 bg-green-500/10 rounded-full blur-2xl" />
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2 text-green-500">
                  <ThumbsUp className="h-4 w-4" />
                  {t('reports.avgSatisfaction')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold">
                  {reportsData.globalMetrics.avgSatisfaction.toFixed(1)}
                  <span className="text-lg text-muted-foreground">/10</span>
                </p>
              </CardContent>
            </Card>
            <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-purple-500/10 to-purple-600/5 shadow-lg">
              <div className="absolute top-0 right-0 w-20 h-20 bg-purple-500/10 rounded-full blur-2xl" />
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2 text-purple-500">
                  <TrendingUp className="h-4 w-4" />
                  {t('reports.bestAgent')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-semibold truncate">
                  {reportsData.globalMetrics.bestPerformingAgent || '—'}
                </p>
              </CardContent>
            </Card>
            <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-orange-500/10 to-orange-600/5 shadow-lg">
              <div className="absolute top-0 right-0 w-20 h-20 bg-orange-500/10 rounded-full blur-2xl" />
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2 text-orange-500">
                  <Activity className="h-4 w-4" />
                  {t('reports.activeAgents')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold">{reportsData.agents.length}</p>
              </CardContent>
            </Card>
          </div>
        )}

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-muted/30 p-1">
            <TabsTrigger value="overview" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <BarChart3 className="h-4 w-4" />
              {t('reports.tabs.overview')}
            </TabsTrigger>
            <TabsTrigger value="performance" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Activity className="h-4 w-4" />
              {t('reports.tabs.performance')}
            </TabsTrigger>
            <TabsTrigger value="trends" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <TrendingUp className="h-4 w-4" />
              {t('reports.tabs.trends')}
            </TabsTrigger>
            <TabsTrigger value="hours" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Clock className="h-4 w-4" />
              {t('reports.tabs.peakHours')}
            </TabsTrigger>
            <TabsTrigger value="comparison" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Layers className="h-4 w-4" />
              {t('reports.tabs.comparison')}
            </TabsTrigger>
            <TabsTrigger value="ai-advice" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Sparkles className="h-4 w-4" />
              {t('reports.tabs.aiAdvice')}
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {isLoadingReports ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-80 w-full rounded-xl" />
                ))}
              </div>
            ) : reportsData?.agents.length === 0 ? (
              <Card className="border-0 bg-muted/30 shadow-lg">
                <CardContent className="pt-6 text-center py-16">
                  <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                    <BarChart3 className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-lg font-medium text-muted-foreground">{t('reports.noDataAvailable')}</p>
                  <p className="text-sm text-muted-foreground mt-1">{t('reports.statsAfterConversations')}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {reportsData?.agents.map(renderAgentCard)}
              </div>
            )}
          </TabsContent>

          {/* Performance Tab */}
          <TabsContent value="performance" className="space-y-6">
            {isLoadingReports ? (
              <Skeleton className="h-96 w-full rounded-xl" />
            ) : reportsData?.agents.length === 0 ? (
              <Card className="border-0 bg-muted/30 shadow-lg">
                <CardContent className="pt-6 text-center py-16">
                  <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                    <Activity className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-lg font-medium text-muted-foreground">{t('reports.noPerformanceData')}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Satisfaction vs Success Rate Comparison Chart */}
                <Card className="border-0 bg-card shadow-lg">
                  <CardHeader>
                    <CardTitle>{t('reports.satisfactionComparison')}</CardTitle>
                    <CardDescription>{t('reports.avgScoreByAgent')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={reportsData?.agents.map(a => ({
                        name: a.agentName.length > 12 ? a.agentName.slice(0, 12) + '...' : a.agentName,
                        // Show satisfaction if available, otherwise show success rate as proxy
                        [t('reports.metrics.satisfaction')]: a.avgSatisfaction > 0 ? parseFloat(a.avgSatisfaction.toFixed(1)) : null,
                        'Success Rate': a.successRate > 0 ? parseFloat((a.successRate / 10).toFixed(1)) : null, // Normalize to /10 scale
                      }))}>
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis domain={[0, 10]} />
                        <Tooltip 
                          formatter={(value, name) => {
                            if (value === null) return ['N/A', name];
                            return [name === 'Success Rate' ? `${((value as number) * 10).toFixed(0)}%` : `${value}/10`, name];
                          }}
                        />
                        <Legend />
                        <Bar dataKey={t('reports.metrics.satisfaction')} fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="Success Rate" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Resolution/Success Rate Chart */}
                <Card className="border-0 bg-card shadow-lg">
                  <CardHeader>
                    <CardTitle>{t('reports.resolutionRate')}</CardTitle>
                    <CardDescription>{t('reports.percentageByAgent')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {reportsData?.agents.map(agent => {
                        // Use resolution rate if available, otherwise use success rate from platform
                        const displayRate = agent.resolutionRate > 0 ? agent.resolutionRate : agent.successRate;
                        const rateLabel = agent.resolutionRate > 0 ? 'resolution' : 'success';
                        return (
                          <div key={agent.agentId} className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="font-medium">{agent.agentName}</span>
                              <span className="font-bold text-primary">
                                {displayRate > 0 ? `${displayRate.toFixed(0)}%` : 'N/A'}
                                {displayRate > 0 && rateLabel === 'success' && (
                                  <span className="text-xs text-muted-foreground ml-1">(success)</span>
                                )}
                              </span>
                            </div>
                            <Progress value={displayRate > 0 ? displayRate : 0} className="h-2" />
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Global Sentiment Distribution */}
                <Card className="border-0 bg-card shadow-lg lg:col-span-2">
                  <CardHeader>
                    <CardTitle>{t('reports.globalSentimentDistribution')}</CardTitle>
                    <CardDescription>{t('reports.distributionAcrossAgents')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-center gap-12 flex-wrap">
                      <ResponsiveContainer width={220} height={220}>
                        <PieChart>
                          <Pie
                            data={[
                              { name: t('reports.sentiment.positive'), value: reportsData?.agents.reduce((sum, a) => sum + a.sentimentDistribution.positive, 0) || 0 },
                              { name: t('reports.sentiment.neutral'), value: reportsData?.agents.reduce((sum, a) => sum + a.sentimentDistribution.neutral, 0) || 0 },
                              { name: t('reports.sentiment.negative'), value: reportsData?.agents.reduce((sum, a) => sum + a.sentimentDistribution.negative, 0) || 0 },
                            ]}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={85}
                            dataKey="value"
                          >
                            <Cell fill={SENTIMENT_COLORS.positive} />
                            <Cell fill={SENTIMENT_COLORS.neutral} />
                            <Cell fill={SENTIMENT_COLORS.negative} />
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="w-4 h-4 rounded-full bg-green-500" />
                          <span className="text-sm">{t('reports.sentiment.positive')}: <strong>{reportsData?.agents.reduce((sum, a) => sum + a.sentimentDistribution.positive, 0)}</strong></span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-4 h-4 rounded-full bg-yellow-500" />
                          <span className="text-sm">{t('reports.sentiment.neutral')}: <strong>{reportsData?.agents.reduce((sum, a) => sum + a.sentimentDistribution.neutral, 0)}</strong></span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-4 h-4 rounded-full bg-red-500" />
                          <span className="text-sm">{t('reports.sentiment.negative')}: <strong>{reportsData?.agents.reduce((sum, a) => sum + a.sentimentDistribution.negative, 0)}</strong></span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* Trends Tab */}
          <TabsContent value="trends" className="space-y-6">
            <Card className="border-0 bg-card shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  {t('reports.conversationEvolution')}
                </CardTitle>
                <CardDescription>
                  {reportsData?.dailyTrends && reportsData.dailyTrends.length > 0 
                    ? `${reportsData.dailyTrends.length} ${t('reports.daysOfData')}`
                    : t('reports.last7DaysTrend')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {reportsData?.dailyTrends && reportsData.dailyTrends.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={reportsData.dailyTrends}>
                      {/* Use date for longer periods, day for 7 days or less */}
                      <XAxis 
                        dataKey={reportsData.dailyTrends.length > 7 ? "date" : "day"} 
                        tick={{ fontSize: 11 }}
                        interval={reportsData.dailyTrends.length > 14 ? Math.floor(reportsData.dailyTrends.length / 10) : 0}
                      />
                      <YAxis />
                      <Tooltip 
                        formatter={(value, name) => [value, name === 'conversations' ? t('reports.conversations') : name]}
                        labelFormatter={(label, payload) => {
                          if (payload && payload[0]?.payload) {
                            return `${payload[0].payload.day} ${payload[0].payload.date}`;
                          }
                          return label;
                        }}
                      />
                      <Legend />
                      <Area type="monotone" dataKey="conversations" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" name={t('reports.conversations')} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    <p>{t('reports.noDataForPeriod')}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-0 bg-card shadow-lg">
              <CardHeader>
                <CardTitle>{t('reports.satisfactionEvolution')}</CardTitle>
                <CardDescription>{t('reports.avgScoreByDay')}</CardDescription>
              </CardHeader>
              <CardContent>
                {reportsData?.dailyTrends && reportsData.dailyTrends.some(d => d.satisfaction > 0) ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={reportsData.dailyTrends}>
                      <XAxis 
                        dataKey={reportsData.dailyTrends.length > 7 ? "date" : "day"} 
                        tick={{ fontSize: 11 }}
                        interval={reportsData.dailyTrends.length > 14 ? Math.floor(reportsData.dailyTrends.length / 10) : 0}
                      />
                      <YAxis domain={[0, 10]} />
                      <Tooltip 
                        formatter={(value) => [`${value}/10`, t('reports.metrics.satisfaction')]}
                      />
                      <Area type="monotone" dataKey="satisfaction" stroke="#22c55e" fill="#22c55e20" name={t('reports.metrics.satisfaction')} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[250px] flex items-center justify-center flex-col gap-2 text-muted-foreground">
                    <p>{t('reports.noSatisfactionData')}</p>
                    <p className="text-xs">{t('reports.satisfactionFromLocalData')}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Peak Hours Tab */}
          <TabsContent value="hours" className="space-y-6">
            <Card className="border-0 bg-card shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  {t('reports.hourlyDistribution')}
                </CardTitle>
                <CardDescription>{t('reports.conversationsByHour')}</CardDescription>
              </CardHeader>
              <CardContent>
                {hourlyData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={hourlyData}>
                      <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="conversations" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    <p>{t('reports.noDataAvailable')}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-3">
              <Card className="border-0 bg-gradient-to-br from-green-500/10 to-green-600/5 shadow-lg">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-green-600">{t('reports.peakHour')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-4xl font-bold">{reportsData?.peakHour || '—'}</p>
                  <p className="text-sm text-muted-foreground mt-1">{t('reports.mostActivity')}</p>
                </CardContent>
              </Card>
              <Card className="border-0 bg-gradient-to-br from-blue-500/10 to-blue-600/5 shadow-lg">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-blue-600">{t('reports.quietHour')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-4xl font-bold">{reportsData?.quietHour || '—'}</p>
                  <p className="text-sm text-muted-foreground mt-1">{t('reports.leastActivity')}</p>
                </CardContent>
              </Card>
              <Card className="border-0 bg-gradient-to-br from-purple-500/10 to-purple-600/5 shadow-lg">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-purple-600">{t('reports.busiestDay')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-4xl font-bold">{reportsData?.busiestDay || '—'}</p>
                  <p className="text-sm text-muted-foreground mt-1">{t('reports.onAverage')}</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Comparison Tab */}
          <TabsContent value="comparison" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Radar Chart */}
              <Card className="border-0 bg-card shadow-lg">
                <CardHeader>
                  <CardTitle>{t('reports.multiDimensionalComparison')}</CardTitle>
                  <CardDescription>{t('reports.relativePerformance')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <RadarChart data={radarData}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="agent" tick={{ fontSize: 10 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 10]} />
                      <Radar name={t('reports.metrics.satisfaction')} dataKey={t('reports.metrics.satisfaction')} stroke="#22c55e" fill="#22c55e" fillOpacity={0.3} />
                      <Radar name={t('reports.metrics.resolution')} dataKey={t('reports.metrics.resolution')} stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                      <Radar name={t('reports.volume')} dataKey={t('reports.volume')} stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.3} />
                      <Legend />
                    </RadarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Comparison Table */}
              <Card className="border-0 bg-card shadow-lg">
                <CardHeader>
                  <CardTitle>{t('reports.comparisonTable')}</CardTitle>
                  <CardDescription>{t('reports.detailedMetricsByAgent')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {reportsData?.agents.map((agent, i) => (
                      <div key={agent.agentId} className="flex items-center justify-between p-4 bg-muted/30 rounded-xl hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/60 text-primary-foreground flex items-center justify-center text-sm font-bold">
                            {i + 1}
                          </span>
                          <span className="font-medium">{agent.agentName}</span>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-muted-foreground">{agent.totalConversations} {t('reports.conv')}</span>
                          <Badge variant={agent.avgSatisfaction >= 7 ? 'default' : agent.avgSatisfaction >= 5 ? 'secondary' : 'destructive'}>
                            {agent.avgSatisfaction.toFixed(1)}/10
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* AI Advice Tab */}
          <TabsContent value="ai-advice" className="space-y-6">
            {selectedAgent === 'all' ? (
              <GlobalAIAdvice />
            ) : (
              <AgentAIAdvice 
                agentId={selectedAgent} 
                agentName={agents?.find(a => a.id === selectedAgent)?.name || 'Agent'} 
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default AgentReports;
