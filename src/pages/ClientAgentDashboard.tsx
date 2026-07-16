import { useParams } from 'react-router-dom';
import { useClientAgentAccess } from '@/hooks/useClientAgentAccess';
import { useClientPlatformAnalytics, useClientPlatformConversations } from '@/hooks/useClientPlatformData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { 
  MessageSquare, 
  Clock, 
  TrendingUp, 
  Phone,
  Users,
  ThumbsUp,
  Star,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const StatCard = ({ 
  title, 
  value, 
  icon: Icon, 
  trend,
  trendValue,
  trendLabel,
  isLoading 
}: { 
  title: string; 
  value: string | number; 
  icon: any; 
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  trendLabel?: string;
  isLoading?: boolean;
}) => (
  <Card>
    <CardContent className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          {isLoading ? (
            <Skeleton className="h-8 w-20 mt-1" />
          ) : (
            <>
              <p className="text-2xl font-bold">{value}</p>
              {trendValue && (
                <p className={`text-xs flex items-center gap-1 mt-1 ${
                  trend === 'up' ? 'text-green-600' : 
                  trend === 'down' ? 'text-red-600' : 'text-muted-foreground'
                }`}>
                  {trend === 'up' ? <ArrowUpRight className="h-3 w-3" /> : 
                   trend === 'down' ? <ArrowDownRight className="h-3 w-3" /> : null}
                  {trendValue} {trendLabel}
                </p>
              )}
            </>
          )}
        </div>
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Icon className="h-6 w-6 text-primary" />
        </div>
      </div>
    </CardContent>
  </Card>
);

const ClientAgentDashboard = () => {
  const { clientId, agentId } = useParams();
  const { apiKey, platformAgentId, agentName, platform, organizationId, isLoading: accessLoading } = useClientAgentAccess(clientId, agentId);
  
  const { data: analytics, isLoading: analyticsLoading } = useClientPlatformAnalytics({
    apiKey,
    agentId: platformAgentId,
    platform,
  }, '30d');

  const { data: conversations, isLoading: conversationsLoading } = useClientPlatformConversations({
    apiKey,
    agentId: platformAgentId,
    platform,
  }, 1, 5);

  const metrics = analytics?.metrics || {};
  const trends = analytics?.trends || {};
  const chartData = analytics?.charts?.conversations_over_time || [];
  const recentConversations = conversations?.conversations || [];

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  // Show loading state while checking access
  if (accessLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  // Show error if no platform or missing config
  if (!platform || !apiKey || !platformAgentId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{agentName || 'Dashboard'}</h1>
          <p className="text-muted-foreground">Vue d'ensemble des performances de l'agent</p>
        </div>
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">
                Configuration {platform ? platform.toUpperCase() : 'plateforme'} manquante pour cet agent
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Vérifiez que l'agent dispose d'un ID de plateforme et d'une clé API valide.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{agentName || 'Dashboard'}</h1>
          <p className="text-muted-foreground">Vue d'ensemble des performances de l'agent</p>
        </div>
        <Badge variant="outline" className="capitalize">
          {platform}
        </Badge>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Conversations"
          value={metrics.total_conversations || 0}
          icon={MessageSquare}
          trend={trends.conversations?.direction}
          trendValue={trends.conversations?.value}
          trendLabel="vs période précédente"
          isLoading={analyticsLoading}
        />
        <StatCard
          title="Durée Moyenne"
          value={metrics.avg_duration ? formatDuration(metrics.avg_duration) : '0m'}
          icon={Clock}
          trend={trends.duration?.direction}
          trendValue={trends.duration?.value}
          isLoading={analyticsLoading}
        />
        <StatCard
          title="Appels Aujourd'hui"
          value={metrics.today_conversations || 0}
          icon={Phone}
          isLoading={analyticsLoading}
        />
        <StatCard
          title="Satisfaction"
          value={metrics.avg_satisfaction ? `${Math.round(metrics.avg_satisfaction * 100)}%` : 'N/A'}
          icon={ThumbsUp}
          trend={trends.satisfaction?.direction}
          trendValue={trends.satisfaction?.value}
          isLoading={analyticsLoading}
        />
      </div>

      {/* Chart and Recent Conversations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Tendance des conversations (30 jours)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : chartData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground">
                Pas de données disponibles
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={192}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorConv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis 
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="count" 
                    stroke="hsl(var(--primary))" 
                    fillOpacity={1}
                    fill="url(#colorConv)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Recent Conversations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Conversations Récentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {conversationsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : recentConversations.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                Aucune conversation récente
              </p>
            ) : (
              <div className="space-y-3">
                {recentConversations.map((conv: any) => (
                  <div
                    key={conv.conversation_id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Users className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">
                          {conv.metadata?.caller_id || 'Appelant inconnu'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(conv.start_time_unix_secs * 1000).toLocaleString('fr-FR', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {conv.call_duration_secs 
                          ? `${Math.floor(conv.call_duration_secs / 60)}:${(conv.call_duration_secs % 60).toString().padStart(2, '0')}`
                          : 'N/A'
                        }
                      </p>
                      <Badge 
                        variant={conv.status === 'done' || conv.status === 'ended' ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {conv.status === 'done' || conv.status === 'ended' ? 'Terminé' : conv.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Additional KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-green-500/10 flex items-center justify-center">
                <Star className="h-7 w-7 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Score de Performance</p>
                <p className="text-2xl font-bold">
                  {metrics.success_rate ? `${Math.round(metrics.success_rate)}%` : '—'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Clock className="h-7 w-7 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Temps Total</p>
                <p className="text-2xl font-bold">
                  {metrics.total_duration 
                    ? `${Math.round(metrics.total_duration / 3600)}h ${Math.round((metrics.total_duration % 3600) / 60)}m`
                    : '0h'
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-purple-500/10 flex items-center justify-center">
                <TrendingUp className="h-7 w-7 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Croissance</p>
                <p className="text-2xl font-bold flex items-center gap-1">
                  {trends.conversations?.direction === 'up' && <ArrowUpRight className="h-5 w-5 text-green-500" />}
                  {trends.conversations?.direction === 'down' && <ArrowDownRight className="h-5 w-5 text-red-500" />}
                  {trends.conversations?.value || '—'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ClientAgentDashboard;
