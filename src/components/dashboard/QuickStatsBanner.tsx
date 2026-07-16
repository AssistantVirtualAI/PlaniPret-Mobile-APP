import { Card } from '@/components/ui/card';
import { 
  MessageSquare, 
  Star, 
  TrendingUp, 
  TrendingDown,
  Activity,
  Zap
} from 'lucide-react';
import { DashboardMetrics } from '@/hooks/useDashboardMetrics';
import { motion } from 'framer-motion';
import { SimpleAnimatedCounter } from '@/components/ui/animated-counter';
import { useTranslation } from '@/hooks/useTranslation';

interface QuickStatsBannerProps {
  metrics: DashboardMetrics;
  isLoading?: boolean;
}

export const QuickStatsBanner = ({ metrics, isLoading }: QuickStatsBannerProps) => {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <Card className="bg-gradient-to-r from-primary/10 via-secondary/5 to-accent/10 border-primary/20">
        <div className="flex items-center justify-between px-6 py-4 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-muted" />
              <div className="space-y-1.5">
                <div className="h-3 w-16 bg-muted rounded" />
                <div className="h-5 w-12 bg-muted rounded" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  const isActive = metrics.conversationsToday > 0;

  const stats = [
    {
      icon: Activity,
      label: t('dashboard.quickStats.status'),
      value: isActive ? t('dashboard.quickStats.live') : t('dashboard.quickStats.quiet'),
      numericValue: undefined,
      isLive: isActive,
      color: isActive ? 'emerald' : 'muted',
      bgColor: isActive ? 'from-emerald-500/20 to-emerald-500/5' : 'from-muted/20 to-muted/5',
      textColor: isActive ? 'text-emerald-500' : 'text-muted-foreground',
      glow: isActive,
    },
    {
      icon: MessageSquare,
      label: t('dashboard.quickStats.today'),
      value: undefined,
      numericValue: metrics.conversationsToday,
      isLive: false,
      color: 'blue',
      bgColor: 'from-blue-500/20 to-blue-500/5',
      textColor: 'text-blue-500',
      glow: metrics.conversationsToday > 10,
    },
    {
      icon: Star,
      label: t('dashboard.quickStats.satisfaction'),
      value: metrics.avgSatisfaction > 0 ? undefined : 'N/A',
      numericValue: metrics.avgSatisfaction > 0 ? metrics.avgSatisfaction : undefined,
      suffix: '/5',
      decimals: 1,
      isLive: false,
      color: metrics.avgSatisfaction >= 4 ? 'amber' : metrics.avgSatisfaction >= 3 ? 'orange' : 'red',
      bgColor: metrics.avgSatisfaction >= 4 ? 'from-amber-500/20 to-amber-500/5' : 
               metrics.avgSatisfaction >= 3 ? 'from-orange-500/20 to-orange-500/5' : 
               'from-red-500/20 to-red-500/5',
      textColor: metrics.avgSatisfaction >= 4 ? 'text-amber-500' : 
                 metrics.avgSatisfaction >= 3 ? 'text-orange-500' : 'text-red-500',
      glow: metrics.avgSatisfaction >= 4,
    },
    {
      icon: metrics.conversationsTrend >= 0 ? TrendingUp : TrendingDown,
      label: t('dashboard.quickStats.trend'),
      value: metrics.conversationsTrend !== 0 
        ? `${metrics.conversationsTrend > 0 ? '+' : ''}${metrics.conversationsTrend}%` 
        : '—',
      numericValue: undefined,
      isLive: false,
      color: metrics.conversationsTrend > 0 ? 'emerald' : 
             metrics.conversationsTrend < 0 ? 'red' : 'muted',
      bgColor: metrics.conversationsTrend > 0 ? 'from-emerald-500/20 to-emerald-500/5' : 
               metrics.conversationsTrend < 0 ? 'from-red-500/20 to-red-500/5' : 
               'from-muted/20 to-muted/5',
      textColor: metrics.conversationsTrend > 0 ? 'text-emerald-500' : 
                 metrics.conversationsTrend < 0 ? 'text-red-500' : 'text-muted-foreground',
      glow: metrics.conversationsTrend > 10,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="relative overflow-hidden bg-gradient-to-r from-primary/10 via-card to-secondary/10 border-primary/20 shadow-lg shadow-primary/5">
        {/* Animated background effect */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-secondary/5"
          animate={{ 
            backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] 
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
          style={{ backgroundSize: '200% 100%' }}
        />

        <div className="relative flex items-center justify-between px-4 md:px-6 py-4 flex-wrap gap-4">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 15, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ 
                delay: index * 0.1,
                type: "spring",
                stiffness: 100
              }}
              className="flex items-center gap-3"
            >
              <motion.div 
                className={`relative p-2.5 rounded-xl bg-gradient-to-br ${stat.bgColor} ${stat.textColor}`}
                whileHover={{ scale: 1.1, rotate: 5 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                {stat.glow && (
                  <motion.div
                    className="absolute inset-0 rounded-xl bg-current opacity-30"
                    animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.1, 0.3] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                )}
                {stat.isLive ? (
                  <motion.div
                    animate={{ scale: [1, 1.15, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <stat.icon className="h-5 w-5 relative z-10" />
                  </motion.div>
                ) : (
                  <stat.icon className="h-5 w-5 relative z-10" />
                )}
              </motion.div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">{stat.label}</p>
                <div className={`text-base font-bold ${stat.textColor}`}>
                  {stat.numericValue !== undefined ? (
                    <SimpleAnimatedCounter 
                      value={stat.numericValue}
                      suffix={stat.suffix || ''}
                      decimals={stat.decimals || 0}
                      duration={1000 + index * 200}
                    />
                  ) : (
                    stat.value
                  )}
                </div>
              </div>
              {stat.isLive && (
                <motion.div
                  className="flex items-center gap-1"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                >
                  <motion.div
                    className="w-2 h-2 rounded-full bg-emerald-500"
                    animate={{ scale: [1, 1.3, 1], opacity: [1, 0.6, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                  <Zap className="w-3 h-3 text-amber-500" />
                </motion.div>
              )}
            </motion.div>
          ))}
        </div>
      </Card>
    </motion.div>
  );
};