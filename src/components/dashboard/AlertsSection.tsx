import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { 
  Bell, 
  AlertTriangle, 
  TrendingDown,
  Clock,
  CheckCircle,
  ArrowRight
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { useTranslation } from '@/hooks/useTranslation';

interface Alert {
  id: string;
  type: 'satisfaction' | 'volume' | 'duration' | 'sentiment';
  severity: 'warning' | 'critical' | 'info';
  title: string;
  description: string;
  timestamp: string;
}

export const AlertsSection = () => {
  const { selectedOrgId } = useOrganization();
  const { t, language } = useTranslation();
  const dateLocale = language === 'fr' ? fr : enUS;

  const { data: alerts, isLoading } = useQuery({
    queryKey: ['dashboard-alerts', selectedOrgId],
    queryFn: async (): Promise<Alert[]> => {
      if (!selectedOrgId) return [];

      const { data: lowSatConversations } = await supabase
        .from('agent_insights')
        .select('id, conversation_id, satisfaction_score, created_at, overall_sentiment')
        .eq('organization_id', selectedOrgId)
        .lt('satisfaction_score', 3)
        .order('created_at', { ascending: false })
        .limit(5);

      const generatedAlerts: Alert[] = [];

      if (lowSatConversations && lowSatConversations.length > 0) {
        lowSatConversations.forEach((conv) => {
          generatedAlerts.push({
            id: conv.id,
            type: 'satisfaction',
            severity: conv.satisfaction_score && conv.satisfaction_score < 2 ? 'critical' : 'warning',
            title: t('dashboard.alerts.lowSatisfaction'),
            description: `${t('dashboard.alerts.score')} ${conv.satisfaction_score?.toFixed(1)}/5 - ${t('conversations.sentiment.' + (conv.overall_sentiment || 'neutral'))}`,
            timestamp: conv.created_at || new Date().toISOString(),
          });
        });
      }

      return generatedAlerts.slice(0, 5);
    },
    enabled: !!selectedOrgId,
    staleTime: 2 * 60 * 1000,
  });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-500 bg-red-500/10 border-red-500/30';
      case 'warning': return 'text-amber-500 bg-amber-500/10 border-amber-500/30';
      case 'info': return 'text-blue-500 bg-blue-500/10 border-blue-500/30';
      default: return 'text-muted-foreground';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'satisfaction': return TrendingDown;
      case 'volume': return AlertTriangle;
      case 'duration': return Clock;
      case 'sentiment': return AlertTriangle;
      default: return Bell;
    }
  };

  if (isLoading) {
    return (
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="h-5 w-5 text-amber-500" />
            {t('dashboard.alerts.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-muted rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasAlerts = alerts && alerts.length > 0;

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="h-5 w-5 text-amber-500" />
            {t('dashboard.alerts.title')}
            {hasAlerts && (
              <Badge variant="outline" className="text-amber-500 border-amber-500/30">
                {alerts.length}
              </Badge>
            )}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {!hasAlerts ? (
          <div className="text-center py-6">
            <CheckCircle className="h-10 w-10 mx-auto mb-2 text-emerald-500/50" />
            <p className="text-sm text-muted-foreground">{t('dashboard.alerts.noAlerts')}</p>
            <p className="text-xs text-muted-foreground mt-1">{t('dashboard.alerts.allGood')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert, index) => {
              const Icon = getTypeIcon(alert.type);
              return (
                <motion.div
                  key={alert.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${getSeverityColor(alert.severity)}`}
                >
                  <Icon className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{alert.title}</p>
                    <p className="text-xs opacity-80 line-clamp-1">{alert.description}</p>
                    <p className="text-xs opacity-60 mt-1">
                      {formatDistanceToNow(new Date(alert.timestamp), { 
                        addSuffix: true, 
                        locale: dateLocale 
                      })}
                    </p>
                  </div>
                </motion.div>
              );
            })}

            <Link to="/conversations" className="block pt-2">
              <Button variant="ghost" size="sm" className="w-full justify-between group">
                <span>{t('dashboard.alerts.viewConversations')}</span>
                <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
