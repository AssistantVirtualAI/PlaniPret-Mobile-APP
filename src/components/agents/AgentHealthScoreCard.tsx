import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Heart, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  SmilePlus,
  MessageSquare,
  CheckCircle,
  Activity
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface AgentHealthScoreCardProps {
  healthScore: number;
  avgSatisfaction: number;
  avgSentiment: number;
  avgResolution: number;
  totalConversations: number;
  trend: 'up' | 'down' | 'stable';
  size?: 'sm' | 'md' | 'lg';
}

export function AgentHealthScoreCard({
  healthScore,
  avgSatisfaction,
  avgSentiment,
  avgResolution,
  totalConversations,
  trend,
  size = 'md'
}: AgentHealthScoreCardProps) {
  const getHealthColor = (score: number) => {
    if (score >= 8) return 'text-green-500';
    if (score >= 6) return 'text-yellow-500';
    if (score >= 4) return 'text-orange-500';
    return 'text-red-500';
  };

  const getHealthBgColor = (score: number) => {
    if (score >= 8) return 'bg-green-500';
    if (score >= 6) return 'bg-yellow-500';
    if (score >= 4) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getHealthLabel = (score: number) => {
    if (score >= 9) return 'Excellent';
    if (score >= 8) return 'Très bon';
    if (score >= 7) return 'Bon';
    if (score >= 6) return 'Correct';
    if (score >= 5) return 'Moyen';
    if (score >= 4) return 'À améliorer';
    return 'Critique';
  };

  const getTrendIcon = () => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'down':
        return <TrendingDown className="w-4 h-4 text-red-500" />;
      default:
        return <Minus className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const metrics = [
    {
      label: 'Satisfaction',
      value: avgSatisfaction,
      icon: SmilePlus,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500'
    },
    {
      label: 'Sentiment',
      value: avgSentiment,
      icon: Heart,
      color: 'text-pink-500',
      bgColor: 'bg-pink-500'
    },
    {
      label: 'Résolution',
      value: avgResolution / 10, // Normaliser sur 10
      icon: CheckCircle,
      color: 'text-green-500',
      bgColor: 'bg-green-500'
    }
  ];

  return (
    <Card className="glass-card overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Health Score Agent
          </div>
          <div className="flex items-center gap-1">
            {getTrendIcon()}
            <Badge variant="outline" className="text-xs">
              {totalConversations} conversations
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Score principal */}
        <div className="flex items-center justify-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', duration: 0.5 }}
            className="relative"
          >
            <div className={cn(
              "w-32 h-32 rounded-full flex items-center justify-center",
              "bg-gradient-to-br from-muted to-muted/50",
              "ring-4 ring-offset-2 ring-offset-background",
              getHealthBgColor(healthScore).replace('bg-', 'ring-')
            )}>
              <div className="text-center">
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className={cn("text-4xl font-bold", getHealthColor(healthScore))}
                >
                  {healthScore.toFixed(1)}
                </motion.span>
                <p className="text-xs text-muted-foreground">/10</p>
              </div>
            </div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="absolute -bottom-2 left-1/2 -translate-x-1/2"
            >
              <Badge className={cn(
                "whitespace-nowrap",
                getHealthBgColor(healthScore),
                "text-white"
              )}>
                {getHealthLabel(healthScore)}
              </Badge>
            </motion.div>
          </motion.div>
        </div>

        {/* Métriques détaillées */}
        <div className="space-y-4 pt-4">
          {metrics.map((metric, index) => (
            <motion.div
              key={metric.label}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + index * 0.1 }}
              className="space-y-2"
            >
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <metric.icon className={cn("w-4 h-4", metric.color)} />
                  <span className="text-muted-foreground">{metric.label}</span>
                </div>
                <span className="font-medium">{metric.value.toFixed(1)}/10</span>
              </div>
              <Progress 
                value={metric.value * 10} 
                className={cn("h-2", `[&>div]:${metric.bgColor}`)}
              />
            </motion.div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Version compacte pour les listes
interface AgentHealthBadgeProps {
  score: number;
  showLabel?: boolean;
}

export function AgentHealthBadge({ score, showLabel = true }: AgentHealthBadgeProps) {
  const getColor = () => {
    if (score >= 8) return 'bg-green-500/10 text-green-500 border-green-500/30';
    if (score >= 6) return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30';
    if (score >= 4) return 'bg-orange-500/10 text-orange-500 border-orange-500/30';
    return 'bg-red-500/10 text-red-500 border-red-500/30';
  };

  return (
    <Badge variant="outline" className={cn("gap-1", getColor())}>
      <Activity className="w-3 h-3" />
      <span className="font-bold">{score.toFixed(1)}</span>
      {showLabel && <span className="text-xs opacity-70">/10</span>}
    </Badge>
  );
}
