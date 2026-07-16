import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useWorkspaceMetrics } from '@/hooks/useWorkspaceMetrics';
import { useTranslation } from '@/hooks/useTranslation';
import { Users, Bot, MessageSquare, Clock, CheckCircle, TrendingUp } from 'lucide-react';

interface WorkspaceMetricsProps {
  dateRange?: { start: Date; end: Date } | null;
}

export const WorkspaceMetrics = ({ dateRange }: WorkspaceMetricsProps) => {
  const { t } = useTranslation();
  const { data: metrics, isLoading } = useWorkspaceMetrics(dateRange || undefined);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4 h-24" />
          </Card>
        ))}
      </div>
    );
  }

  const metricsData = [
    {
      title: t('dashboard.workspace.activeClients'),
      value: metrics?.activeClients || 0,
      icon: Users,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
    },
    {
      title: t('dashboard.workspace.agents'),
      value: metrics?.activeAgents || 0,
      icon: Bot,
      color: 'text-purple-500',
      bg: 'bg-purple-500/10',
    },
    {
      title: t('dashboard.workspace.conversations'),
      value: metrics?.totalConversations || 0,
      icon: MessageSquare,
      color: 'text-green-500',
      bg: 'bg-green-500/10',
    },
    {
      title: t('dashboard.workspace.totalMinutes'),
      value: metrics?.totalMinutes || 0,
      icon: Clock,
      color: 'text-orange-500',
      bg: 'bg-orange-500/10',
    },
    {
      title: t('dashboard.workspace.resolutionRate'),
      value: `${metrics?.resolutionRate || 0}%`,
      icon: CheckCircle,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
    },
    {
      title: t('dashboard.workspace.avgInteractions'),
      value: metrics?.avgInteractions || 0,
      icon: TrendingUp,
      color: 'text-cyan-500',
      bg: 'bg-cyan-500/10',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('dashboard.workspace.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {metricsData.map((metric) => (
            <div
              key={metric.title}
              className="flex flex-col items-center p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <div className={`p-2 rounded-full ${metric.bg} mb-2`}>
                <metric.icon className={`h-5 w-5 ${metric.color}`} />
              </div>
              <p className="text-2xl font-bold text-foreground">{metric.value}</p>
              <p className="text-xs text-muted-foreground text-center">{metric.title}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
