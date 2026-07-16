import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { 
  Sparkles, 
  RefreshCw, 
  AlertTriangle,
  CheckCircle,
  Lightbulb,
  Brain,
  TrendingUp,
  ArrowRight
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from '@/hooks/useTranslation';

interface AIInsightsWidgetProps {
  compact?: boolean;
}

export const AIInsightsWidget = ({ compact = false }: AIInsightsWidgetProps) => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard-ai-insights'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('generate-global-advice', {
        body: { days: 7 }
      });
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('generate-global-advice', {
        body: { days: 7, forceRegenerate: true }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-ai-insights'] });
    }
  });

  const getHealthScore = () => {
    if (!data?.globalAdvice?.overallHealth) return 75;
    switch (data.globalAdvice.overallHealth) {
      case 'good': return 90;
      case 'warning': return 65;
      case 'critical': return 35;
      default: return 75;
    }
  };

  const getHealthColor = (health: string) => {
    switch (health) {
      case 'good': return 'text-emerald-500';
      case 'warning': return 'text-amber-500';
      case 'critical': return 'text-red-500';
      default: return 'text-muted-foreground';
    }
  };

  const getHealthBg = (health: string) => {
    switch (health) {
      case 'good': return 'from-emerald-500/20 to-emerald-500/5';
      case 'warning': return 'from-amber-500/20 to-amber-500/5';
      case 'critical': return 'from-red-500/20 to-red-500/5';
      default: return 'from-primary/20 to-primary/5';
    }
  };

  const getHealthLabel = (health: string) => {
    switch (health) {
      case 'good': return t('dashboard.insights.excellent');
      case 'warning': return t('dashboard.insights.attention');
      case 'critical': return t('dashboard.insights.critical');
      default: return t('dashboard.insights.analyzing');
    }
  };

  if (isLoading) {
    return (
      <Card className="glass-card overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded-full" />
            <Skeleton className="h-5 w-32" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="glass-card">
        <CardContent className="pt-6 text-center py-8">
          <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground mb-3">{t('dashboard.insights.unableToLoad')}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3 w-3 mr-1" />
            {t('dashboard.insights.retry')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { globalAdvice, globalMetrics } = data;
  const healthScore = getHealthScore();
  const circumference = 2 * Math.PI * 40;
  const strokeDashoffset = circumference - (healthScore / 100) * circumference;

  return (
    <Card className="glass-card overflow-hidden relative">
      {/* Gradient background based on health */}
      <div className={`absolute inset-0 bg-gradient-to-br ${getHealthBg(globalAdvice?.overallHealth)} opacity-50`} />
      
      <CardHeader className="relative pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <motion.div
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            >
              <Brain className="h-5 w-5 text-primary" />
            </motion.div>
            {t('dashboard.insights.title')}
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => regenerateMutation.mutate()}
            disabled={regenerateMutation.isPending}
            className="h-8 w-8 p-0"
          >
            <RefreshCw className={`h-4 w-4 ${regenerateMutation.isPending ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="relative space-y-4">
        {/* Health Score Circle */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <svg className="w-24 h-24 -rotate-90">
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                className="text-muted/30"
              />
              <motion.circle
                cx="48"
                cy="48"
                r="40"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset }}
                transition={{ duration: 1, ease: "easeOut" }}
                className={getHealthColor(globalAdvice?.overallHealth)}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl font-bold">{healthScore}</span>
            </div>
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge 
                variant="outline" 
                className={`${getHealthColor(globalAdvice?.overallHealth)} border-current`}
              >
                {globalAdvice?.overallHealth === 'good' && <CheckCircle className="h-3 w-3 mr-1" />}
                {globalAdvice?.overallHealth === 'warning' && <AlertTriangle className="h-3 w-3 mr-1" />}
                {globalAdvice?.overallHealth === 'critical' && <AlertTriangle className="h-3 w-3 mr-1" />}
                {getHealthLabel(globalAdvice?.overallHealth)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {globalAdvice?.globalSummary || t('dashboard.insights.analyzing')}
            </p>
          </div>
        </div>

        {/* Key Insights */}
        {globalAdvice?.keyInsights && globalAdvice.keyInsights.length > 0 && !compact && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Lightbulb className="h-3 w-3" />
              {t('dashboard.insights.keyInsights')}
            </h4>
            <div className="space-y-1.5">
              {globalAdvice.keyInsights.slice(0, 3).map((insight: string, i: number) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="flex items-start gap-2 text-sm"
                >
                  <TrendingUp className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                  <span className="text-muted-foreground line-clamp-1">{insight}</span>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Quick metrics */}
        {globalMetrics && (
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50">
            <div className="text-center">
              <p className="text-lg font-bold">{globalMetrics.totalConversations || 0}</p>
              <p className="text-xs text-muted-foreground">{t('dashboard.insights.conversations')}</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold">{globalMetrics.avgSatisfaction?.toFixed(1) || 'N/A'}</p>
              <p className="text-xs text-muted-foreground">{t('dashboard.insights.satisfaction')}</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold">{globalMetrics.agentCount || 0}</p>
              <p className="text-xs text-muted-foreground">{t('dashboard.insights.agents')}</p>
            </div>
          </div>
        )}

        {/* Link to full insights */}
        <Link to="/agent-reports" className="block">
          <Button variant="ghost" size="sm" className="w-full justify-between group">
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              {t('dashboard.insights.viewAll')}
            </span>
            <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
};