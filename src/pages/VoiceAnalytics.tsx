import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { StatCard } from '@/components/StatCard';
import { ChartCard } from '@/components/ChartCard';
import { Users, Clock, Star, Phone, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAllAgentsAnalytics } from '@/hooks/useAllAgentsAnalytics';
import { SetupIntegrationCard } from '@/components/SetupIntegrationCard';
import { StatCardSkeleton, ChartCardSkeleton } from '@/components/LoadingSkeleton';
import { AnalyticsExport } from '@/components/exports/AnalyticsExport';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/hooks/useTranslation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const VoiceAnalytics = () => {
  const { t } = useTranslation();
  const [timeframe, setTimeframe] = useState('7days');
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(undefined);
  
  const { data: analytics, isLoading, error } = useAllAgentsAnalytics(timeframe, selectedAgentId);

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}m ${secs}s`;
  };

  const stats = (analytics && !analytics.requiresSetup) ? [
    {
      title: t('analytics.stats.totalConversations'),
      value: analytics.metrics.total_conversations.toString(),
      change: `${analytics.trends.conversations_change > 0 ? '+' : ''}${analytics.trends.conversations_change.toFixed(1)}%`,
      changeType: analytics.trends.conversations_change >= 0 ? 'positive' as const : 'negative' as const,
      icon: Phone,
      trend: [45, 52, 48, 65, 58, 72, 68],
    },
    {
      title: t('analytics.stats.avgDuration'),
      value: formatDuration(analytics.metrics.avg_conversation_duration),
      change: `${analytics.trends.duration_change > 0 ? '+' : ''}${analytics.trends.duration_change.toFixed(1)}%`,
      changeType: analytics.trends.duration_change >= 0 ? 'positive' as const : 'negative' as const,
      icon: Clock,
      trend: [30, 42, 38, 55, 48, 62, 58],
    },
    {
      title: t('analytics.stats.satisfaction'),
      value: `${analytics.metrics.satisfaction_score.toFixed(1)}/5`,
      change: `${analytics.trends.satisfaction_change > 0 ? '+' : ''}${analytics.trends.satisfaction_change.toFixed(1)}`,
      changeType: analytics.trends.satisfaction_change >= 0 ? 'positive' as const : 'negative' as const,
      icon: Star,
      trend: [75, 78, 80, 82, 81, 85, 87],
    },
    {
      title: t('analytics.stats.successRate'),
      value: `${analytics.metrics.success_rate.toFixed(1)}%`,
      change: `${analytics.trends.success_rate_change > 0 ? '+' : ''}${analytics.trends.success_rate_change.toFixed(1)}%`,
      changeType: analytics.trends.success_rate_change >= 0 ? 'positive' as const : 'negative' as const,
      icon: TrendingUp,
      trend: [40, 48, 45, 58, 52, 65, 70],
    },
  ] : [];

  const agentChartData = analytics?.charts?.per_agent || [];
  const conversationsOverTime = analytics?.charts?.conversations_over_time || [];
  const satisfactionTrend = analytics?.charts?.satisfaction_trend || [];

  return (
    <AppLayout>
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-4xl font-bold mb-2 gradient-text">{t('analytics.title')}</h1>
            <p className="text-muted-foreground text-lg">
              {t('analytics.description').replace('{count}', String(analytics?.agents?.length || 0))}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Agent Filter */}
            <Select value={selectedAgentId || 'all'} onValueChange={(v) => setSelectedAgentId(v === 'all' ? undefined : v)}>
              <SelectTrigger className="w-[180px] glass-card">
                <SelectValue placeholder={t('analytics.filters.allAgents')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('analytics.filters.allAgents')}</SelectItem>
                {analytics?.agents?.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Timeframe */}
            <Select value={timeframe} onValueChange={setTimeframe}>
              <SelectTrigger className="w-[180px] glass-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">{t('analytics.filters.last24h')}</SelectItem>
                <SelectItem value="7days">{t('analytics.filters.last7days')}</SelectItem>
                <SelectItem value="30days">{t('analytics.filters.last30days')}</SelectItem>
                <SelectItem value="90days">{t('analytics.filters.last90days')}</SelectItem>
              </SelectContent>
            </Select>

            {/* Export */}
            {analytics && !analytics.requiresSetup && (
              <AnalyticsExport 
                analytics={analytics} 
                timeframe={timeframe}
                filename="voice-analytics"
              />
            )}
          </div>
        </div>

        {/* Stats Grid */}
        {analytics?.requiresSetup ? (
          <SetupIntegrationCard 
            title={t('analytics.configRequired')} 
            message={analytics.message || t('analytics.configMessage')} 
          />
        ) : isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <StatCardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <Card className="glass-card border-destructive/50">
            <CardContent className="pt-6">
              <p className="text-destructive">{t('analytics.loadingError')}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {stats.map((stat, index) => (
              <StatCard key={index} {...stat} />
            ))}
          </div>
        )}

        {/* Charts Grid */}
        {!analytics?.requiresSetup && (
          isLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <ChartCardSkeleton />
              <ChartCardSkeleton />
            </div>
          ) : !error && (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Conversations Over Time */}
                {conversationsOverTime.length > 0 && (
                  <ChartCard
                    title={t('analytics.charts.conversationsOverTime')}
                    data={conversationsOverTime}
                    type="area"
                    dataKey="conversations"
                    xAxisKey="day"
                  />
                )}

                {/* Per Agent Chart */}
                {agentChartData.length > 0 && (
                  <ChartCard
                    title={t('analytics.charts.conversationsPerAgent')}
                    data={agentChartData}
                    type="bar"
                    dataKey="conversations"
                    xAxisKey="name"
                  />
                )}
              </div>

              {/* Satisfaction Trend */}
              {satisfactionTrend.length > 0 && (
                <div className="mb-8">
                  <ChartCard
                    title={t('analytics.charts.satisfactionTrend')}
                    data={satisfactionTrend}
                    type="area"
                    dataKey="positive"
                    xAxisKey="day"
                  />
                </div>
              )}
            </>
          )
        )}

        {/* Per Agent Table */}
        {!analytics?.requiresSetup && !isLoading && analytics?.perAgent && analytics.perAgent.length > 0 && (
          <Card className="glass-card mb-8">
            <CardHeader>
              <CardTitle>{t('analytics.charts.performancePerAgent')}</CardTitle>
              <CardDescription>{t('analytics.description').replace('{count}', String(analytics.perAgent.length))}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('analytics.table.agent')}</TableHead>
                    <TableHead className="text-right">{t('analytics.table.conversations')}</TableHead>
                    <TableHead className="text-right">{t('analytics.table.avgDuration')}</TableHead>
                    <TableHead className="text-right">{t('analytics.table.satisfaction')}</TableHead>
                    <TableHead className="text-right">{t('analytics.table.successRate')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.perAgent.map((agent) => (
                    <TableRow key={agent.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-primary/10">
                            {agent.name}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {agent.metrics.total_conversations}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatDuration(agent.metrics.avg_duration)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Star className="w-4 h-4 text-yellow-500" />
                          {agent.metrics.satisfaction_score.toFixed(1)}/5
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge 
                          variant={agent.metrics.success_rate >= 70 ? "default" : "secondary"}
                          className={agent.metrics.success_rate >= 70 ? "bg-green-500/20 text-green-500" : ""}
                        >
                          {agent.metrics.success_rate.toFixed(1)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Additional Stats */}
        {!analytics?.requiresSetup && !isLoading && analytics && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-lg">{t('analytics.additionalStats.voiceMinutes')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-primary">
                  {analytics.metrics.total_voice_minutes}
                </p>
                <p className="text-sm text-muted-foreground">{t('analytics.additionalStats.totalMinutes')}</p>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-lg">{t('analytics.additionalStats.successfulConversations')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-green-500">
                  {analytics.metrics.successful_conversations}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('analytics.additionalStats.outOf').replace('{total}', String(analytics.metrics.total_conversations))}
                </p>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-lg">{t('analytics.additionalStats.numberOfAgents')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-primary">
                  {analytics.agents?.length || 0}
                </p>
                <p className="text-sm text-muted-foreground">{t('analytics.additionalStats.activeAgents')}</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default VoiceAnalytics;