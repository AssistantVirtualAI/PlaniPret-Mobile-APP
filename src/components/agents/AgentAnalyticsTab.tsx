import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart3, TrendingUp, Clock, Smile, Meh, Frown, Cloud, Database } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { ElevenLabsAnalytics } from '@/hooks/useAgentSettings';

interface AgentAnalyticsTabProps {
  conversations: any[];
  analytics: ElevenLabsAnalytics;
  isLoadingAnalytics?: boolean;
}

const SENTIMENT_COLORS = {
  positive: '#22c55e',
  neutral: '#f59e0b',
  negative: '#ef4444',
};

export const AgentAnalyticsTab = ({ conversations, analytics, isLoadingAnalytics }: AgentAnalyticsTabProps) => {
  // Prepare data for charts
  const last30Days = Array.from({ length: 30 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (29 - i));
    return date.toISOString().split('T')[0];
  });

  const conversationsByDay = last30Days.map(date => {
    const count = conversations?.filter(c => 
      c.created_at.split('T')[0] === date
    ).length || 0;
    return {
      date: new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
      conversations: count,
    };
  });

  const sentimentData = analytics.source === 'elevenlabs' ? [
    { name: 'Réussies', value: analytics.sentimentBreakdown.positive, color: SENTIMENT_COLORS.positive },
    { name: 'Échouées', value: analytics.sentimentBreakdown.negative, color: SENTIMENT_COLORS.negative },
  ] : [
    { name: 'Positif', value: analytics.sentimentBreakdown.positive, color: SENTIMENT_COLORS.positive },
    { name: 'Neutre', value: analytics.sentimentBreakdown.neutral, color: SENTIMENT_COLORS.neutral },
    { name: 'Négatif', value: analytics.sentimentBreakdown.negative, color: SENTIMENT_COLORS.negative },
  ];

  return (
    <div className="space-y-6">
      {/* Data source indicator */}
      <div className="flex items-center gap-2 text-sm">
        {analytics.source === 'elevenlabs' ? (
          <Badge variant="outline" className="gap-1 text-green-600 border-green-600">
            <Cloud className="h-3 w-3" />
            Données ElevenLabs (temps réel)
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1">
            <Database className="h-3 w-3" />
            Données locales
          </Badge>
        )}
        {isLoadingAnalytics && (
          <span className="text-muted-foreground animate-pulse">Chargement...</span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{analytics.totalConversations}</p>
                <p className="text-xs text-muted-foreground">Total conversations</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{analytics.avgDuration}s</p>
                <p className="text-xs text-muted-foreground">Durée moyenne</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{analytics.avgSatisfaction}</p>
                <p className="text-xs text-muted-foreground">Satisfaction moy.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Smile className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{analytics.sentimentBreakdown.positive}</p>
                <p className="text-xs text-muted-foreground">Positifs</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Conversations (30 derniers jours)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={conversationsByDay}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date" 
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="conversations" 
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Répartition des sentiments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sentimentData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {sentimentData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 mt-4">
              {sentimentData.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm">{item.name}: {item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Détail des sentiments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/10">
              <div className="flex items-center gap-3">
                <Smile className="h-5 w-5 text-green-500" />
                <span>Positif</span>
              </div>
              <span className="font-bold">{analytics.sentimentBreakdown.positive}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-yellow-500/10">
              <div className="flex items-center gap-3">
                <Meh className="h-5 w-5 text-yellow-500" />
                <span>Neutre</span>
              </div>
              <span className="font-bold">{analytics.sentimentBreakdown.neutral}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-red-500/10">
              <div className="flex items-center gap-3">
                <Frown className="h-5 w-5 text-red-500" />
                <span>Négatif</span>
              </div>
              <span className="font-bold">{analytics.sentimentBreakdown.negative}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
