import { Card, CardContent } from '@/components/ui/card';
import { 
  MessageSquare, Clock, Users, Bot, TrendingUp, TrendingDown, 
  UserCheck, Star, CheckCircle, Smile, Activity
} from 'lucide-react';
import { DashboardMetrics } from '@/hooks/useDashboardMetrics';
import { motion } from 'framer-motion';
import { SimpleAnimatedCounter } from '@/components/ui/animated-counter';
import { useTranslation } from '@/hooks/useTranslation';

interface MetricsGridProps {
  metrics: DashboardMetrics;
  isLoading: boolean;
}

const MetricCard = ({
  title,
  value,
  numericValue,
  subValue,
  icon: Icon,
  trend,
  trendValue,
  previousValue,
  accentColor = 'primary',
  delay = 0,
  isImportant = false,
  suffix = '',
  decimals = 0,
}: {
  title: string;
  value?: string | number;
  numericValue?: number;
  subValue?: string;
  icon: React.ElementType;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  previousValue?: string;
  accentColor?: 'primary' | 'emerald' | 'amber' | 'purple' | 'cyan' | 'pink' | 'orange' | 'blue';
  delay?: number;
  isImportant?: boolean;
  suffix?: string;
  decimals?: number;
}) => {
  const colorClasses = {
    primary: {
      bg: 'bg-gradient-to-br from-primary/20 to-primary/5',
      text: 'text-primary',
      glow: 'shadow-primary/30',
      border: 'border-primary/30',
    },
    emerald: {
      bg: 'bg-gradient-to-br from-emerald-500/20 to-emerald-500/5',
      text: 'text-emerald-500',
      glow: 'shadow-emerald-500/30',
      border: 'border-emerald-500/30',
    },
    amber: {
      bg: 'bg-gradient-to-br from-amber-500/20 to-amber-500/5',
      text: 'text-amber-500',
      glow: 'shadow-amber-500/30',
      border: 'border-amber-500/30',
    },
    purple: {
      bg: 'bg-gradient-to-br from-purple-500/20 to-purple-500/5',
      text: 'text-purple-500',
      glow: 'shadow-purple-500/30',
      border: 'border-purple-500/30',
    },
    cyan: {
      bg: 'bg-gradient-to-br from-cyan-500/20 to-cyan-500/5',
      text: 'text-cyan-500',
      glow: 'shadow-cyan-500/30',
      border: 'border-cyan-500/30',
    },
    pink: {
      bg: 'bg-gradient-to-br from-pink-500/20 to-pink-500/5',
      text: 'text-pink-500',
      glow: 'shadow-pink-500/30',
      border: 'border-pink-500/30',
    },
    orange: {
      bg: 'bg-gradient-to-br from-orange-500/20 to-orange-500/5',
      text: 'text-orange-500',
      glow: 'shadow-orange-500/30',
      border: 'border-orange-500/30',
    },
    blue: {
      bg: 'bg-gradient-to-br from-blue-500/20 to-blue-500/5',
      text: 'text-blue-500',
      glow: 'shadow-blue-500/30',
      border: 'border-blue-500/30',
    },
  };

  const colors = colorClasses[accentColor];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ 
        delay, 
        duration: 0.4,
        type: "spring",
        stiffness: 100,
        damping: 15
      }}
      whileHover={{ 
        scale: 1.02, 
        y: -4,
        transition: { duration: 0.2 }
      }}
    >
      <Card className={`relative overflow-hidden bg-card/50 backdrop-blur-xl border transition-all duration-300 hover:border-opacity-100 ${
        isImportant 
          ? `${colors.border} shadow-lg ${colors.glow}` 
          : 'border-border/50 hover:border-primary/30'
      }`}>
        {/* Glow effect for important metrics */}
        {isImportant && (
          <motion.div
            className={`absolute inset-0 ${colors.bg} opacity-50`}
            animate={{ opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        )}
        
        <CardContent className="relative p-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{title}</p>
              <div className="text-2xl font-bold text-foreground tracking-tight">
                {numericValue !== undefined ? (
                  <SimpleAnimatedCounter 
                    value={numericValue} 
                    suffix={suffix}
                    decimals={decimals}
                    duration={1200 + delay * 500}
                  />
                ) : (
                  value
                )}
              </div>
              {subValue && (
                <p className="text-xs text-muted-foreground">{subValue}</p>
              )}
              {(trendValue || previousValue) && (
                <motion.div 
                  className="flex items-center gap-2 pt-0.5"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: delay + 0.3 }}
                >
                  {trendValue && (
                    <div className={`flex items-center gap-1 text-xs font-semibold ${
                      trend === 'up' ? 'text-emerald-500' : 
                      trend === 'down' ? 'text-red-500' : 'text-muted-foreground'
                    }`}>
                      {trend === 'up' && <TrendingUp className="h-3 w-3" />}
                      {trend === 'down' && <TrendingDown className="h-3 w-3" />}
                      <span>{trendValue}</span>
                    </div>
                  )}
                  {previousValue && (
                    <span className="text-xs text-muted-foreground">
                      vs {previousValue}
                    </span>
                  )}
                </motion.div>
              )}
            </div>
            <motion.div 
              className={`p-3 rounded-xl ${colors.bg} ${colors.text}`}
              whileHover={{ rotate: 10, scale: 1.1 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <Icon className="h-5 w-5" />
            </motion.div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export const MetricsGrid = ({ metrics, isLoading }: MetricsGridProps) => {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="glass-card">
                <CardContent className="p-4 h-24">
                  <div className="animate-pulse space-y-3">
                    <div className="h-3 bg-muted rounded w-20" />
                    <div className="h-6 bg-muted rounded w-16" />
                    <div className="h-2 bg-muted rounded w-24" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  const formatDuration = (seconds: number) => {
    if (!seconds) return '0m';
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const getTrend = (value: number): 'up' | 'down' | 'neutral' => {
    if (value > 0) return 'up';
    if (value < 0) return 'down';
    return 'neutral';
  };

  const formatTrendValue = (value: number): string => {
    const sign = value > 0 ? '+' : '';
    return `${sign}${value}%`;
  };

  // Calculate sentiment percentage for display
  const totalSentiment = metrics.sentimentBreakdown.positive + metrics.sentimentBreakdown.neutral + metrics.sentimentBreakdown.negative;
  const positivePercent = totalSentiment > 0 
    ? Math.round((metrics.sentimentBreakdown.positive / totalSentiment) * 100) 
    : 0;

  return (
    <div className="space-y-4">
      {/* Primary metrics - 3 columns */}
      <motion.div 
        className="grid grid-cols-2 lg:grid-cols-3 gap-3"
        initial="hidden"
        animate="visible"
        variants={{
          visible: { transition: { staggerChildren: 0.08 } }
        }}
      >
        <MetricCard
          title={t('dashboard.metrics.totalConversations')}
          numericValue={metrics.totalConversations}
          subValue={`${metrics.conversationsToday} ${t('dashboard.metrics.today')}`}
          icon={MessageSquare}
          trend={getTrend(metrics.conversationsTrend)}
          trendValue={metrics.conversationsTrend !== 0 ? formatTrendValue(metrics.conversationsTrend) : undefined}
          accentColor="blue"
          delay={0}
          isImportant={true}
        />
        <MetricCard
          title={t('dashboard.metrics.thisWeek')}
          numericValue={metrics.conversationsThisWeek}
          subValue={t('dashboard.metrics.last7days')}
          icon={TrendingUp}
          accentColor="emerald"
          delay={0.08}
          isImportant={metrics.conversationsThisWeek > 100}
        />
        <MetricCard
          title={t('dashboard.metrics.satisfaction')}
          numericValue={metrics.avgSatisfaction}
          suffix="/5"
          decimals={1}
          subValue={t('dashboard.metrics.avgScore')}
          icon={Star}
          trend={metrics.avgSatisfaction >= 4 ? 'up' : metrics.avgSatisfaction >= 3 ? 'neutral' : 'down'}
          accentColor="amber"
          delay={0.16}
          isImportant={true}
        />
        <MetricCard
          title={t('dashboard.metrics.resolutionRate')}
          numericValue={metrics.resolutionRate}
          suffix="%"
          subValue={`${metrics.resolvedConversations} ${t('dashboard.metrics.resolved')}`}
          icon={CheckCircle}
          trend={metrics.resolutionRate >= 80 ? 'up' : metrics.resolutionRate >= 60 ? 'neutral' : 'down'}
          accentColor="emerald"
          delay={0.24}
          isImportant={metrics.resolutionRate >= 80}
        />
        <MetricCard
          title={t('dashboard.metrics.positiveSentiment')}
          numericValue={positivePercent}
          suffix="%"
          subValue={`${metrics.sentimentBreakdown.positive} ${t('dashboard.metrics.positive')}`}
          icon={Smile}
          trend={positivePercent >= 60 ? 'up' : positivePercent >= 40 ? 'neutral' : 'down'}
          accentColor="cyan"
          delay={0.32}
        />
        <MetricCard
          title={t('dashboard.metrics.avgDuration')}
          value={formatDuration(metrics.avgDuration)}
          subValue={t('dashboard.metrics.perConversation')}
          icon={Clock}
          accentColor="purple"
          delay={0.40}
        />
      </motion.div>

      {/* Secondary metrics - 4 columns on larger screens */}
      <motion.div 
        className="grid grid-cols-2 lg:grid-cols-4 gap-3"
        initial="hidden"
        animate="visible"
        variants={{
          visible: { transition: { staggerChildren: 0.06, delayChildren: 0.5 } }
        }}
      >
        <MetricCard
          title={t('dashboard.metrics.activeClients')}
          numericValue={metrics.activeClients}
          subValue={t('dashboard.metrics.activeAccounts')}
          icon={Users}
          accentColor="orange"
          delay={0.48}
        />
        <MetricCard
          title={t('dashboard.metrics.aiAgents')}
          numericValue={metrics.totalAgents}
          subValue={t('dashboard.metrics.configured')}
          icon={Bot}
          accentColor="purple"
          delay={0.56}
        />
        <MetricCard
          title={t('dashboard.metrics.users')}
          numericValue={metrics.uniqueUsers}
          subValue={t('dashboard.metrics.thisWeek')}
          icon={UserCheck}
          trend={getTrend(metrics.usersTrend)}
          trendValue={metrics.usersTrend !== 0 ? formatTrendValue(metrics.usersTrend) : undefined}
          accentColor="cyan"
          delay={0.64}
        />
        <MetricCard
          title={t('dashboard.metrics.qualityScore')}
          numericValue={metrics.qualityScore > 0 ? metrics.qualityScore : 0}
          suffix={metrics.qualityScore > 0 ? "%" : ""}
          value={metrics.qualityScore <= 0 ? "N/A" : undefined}
          subValue={t('dashboard.metrics.aiPerformance')}
          icon={Activity}
          trend={metrics.qualityScore >= 80 ? 'up' : metrics.qualityScore >= 60 ? 'neutral' : 'down'}
          accentColor="pink"
          delay={0.72}
          isImportant={metrics.qualityScore >= 80}
        />
      </motion.div>
    </div>
  );
};