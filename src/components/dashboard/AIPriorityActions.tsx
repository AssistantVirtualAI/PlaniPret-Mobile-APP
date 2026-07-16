import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { 
  Zap, 
  ArrowRight,
  AlertTriangle,
  Target,
  Lightbulb
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from '@/hooks/useTranslation';

interface PriorityAction {
  action: string;
  agent: string;
  impact: 'high' | 'medium' | 'low';
}

export const AIPriorityActions = () => {
  const { t } = useTranslation();

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard-priority-actions'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('generate-global-advice', {
        body: { days: 7 }
      });
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high': return 'bg-red-500/10 text-red-500 border-red-500/30';
      case 'medium': return 'bg-amber-500/10 text-amber-500 border-amber-500/30';
      case 'low': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getImpactIcon = (impact: string) => {
    switch (impact) {
      case 'high': return <AlertTriangle className="h-3 w-3" />;
      case 'medium': return <Target className="h-3 w-3" />;
      case 'low': return <Lightbulb className="h-3 w-3" />;
      default: return null;
    }
  };

  if (isLoading) {
    return (
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5" />
            <Skeleton className="h-5 w-40" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error || !data?.globalAdvice?.priorityActions) {
    return (
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            {t('dashboard.priorityActions.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            <Lightbulb className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{t('dashboard.priorityActions.noActions')}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const actions: PriorityAction[] = data.globalAdvice.priorityActions.slice(0, 5);

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          {t('dashboard.priorityActions.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {actions.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Lightbulb className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{t('dashboard.priorityActions.excellentPerformance')}</p>
          </div>
        ) : (
          actions.map((action, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
                {index + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium line-clamp-2">{action.action}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Agent: {action.agent}
                </p>
              </div>
              <Badge variant="outline" className={`shrink-0 ${getImpactColor(action.impact)}`}>
                {getImpactIcon(action.impact)}
                <span className="ml-1 capitalize">{action.impact}</span>
              </Badge>
            </motion.div>
          ))
        )}

        <Link to="/agent-reports" className="block pt-2">
          <Button variant="ghost" size="sm" className="w-full justify-between group">
            <span>{t('dashboard.priorityActions.viewAll')}</span>
            <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
};
