import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { 
  Sparkles, 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle, 
  Lightbulb,
  Target,
  MessageSquare,
  BookOpen,
  TrendingUp,
  Clock,
  Zap,
  Download,
  Play
} from 'lucide-react';
import { useLatestAgentAdvice, useGenerateAgentAdvice, useSyncElevenLabsConversations, AgentDailyReport } from '@/hooks/useAgentAdvice';
import { formatDistanceToNow } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { useTranslation } from '@/hooks/useTranslation';
import { toast } from 'sonner';

interface AgentAIAdviceProps {
  agentId: string;
  agentName: string;
  platform?: string;
}

const priorityColors = {
  high: 'bg-red-500/20 text-red-400 border-red-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-green-500/20 text-green-400 border-green-500/30',
};

const effortImpactBadge = (effort: string, impact: string) => {
  if (impact === 'high' && effort === 'low') return 'bg-green-500/20 text-green-400';
  if (impact === 'high' && effort === 'medium') return 'bg-blue-500/20 text-blue-400';
  if (impact === 'high' && effort === 'high') return 'bg-purple-500/20 text-purple-400';
  if (impact === 'medium') return 'bg-yellow-500/20 text-yellow-400';
  return 'bg-muted text-muted-foreground';
};

export function AgentAIAdvice({ agentId, agentName, platform = 'elevenlabs' }: AgentAIAdviceProps) {
  const { t, language } = useTranslation();
  const [days, setDays] = useState<number | 'all'>(7);
  const [syncProgress, setSyncProgress] = useState<{ step: string; progress: number } | null>(null);
  
  const { data: advice, isLoading, refetch } = useLatestAgentAdvice(agentId, days);
  const { mutate: generateAdvice, isPending: isGenerating } = useGenerateAgentAdvice();
  const { mutateAsync: syncConversations, isPending: isSyncing } = useSyncElevenLabsConversations();

  const dateLocale = language === 'fr' ? fr : enUS;

  const handleSyncAndGenerate = async () => {
    try {
      // Step 1: Sync conversations
      setSyncProgress({ 
        step: language === 'en' ? 'Syncing conversations...' : 'Synchronisation des conversations...', 
        progress: 20 
      });
      
      await syncConversations({ 
        agentId, 
        limit: 100, 
        mode: days === 'all' ? 'all' : 'recent' 
      });

      // Step 2: Generate advice
      setSyncProgress({ 
        step: language === 'en' ? 'Analyzing and generating advice...' : 'Analyse et génération des conseils...', 
        progress: 60 
      });
      
      await new Promise<void>((resolve, reject) => {
        generateAdvice(
          { agentId, days, language },
          {
            onSuccess: () => resolve(),
            onError: (err) => reject(err)
          }
        );
      });

      setSyncProgress({ 
        step: language === 'en' ? 'Complete!' : 'Terminé!', 
        progress: 100 
      });
      
      setTimeout(() => setSyncProgress(null), 2000);
      
    } catch (error) {
      console.error('Sync and generate error:', error);
      setSyncProgress(null);
      toast.error(language === 'en' ? 'Error during sync' : 'Erreur lors de la synchronisation');
    }
  };

  const handleGenerate = () => {
    generateAdvice({ agentId, days, language });
  };

  // Refetch when language or period changes
  const handlePeriodChange = (value: string) => {
    const newDays = value === 'all' ? 'all' : parseInt(value);
    setDays(newDays);
  };

  const getImpactLabel = (impact: string) => {
    if (language === 'en') {
      return impact === 'high' ? 'High impact' : impact === 'medium' ? 'Medium impact' : 'Low impact';
    }
    return impact === 'high' ? 'Impact fort' : impact === 'medium' ? 'Impact moyen' : 'Impact faible';
  };

  const getEffortLabel = (effort: string) => {
    if (language === 'en') {
      return effort === 'low' ? 'Low effort' : effort === 'medium' ? 'Medium effort' : 'High effort';
    }
    return effort === 'low' ? 'Effort faible' : effort === 'medium' ? 'Effort moyen' : 'Effort élevé';
  };

  const getPriorityLabel = (priority: string) => {
    if (language === 'en') {
      return priority === 'high' ? 'High priority' : priority === 'medium' ? 'Medium priority' : 'Low priority';
    }
    return priority === 'high' ? 'Priorité haute' : priority === 'medium' ? 'Priorité moyenne' : 'Priorité basse';
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const isProcessing = isSyncing || isGenerating || syncProgress !== null;

  return (
    <div className="space-y-6">
      {/* Header with Generate Button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {t('aiAdvice.titleFor')} {agentName}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t('aiAdvice.description')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={days.toString()} onValueChange={handlePeriodChange}>
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
          
          {/* Sync & Generate button - recommended workflow */}
          <Button 
            onClick={handleSyncAndGenerate} 
            disabled={isProcessing}
            variant="default"
          >
            {isProcessing ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            {language === 'en' ? 'Sync & Analyze' : 'Sync & Analyser'}
          </Button>
          
          {/* Quick generate (uses existing data) */}
          <Button 
            onClick={handleGenerate} 
            disabled={isProcessing}
            variant="outline"
          >
            {isGenerating ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {t('aiAdvice.generateAdvice')}
          </Button>
        </div>
      </div>

      {/* Sync Progress */}
      {syncProgress && (
        <Card className="glass-card border-primary/30">
          <CardContent className="py-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                  {syncProgress.step}
                </span>
                <span className="text-muted-foreground">{syncProgress.progress}%</span>
              </div>
              <Progress value={syncProgress.progress} className="h-2" />
            </div>
          </CardContent>
        </Card>
      )}

      {!advice ? (
        <Card className="glass-card">
          <CardContent className="pt-6 text-center py-12">
            <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50 text-muted-foreground" />
            <p className="text-muted-foreground">{t('aiAdvice.noReportAvailable')}</p>
            <p className="text-sm text-muted-foreground mb-4">
              {language === 'en' 
                ? 'Click "Sync & Analyze" to fetch conversations and generate AI advice'
                : 'Cliquez sur "Sync & Analyser" pour récupérer les conversations et générer des conseils IA'}
            </p>
            <Button onClick={handleSyncAndGenerate} disabled={isProcessing}>
              {isProcessing ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              {language === 'en' ? 'Sync & Generate First Report' : 'Sync & Générer le premier rapport'}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Card */}
          <Card className="glass-card border-primary/20">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary" />
                  {t('aiAdvice.summary')}
                </CardTitle>
                <div className="text-xs text-muted-foreground">
                  <Clock className="h-3 w-3 inline mr-1" />
                  {formatDistanceToNow(new Date(advice.generated_at), { addSuffix: true, locale: dateLocale })}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{advice.summary}</p>
              <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t">
                <div className="text-center">
                  <p className="text-2xl font-bold">{advice.total_conversations}</p>
                  <p className="text-xs text-muted-foreground">{t('aiAdvice.conversations')}</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold">
                    {advice.avg_satisfaction && advice.avg_satisfaction > 0 
                      ? advice.avg_satisfaction.toFixed(1) 
                      : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">{t('aiAdvice.satisfaction')}</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold">
                    {advice.success_rate && advice.success_rate > 0 
                      ? `${advice.success_rate.toFixed(0)}%` 
                      : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">{t('aiAdvice.resolution')}</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold">
                    {advice.avg_duration_seconds 
                      ? Math.round(advice.avg_duration_seconds / 60) 
                      : '—'}m
                  </p>
                  <p className="text-xs text-muted-foreground">{t('aiAdvice.avgDuration')}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Strengths & Weaknesses */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="glass-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2 text-green-500">
                  <CheckCircle className="h-5 w-5" />
                  {t('aiAdvice.strengths')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {advice.strengths.length > 0 ? (
                  <ul className="space-y-2">
                    {advice.strengths.map((strength, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <TrendingUp className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                        <span>{strength}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('aiAdvice.noStrengths')}</p>
                )}
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2 text-yellow-500">
                  <AlertTriangle className="h-5 w-5" />
                  {t('aiAdvice.weaknesses')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {advice.weaknesses.length > 0 ? (
                  <ul className="space-y-2">
                    {advice.weaknesses.map((weakness, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                        <span>{weakness}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('aiAdvice.noWeaknesses')}</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Priority Actions */}
          {advice.priority_actions.length > 0 && (
            <Card className="glass-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  {t('aiAdvice.priorityActions')}
                </CardTitle>
                <CardDescription>{t('aiAdvice.sortedByImpact')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {advice.priority_actions.map((action, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-primary">#{i + 1}</span>
                        <span className="text-sm">{action.action}</span>
                      </div>
                      <Badge className={effortImpactBadge(action.effort, action.impact)}>
                        {getImpactLabel(action.impact)} / {getEffortLabel(action.effort)}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recommendations */}
          {advice.recommendations.length > 0 && (
            <Card className="glass-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-primary" />
                  {t('aiAdvice.recommendations')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {advice.recommendations.map((rec, i) => (
                    <div key={i} className="p-4 rounded-lg border bg-card">
                      <div className="flex items-start justify-between mb-2">
                        <Badge className={priorityColors[rec.priority]}>
                          {getPriorityLabel(rec.priority)}
                        </Badge>
                        <Badge variant="outline">{rec.category}</Badge>
                      </div>
                      <p className="font-medium mb-1">{rec.action}</p>
                      <p className="text-sm text-muted-foreground">{rec.impact}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Prompt & KB Suggestions */}
          <div className="grid gap-4 md:grid-cols-2">
            {advice.prompt_suggestions.length > 0 && (
              <Card className="glass-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-primary" />
                    {t('aiAdvice.promptSuggestions')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {advice.prompt_suggestions.map((suggestion, i) => (
                      <li key={i} className="text-sm p-2 rounded bg-muted/50">
                        {suggestion}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {advice.kb_suggestions.length > 0 && (
              <Card className="glass-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-primary" />
                    {t('aiAdvice.kbSuggestions')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {advice.kb_suggestions.map((suggestion, i) => (
                      <li key={i} className="text-sm p-2 rounded bg-muted/50">
                        {suggestion}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
