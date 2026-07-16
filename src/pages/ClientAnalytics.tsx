import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClient } from '@/context/ClientContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { MessageSquare, Clock, Star, TrendingUp } from 'lucide-react';

const ClientAnalytics = () => {
  const { session } = useClient();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['client-analytics', session?.clientId],
    queryFn: async () => {
      if (!session?.clientId) return null;

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const { data: conversations, error } = await supabase
        .from('conversations')
        .select('id, duration, satisfaction_score, created_at, sentiment')
        .eq('client_id', session.clientId)
        .gte('created_at', thirtyDaysAgo.toISOString());

      if (error) throw error;

      const totalConversations = conversations?.length || 0;
      const avgDuration = conversations?.reduce((acc, c) => acc + (c.duration || 0), 0) / (totalConversations || 1);
      const avgSatisfaction = conversations
        ?.filter(c => c.satisfaction_score)
        .reduce((acc, c, _, arr) => acc + (c.satisfaction_score || 0) / arr.length, 0) || 0;

      // Group by day for chart
      const byDay: Record<string, number> = {};
      conversations?.forEach(c => {
        const day = c.created_at.split('T')[0];
        byDay[day] = (byDay[day] || 0) + 1;
      });

      const chartData = Object.entries(byDay)
        .map(([date, count]) => ({ date, conversations: count }))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-14);

      // Sentiment distribution
      const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
      conversations?.forEach(c => {
        if (c.sentiment === 'positive') sentimentCounts.positive++;
        else if (c.sentiment === 'negative') sentimentCounts.negative++;
        else sentimentCounts.neutral++;
      });

      return {
        totalConversations,
        avgDuration: Math.round(avgDuration),
        avgSatisfaction: Math.round(avgSatisfaction * 10) / 10,
        chartData,
        sentimentData: [
          { name: 'Positif', value: sentimentCounts.positive },
          { name: 'Neutre', value: sentimentCounts.neutral },
          { name: 'Négatif', value: sentimentCounts.negative },
        ],
      };
    },
    enabled: !!session?.clientId,
  });

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="bg-card/50 animate-pulse">
              <CardContent className="p-6 h-24" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-muted-foreground">Statistiques des 30 derniers jours</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Conversations</p>
                <p className="text-3xl font-bold">{stats?.totalConversations || 0}</p>
              </div>
              <div className="p-3 rounded-lg bg-primary/10">
                <MessageSquare className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Durée moyenne</p>
                <p className="text-3xl font-bold">{formatDuration(stats?.avgDuration || 0)}</p>
              </div>
              <div className="p-3 rounded-lg bg-cyan-500/10">
                <Clock className="h-6 w-6 text-cyan-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Satisfaction</p>
                <p className="text-3xl font-bold">{stats?.avgSatisfaction || 0}/5</p>
              </div>
              <div className="p-3 rounded-lg bg-yellow-500/10">
                <Star className="h-6 w-6 text-yellow-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Conversations par jour</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={stats?.chartData || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  stroke="hsl(var(--muted-foreground))"
                  tickFormatter={(v) => new Date(v).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Line type="monotone" dataKey="conversations" stroke="hsl(var(--primary))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Distribution des sentiments</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={stats?.sentimentData || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ClientAnalytics;
