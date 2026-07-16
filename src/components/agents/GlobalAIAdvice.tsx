import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Sparkles, 
  RefreshCw, 
  TrendingUp, 
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Target,
  Users,
  Clock,
  ThumbsUp,
  Lightbulb,
  Zap,
  Download
} from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

interface GlobalAdviceData {
  globalMetrics: {
    totalConversations: number;
    avgSatisfaction: number;
    avgDuration: number;
    sentiment: { positive: number; neutral: number; negative: number };
    agentCount: number;
    bestAgent: { name: string; satisfaction: number } | null;
    worstAgent: { name: string; satisfaction: number } | null;
  };
  agentMetrics: Array<{
    agentId: string;
    agentName: string;
    totalConversations: number;
    avgSatisfaction: number;
    avgDuration: number;
    sentiment: { positive: number; neutral: number; negative: number };
    topTags: Array<{ tag: string; count: number }>;
  }>;
  globalAdvice: {
    globalSummary: string;
    overallHealth: 'good' | 'warning' | 'critical';
    keyInsights: string[];
    globalStrengths: string[];
    globalWeaknesses: string[];
    priorityActions: Array<{ action: string; agent: string; impact: string }>;
    agentRecommendations: Record<string, string>;
  };
}

export const GlobalAIAdvice = () => {
  const { t, language } = useTranslation();
  const [days, setDays] = useState<number | 'all'>(7);
  const [syncProgress, setSyncProgress] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['global-agent-advice', days, language],
    queryFn: async (): Promise<GlobalAdviceData> => {
      const { data, error } = await supabase.functions.invoke('generate-global-advice', {
        body: { days, language }
      });
      if (error) throw error;
      return data;
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      setSyncProgress(language === 'en' ? 'Syncing conversations...' : 'Synchronisation des conversations...');
      const { data, error } = await supabase.functions.invoke('sync-elevenlabs-conversations', {
        body: { mode: 'all', analyzeConversations: true, language }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      const message = language === 'en' 
        ? `Sync complete: ${data.synced} conversations (${data.created} new, ${data.analyzed} analyzed)`
        : `Synchronisation terminée: ${data.synced} conversations (${data.created} nouvelles, ${data.analyzed} analysées)`;
      toast.success(message);
      setSyncProgress(null);
      queryClient.invalidateQueries({ queryKey: ['global-agent-advice'] });
    },
    onError: (error) => {
      console.error('Sync error:', error);
      toast.error(language === 'en' ? 'Sync failed' : 'Échec de la synchronisation');
      setSyncProgress(null);
    }
  });

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('generate-global-advice', {
        body: { days, language, forceRegenerate: true }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['global-agent-advice'] });
    }
  });

  const getHealthColor = (health: string) => {
    switch (health) {
      case 'good': return 'text-green-500 bg-green-500/10 border-green-500/30';
      case 'warning': return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30';
      case 'critical': return 'text-red-500 bg-red-500/10 border-red-500/30';
      default: return 'text-muted-foreground';
    }
  };

  const getHealthIcon = (health: string) => {
    switch (health) {
      case 'good': return <CheckCircle className="h-5 w-5" />;
      case 'warning': return <AlertTriangle className="h-5 w-5" />;
      case 'critical': return <AlertTriangle className="h-5 w-5" />;
      default: return null;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="glass-card">
        <CardContent className="pt-6 text-center py-12">
          <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-destructive opacity-50" />
          <p className="text-muted-foreground">{t('aiAdvice.errorLoading')}</p>
          <Button variant="outline" onClick={() => refetch()} className="mt-4">
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('aiAdvice.retry')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { globalMetrics, agentMetrics, globalAdvice } = data;

  return (
    <div className="space-y-6">
      {/* Header with Health Status */}
      <Card className={`glass-card border ${getHealthColor(globalAdvice.overallHealth)}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {getHealthIcon(globalAdvice.overallHealth)}
              <div>
                <CardTitle>{t('aiAdvice.globalTitle')}</CardTitle>
                <CardDescription>
                  {t('aiAdvice.globalDescription')} - {days === 'all' ? t('aiAdvice.periodAll') : `${days} ${language === 'en' ? 'days' : 'jours'}`}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={days.toString()} onValueChange={(v) => setDays(v === 'all' ? 'all' : Number(v))}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">{t('aiAdvice.period24h')}</SelectItem>
                  <SelectItem value="7">{t('aiAdvice.period7d')}</SelectItem>
                  <SelectItem value="30">{t('aiAdvice.period30d')}</SelectItem>
                  <SelectItem value="all">{t('aiAdvice.periodAll')}</SelectItem>
                </SelectContent>
              </Select>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                title={language === 'en' ? 'Sync & Analyze Conversations' : 'Synchroniser et Analyser'}
              >
                {syncMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => regenerateMutation.mutate()}
                disabled={regenerateMutation.isPending}
                title={language === 'en' ? 'Regenerate Advice' : 'Régénérer les conseils'}
              >
                {regenerateMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {syncProgress && (
            <div className="mb-4 p-3 bg-primary/5 rounded-lg border border-primary/20">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm text-primary">{syncProgress}</span>
              </div>
            </div>
          )}
          <p className="text-lg">{globalAdvice.globalSummary}</p>
        </CardContent>
      </Card>

      {/* Global Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="glass-card">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Users className="h-4 w-4" />
              {t('aiAdvice.conversations')}
            </div>
            <p className="text-3xl font-bold">{globalMetrics.totalConversations}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <ThumbsUp className="h-4 w-4" />
              {t('aiAdvice.satisfaction')}
            </div>
            <p className="text-3xl font-bold">
              {globalMetrics.avgSatisfaction.toFixed(1)}
              <span className="text-lg text-muted-foreground">/10</span>
            </p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Clock className="h-4 w-4" />
              {t('aiAdvice.avgDuration')}
            </div>
            <p className="text-3xl font-bold">
              {Math.round(globalMetrics.avgDuration / 60)}
              <span className="text-lg text-muted-foreground">min</span>
            </p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Target className="h-4 w-4" />
              {t('reports.agents')}
            </div>
            <p className="text-3xl font-bold">{globalMetrics.agentCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Key Insights */}
      {globalAdvice.keyInsights.length > 0 && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-primary" />
              {t('aiAdvice.keyInsights')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3">
              {globalAdvice.keyInsights.map((insight, i) => (
                <div key={i} className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                  <p className="text-sm">{insight}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Strengths & Weaknesses */}
      <div className="grid gap-4 md:grid-cols-2">
        {globalAdvice.globalStrengths.length > 0 && (
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-500">
                <TrendingUp className="h-5 w-5" />
                {t('aiAdvice.strengths')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {globalAdvice.globalStrengths.map((strength, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                    <span className="text-sm">{strength}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {globalAdvice.globalWeaknesses.length > 0 && (
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-yellow-500">
                <TrendingDown className="h-5 w-5" />
                {t('aiAdvice.weaknesses')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {globalAdvice.globalWeaknesses.map((weakness, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                    <span className="text-sm">{weakness}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Priority Actions */}
      {globalAdvice.priorityActions.length > 0 && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              {t('aiAdvice.priorityActions')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {globalAdvice.priorityActions.map((action, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                      {i + 1}
                    </span>
                    <div>
                      <p className="font-medium">{action.action}</p>
                      <p className="text-sm text-muted-foreground">
                        {language === 'en' ? 'Agent:' : 'Agent:'} {action.agent}
                      </p>
                    </div>
                  </div>
                  <Badge variant={action.impact === 'high' ? 'default' : 'secondary'}>
                    {language === 'en' ? 'Impact' : 'Impact'} {action.impact}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Agent Comparison */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>{t('aiAdvice.agentComparison')}</CardTitle>
          <CardDescription>{t('aiAdvice.relativePerformance')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {agentMetrics.map((agent) => (
              <div key={agent.agentId} className="space-y-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{agent.agentName}</span>
                    {globalMetrics.bestAgent?.name === agent.agentName && (
                      <Badge variant="outline" className="text-green-500 border-green-500/30">
                        {t('aiAdvice.best')}
                      </Badge>
                    )}
                    {globalAdvice.agentRecommendations[agent.agentName] && (
                      <Badge variant="outline" className="text-yellow-500 border-yellow-500/30">
                        {t('aiAdvice.needsImprovement')}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{agent.totalConversations} {t('aiAdvice.conv')}</span>
                    <span>{agent.avgSatisfaction.toFixed(1)}/10</span>
                  </div>
                </div>
                <Progress 
                  value={agent.avgSatisfaction * 10} 
                  className="h-2"
                />
                {globalAdvice.agentRecommendations[agent.agentName] && (
                  <p className="text-sm text-muted-foreground pl-2 border-l-2 border-primary/30">
                    💡 {globalAdvice.agentRecommendations[agent.agentName]}
                  </p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
