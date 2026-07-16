import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useAllAgentsAnalytics } from '@/hooks/useAllAgentsAnalytics';
import { SetupIntegrationCard } from '@/components/SetupIntegrationCard';
import { AnalyticsExport } from '@/components/exports/AnalyticsExport';
import { 
  Trophy, Medal, TrendingUp, TrendingDown, Star, Clock, 
  Phone, Users, Award, Target, BarChart3, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  Cell,
  PieChart,
  Pie,
} from 'recharts';

const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

const AgentComparison = () => {
  const [timeframe, setTimeframe] = useState('7days');
  const { data: analytics, isLoading, error } = useAllAgentsAnalytics(timeframe);

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}m ${secs}s`;
  };

  // Sort agents by performance (satisfaction + success rate)
  const rankedAgents = analytics?.perAgent 
    ? [...analytics.perAgent].sort((a, b) => {
        const scoreA = (a.metrics.satisfaction_score * 20) + a.metrics.success_rate;
        const scoreB = (b.metrics.satisfaction_score * 20) + b.metrics.success_rate;
        return scoreB - scoreA;
      })
    : [];

  // Calculate score for each agent (0-100)
  const calculateScore = (agent: typeof rankedAgents[0]) => {
    const satisfactionWeight = 0.4;
    const successWeight = 0.4;
    const conversationsWeight = 0.2;
    
    const maxConversations = Math.max(...rankedAgents.map(a => a.metrics.total_conversations), 1);
    
    const satisfactionScore = (agent.metrics.satisfaction_score / 5) * 100;
    const successScore = agent.metrics.success_rate;
    const conversationsScore = (agent.metrics.total_conversations / maxConversations) * 100;
    
    return Math.round(
      (satisfactionScore * satisfactionWeight) + 
      (successScore * successWeight) + 
      (conversationsScore * conversationsWeight)
    );
  };

  // Prepare radar chart data
  const radarData = rankedAgents.slice(0, 5).map(agent => ({
    agent: agent.name,
    satisfaction: agent.metrics.satisfaction_score * 20,
    success: agent.metrics.success_rate,
    volume: Math.min((agent.metrics.total_conversations / (Math.max(...rankedAgents.map(a => a.metrics.total_conversations), 1))) * 100, 100),
  }));

  // Prepare bar chart data for comparison
  const barChartData = rankedAgents.map(agent => ({
    name: agent.name.length > 15 ? agent.name.substring(0, 15) + '...' : agent.name,
    satisfaction: agent.metrics.satisfaction_score,
    success: agent.metrics.success_rate,
    conversations: agent.metrics.total_conversations,
  }));

  // Pie chart for conversations distribution
  const pieData = rankedAgents.map(agent => ({
    name: agent.name,
    value: agent.metrics.total_conversations,
  }));

  const getRankIcon = (index: number) => {
    if (index === 0) return <Trophy className="h-5 w-5 text-yellow-500" />;
    if (index === 1) return <Medal className="h-5 w-5 text-gray-400" />;
    if (index === 2) return <Medal className="h-5 w-5 text-amber-600" />;
    return <span className="w-5 h-5 flex items-center justify-center text-muted-foreground font-medium">{index + 1}</span>;
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getScoreBadge = (score: number) => {
    if (score >= 80) return { label: 'Excellent', variant: 'default' as const, className: 'bg-green-500/20 text-green-500 border-green-500/30' };
    if (score >= 60) return { label: 'Bon', variant: 'secondary' as const, className: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30' };
    return { label: 'À améliorer', variant: 'destructive' as const, className: 'bg-red-500/20 text-red-500 border-red-500/30' };
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="container mx-auto px-6 py-8">
          <Skeleton className="h-10 w-64 mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-80" />
            <Skeleton className="h-80" />
          </div>
        </div>
      </AppLayout>
    );
  }

  if (analytics?.requiresSetup) {
    return (
      <AppLayout>
        <div className="container mx-auto px-6 py-8">
          <h1 className="text-4xl font-bold mb-8 gradient-text">Comparaison des Agents</h1>
          <SetupIntegrationCard 
            title="Configuration Requise" 
            message={analytics.message || 'Veuillez configurer au moins un agent ElevenLabs.'} 
          />
        </div>
      </AppLayout>
    );
  }

  const bestAgent = rankedAgents[0];
  const worstAgent = rankedAgents[rankedAgents.length - 1];

  return (
    <AppLayout>
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-4xl font-bold mb-2 gradient-text">Comparaison des Agents</h1>
            <p className="text-muted-foreground text-lg">
              Classement et analyse comparative de {rankedAgents.length} agents
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={timeframe} onValueChange={setTimeframe}>
              <SelectTrigger className="w-[180px] glass-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Dernières 24h</SelectItem>
                <SelectItem value="7days">7 derniers jours</SelectItem>
                <SelectItem value="30days">30 derniers jours</SelectItem>
                <SelectItem value="90days">90 derniers jours</SelectItem>
              </SelectContent>
            </Select>
            {analytics && (
              <AnalyticsExport 
                analytics={analytics} 
                timeframe={timeframe}
                filename="agent-comparison"
              />
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="glass-card border-green-500/30">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-2">
                <Trophy className="h-6 w-6 text-yellow-500" />
                <span className="text-sm text-muted-foreground">Meilleur Agent</span>
              </div>
              {bestAgent ? (
                <>
                  <p className="text-xl font-bold truncate">{bestAgent.name}</p>
                  <p className="text-sm text-green-500 flex items-center gap-1 mt-1">
                    <Star className="h-4 w-4" />
                    {bestAgent.metrics.satisfaction_score.toFixed(1)}/5 · {bestAgent.metrics.success_rate.toFixed(0)}% succès
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">N/A</p>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-2">
                <Phone className="h-6 w-6 text-primary" />
                <span className="text-sm text-muted-foreground">Total Conversations</span>
              </div>
              <p className="text-3xl font-bold">{analytics?.metrics.total_conversations || 0}</p>
              <p className="text-sm text-muted-foreground mt-1">
                Moy: {Math.round((analytics?.metrics.total_conversations || 0) / Math.max(rankedAgents.length, 1))} par agent
              </p>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-2">
                <Star className="h-6 w-6 text-yellow-500" />
                <span className="text-sm text-muted-foreground">Satisfaction Moyenne</span>
              </div>
              <p className="text-3xl font-bold">
                {analytics?.metrics.satisfaction_score.toFixed(1) || '0.0'}
                <span className="text-lg text-muted-foreground">/5</span>
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Taux succès: {analytics?.metrics.success_rate.toFixed(0) || 0}%
              </p>
            </CardContent>
          </Card>

          <Card className="glass-card border-yellow-500/30">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-2">
                <Target className="h-6 w-6 text-yellow-500" />
                <span className="text-sm text-muted-foreground">À Améliorer</span>
              </div>
              {worstAgent && rankedAgents.length > 1 ? (
                <>
                  <p className="text-xl font-bold truncate">{worstAgent.name}</p>
                  <p className="text-sm text-yellow-500 flex items-center gap-1 mt-1">
                    <TrendingUp className="h-4 w-4" />
                    Potentiel d'amélioration
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">N/A</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Ranking Table */}
        <Card className="glass-card mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              Classement des Agents
            </CardTitle>
            <CardDescription>Classement basé sur la satisfaction, le taux de succès et le volume</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Rang</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead className="text-right">Conversations</TableHead>
                  <TableHead className="text-right">Satisfaction</TableHead>
                  <TableHead className="text-right">Succès</TableHead>
                  <TableHead className="text-right">Durée Moy.</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rankedAgents.map((agent, index) => {
                  const score = calculateScore(agent);
                  const scoreBadge = getScoreBadge(score);
                  return (
                    <TableRow key={agent.id} className={index === 0 ? 'bg-yellow-500/5' : ''}>
                      <TableCell>
                        <div className="flex items-center justify-center">
                          {getRankIcon(index)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{agent.name}</span>
                          {index === 0 && (
                            <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30 text-xs">
                              Leader
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`font-bold ${getScoreColor(score)}`}>{score}</span>
                        <span className="text-muted-foreground">/100</span>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {agent.metrics.total_conversations}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Star className="h-4 w-4 text-yellow-500" />
                          <span>{agent.metrics.satisfaction_score.toFixed(1)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {agent.metrics.success_rate >= 70 ? (
                            <ArrowUpRight className="h-4 w-4 text-green-500" />
                          ) : (
                            <ArrowDownRight className="h-4 w-4 text-red-500" />
                          )}
                          <span>{agent.metrics.success_rate.toFixed(1)}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatDuration(agent.metrics.avg_duration)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={scoreBadge.variant} className={scoreBadge.className}>
                          {scoreBadge.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Satisfaction Comparison Bar Chart */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Comparaison Satisfaction
              </CardTitle>
              <CardDescription>Score de satisfaction par agent (sur 5)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" domain={[0, 5]} className="text-xs fill-muted-foreground" />
                    <YAxis dataKey="name" type="category" width={100} className="text-xs fill-muted-foreground" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                      formatter={(value: number) => [value.toFixed(2), 'Satisfaction']}
                    />
                    <Bar dataKey="satisfaction" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]}>
                      {barChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Conversations Distribution Pie Chart */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Distribution des Conversations
              </CardTitle>
              <CardDescription>Répartition du volume par agent</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Success Rate Comparison */}
        <Card className="glass-card mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Taux de Succès par Agent
            </CardTitle>
            <CardDescription>Comparaison des performances de conversion</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {rankedAgents.map((agent, index) => (
                <div key={agent.id} className="flex items-center gap-4">
                  <div className="w-8 flex justify-center">{getRankIcon(index)}</div>
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="font-medium text-sm">{agent.name}</span>
                      <span className={`text-sm font-bold ${agent.metrics.success_rate >= 70 ? 'text-green-500' : agent.metrics.success_rate >= 50 ? 'text-yellow-500' : 'text-red-500'}`}>
                        {agent.metrics.success_rate.toFixed(1)}%
                      </span>
                    </div>
                    <Progress 
                      value={agent.metrics.success_rate} 
                      className="h-2"
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Radar Chart for Top Agents */}
        {radarData.length > 0 && (
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                Analyse Multi-dimensionnelle
              </CardTitle>
              <CardDescription>Comparaison sur 3 axes: satisfaction, succès et volume (Top 5)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={[
                    { subject: 'Satisfaction', ...Object.fromEntries(radarData.map(d => [d.agent, d.satisfaction])) },
                    { subject: 'Succès', ...Object.fromEntries(radarData.map(d => [d.agent, d.success])) },
                    { subject: 'Volume', ...Object.fromEntries(radarData.map(d => [d.agent, d.volume])) },
                  ]}>
                    <PolarGrid className="stroke-muted" />
                    <PolarAngleAxis dataKey="subject" className="text-xs fill-muted-foreground" />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} className="text-xs fill-muted-foreground" />
                    {radarData.map((agent, index) => (
                      <Radar
                        key={agent.agent}
                        name={agent.agent}
                        dataKey={agent.agent}
                        stroke={COLORS[index % COLORS.length]}
                        fill={COLORS[index % COLORS.length]}
                        fillOpacity={0.2}
                      />
                    ))}
                    <Legend />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default AgentComparison;
