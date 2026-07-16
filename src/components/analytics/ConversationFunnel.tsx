import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from '@/hooks/useTranslation';
import { motion } from 'framer-motion';

interface FunnelData {
  total: number;
  engaged: number;
  resolved: number;
  satisfied: number;
}

interface ConversationFunnelProps {
  data: FunnelData;
}

export function ConversationFunnel({ data }: ConversationFunnelProps) {
  const { t } = useTranslation();
  const max = data.total || 1;

  const steps = [
    { label: t('analytics.funnel.total'), value: data.total, color: 'hsl(var(--primary))' },
    { label: t('analytics.funnel.engaged'), value: data.engaged, color: 'hsl(var(--accent))' },
    { label: t('analytics.funnel.resolved'), value: data.resolved, color: 'hsl(142 76% 36%)' },
    { label: t('analytics.funnel.satisfied'), value: data.satisfied, color: 'hsl(262 83% 58%)' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t('analytics.funnel.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {steps.map((step, i) => {
          const pct = Math.round((step.value / max) * 100);
          return (
            <div key={step.label} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{step.label}</span>
                <span className="font-medium">{step.value} ({pct}%)</span>
              </div>
              <div className="h-6 bg-muted rounded-md overflow-hidden">
                <motion.div
                  className="h-full rounded-md"
                  style={{ backgroundColor: step.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, delay: i * 0.1 }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
