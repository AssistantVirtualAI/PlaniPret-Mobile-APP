import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, Clock, Phone, Target, CalendarClock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { DashboardMetrics } from '@/hooks/useDashboardMetrics';
import { useTranslation } from '@/hooks/useTranslation';

interface RecentActivityProps {
  metrics: DashboardMetrics;
  extraActivity?: { id: string; type: string; title: string; timestamp: string }[];
}

const isValidDate = (date: Date): boolean => {
  return date instanceof Date && !isNaN(date.getTime());
};

export const RecentActivity = ({ metrics, extraActivity }: RecentActivityProps) => {
  const { t, language } = useTranslation();
  const dateLocale = language === 'fr' ? fr : enUS;

  const formatTimestamp = (timestamp: string | undefined): string => {
    if (!timestamp) return t('dashboard.charts.unknownDate');
    const date = new Date(timestamp);
    if (!isValidDate(date)) return t('dashboard.charts.invalidDate');
    return formatDistanceToNow(date, { addSuffix: true, locale: dateLocale });
  };

  const items = (extraActivity && extraActivity.length > 0
    ? extraActivity
    : metrics.recentActivity
  )
    .filter((a) => !!a.timestamp)
    .slice(0, 10);

  const iconFor = (type: string) => {
    switch (type) {
      case 'call':
        return Phone;
      case 'lead':
        return Target;
      case 'appointment':
        return CalendarClock;
      default:
        return MessageSquare;
    }
  };

  if (items.length === 0) {
    return (
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">{t('dashboard.recentActivity.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            {t('dashboard.recentActivity.noActivity')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader>
        <CardTitle className="text-lg">{t('dashboard.recentActivity.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((activity) => {
          const Icon = iconFor(activity.type);
          return (
            <div
              key={activity.id}
              className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="p-2 rounded-lg bg-primary/10">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{activity.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {formatTimestamp(activity.timestamp)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
