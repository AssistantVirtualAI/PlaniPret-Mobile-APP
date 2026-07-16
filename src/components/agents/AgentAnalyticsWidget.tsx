import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  BarChart3, 
  TrendingUp, 
  MessageSquare, 
  Clock, 
  Star,
  Activity,
  Target,
  Lightbulb,
  RefreshCw
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useAgentInsights } from '@/hooks/useEnhancedConversationAnalysis';
import { AgentHealthScoreCard } from './AgentHealthScoreCard';
import { ImprovementsList, Improvement } from '@/components/conversations/ImprovementCard';
import { cn } from '@/lib/utils';

interface AgentAnalyticsWidgetProps {
  agentId: string;
  agentName?: string;
}

export function AgentAnalyticsWidget({ agentId, agentName }: AgentAnalyticsWidgetProps) {
  const { data: insightsData, isLoading, refetch } = useAgentInsights(agentId);
  
  if (isLoading) {
    return (
      <Card className="glass-card">
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!insightsData || insightsData.stats.totalConversations === 0) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Analytics Agent
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <Activity className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">
            Aucune analyse disponible pour cet agent.
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Les analytics apparaîtront après l'analyse des conversations.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { stats, insights } = insightsData;

  // Calculer la distribution des sentiments
  const sentimentDistribution = insights.reduce((acc, insight) => {
    const sentiment = insight.overall_sentiment || 'neutral';
    acc[sentiment] = (acc[sentiment] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalSentiments = Object.values(sentimentDistribution).reduce((a, b) => a + b, 0);

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Analytics {agentName ? `- ${agentName}` : ''}
          </div>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
            <TabsTrigger value="health">Health Score</TabsTrigger>
            <TabsTrigger value="improvements">Améliorations</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* Métriques principales */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <MessageSquare className="w-4 h-4" />
                  Conversations
                </div>
                <p className="text-2xl font-bold mt-1">{stats.totalConversations}</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="p-4 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Star className="w-4 h-4" />
                  Satisfaction
                </div>
                <p className="text-2xl font-bold mt-1">
                  {stats.averageSatisfaction.toFixed(1)}/10
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="p-4 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <TrendingUp className="w-4 h-4" />
                  Positif
                </div>
                <p className="text-2xl font-bold mt-1 text-green-500">
                  {sentimentDistribution['positive'] || 0}
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="p-4 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Lightbulb className="w-4 h-4" />
                  Améliorations
                </div>
                <p className="text-2xl font-bold mt-1">
                  {stats.topImprovements.length}
                </p>
              </motion.div>
            </div>

            {/* Distribution des sentiments */}
            <Card className="bg-muted/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Distribution des Sentiments</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {['positive', 'neutral', 'negative'].map((sentiment) => {
                  const count = sentimentDistribution[sentiment] || 0;
                  const percentage = totalSentiments > 0 ? (count / totalSentiments) * 100 : 0;
                  const colors = {
                    positive: 'bg-green-500',
                    neutral: 'bg-yellow-500',
                    negative: 'bg-red-500'
                  };
                  const labels = {
                    positive: 'Positif',
                    neutral: 'Neutre',
                    negative: 'Négatif'
                  };

                  return (
                    <div key={sentiment} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{labels[sentiment as keyof typeof labels]}</span>
                        <span className="text-muted-foreground">
                          {count} ({percentage.toFixed(0)}%)
                        </span>
                      </div>
                      <Progress 
                        value={percentage} 
                        className={cn("h-2", `[&>div]:${colors[sentiment as keyof typeof colors]}`)}
                      />
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Top catégories d'amélioration */}
            {Object.keys(stats.improvementsByCategory).length > 0 && (
              <Card className="bg-muted/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Points d'Amélioration Fréquents</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(stats.improvementsByCategory)
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 5)
                      .map(([category, count]) => (
                        <Badge key={category} variant="outline">
                          {category}: {count}
                        </Badge>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="health">
            <AgentHealthScoreCard
              healthScore={stats.averageSatisfaction}
              avgSatisfaction={stats.averageSatisfaction}
              avgSentiment={(sentimentDistribution['positive'] || 0) / Math.max(totalSentiments, 1) * 10}
              avgResolution={(sentimentDistribution['positive'] || 0) / Math.max(totalSentiments, 1) * 100}
              totalConversations={stats.totalConversations}
              trend="stable"
            />
          </TabsContent>

          <TabsContent value="improvements">
            {stats.topImprovements.length > 0 ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Top {stats.topImprovements.length} recommandations basées sur l'analyse des conversations
                </p>
                <ImprovementsList 
                  improvements={stats.topImprovements.map(imp => ({
                    category: imp.category,
                    priority: imp.priority,
                    suggestion: imp.suggestion,
                    example: imp.example,
                    recommended_action: imp.recommended_action
                  })) as Improvement[]}
                />
              </div>
            ) : (
              <div className="text-center py-8">
                <Target className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  Aucune recommandation d'amélioration pour le moment.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
