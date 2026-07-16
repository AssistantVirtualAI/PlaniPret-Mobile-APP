import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bot, Clock, Star, TrendingUp, Trophy, AlertTriangle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useTranslation } from '@/hooks/useTranslation';

interface AgentPerformance {
  name: string;
  conversations: number;
  satisfaction: number;
  duration: number;
}

interface AgentPerformanceCardProps {
  agents: AgentPerformance[];
  isLoading?: boolean;
}

export const AgentPerformanceCard = ({ agents, isLoading }: AgentPerformanceCardProps) => {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            {t('dashboard.performance.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-muted rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!agents || agents.length === 0) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            {t('dashboard.performance.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Bot className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground text-sm">{t('dashboard.performance.noAgents')}</p>
            <Link to="/agents" className="text-primary text-sm hover:underline mt-2 inline-block">
              {t('dashboard.performance.configureAgentsLink')}
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const getSatisfactionColor = (score: number) => {
    if (score >= 4) return 'text-emerald-500';
    if (score >= 3) return 'text-amber-500';
    return 'text-red-500';
  };

  const getSatisfactionBg = (score: number) => {
    if (score >= 4) return 'bg-emerald-500';
    if (score >= 3) return 'bg-amber-500';
    return 'bg-red-500';
  };

  const maxConversations = Math.max(...agents.map(a => a.conversations), 1);
  const sortedAgents = [...agents].sort((a, b) => b.satisfaction - a.satisfaction);
  const bestAgent = sortedAgents[0];

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          {t('dashboard.performance.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {agents.slice(0, 5).map((agent, index) => {
            const isBest = agent.name === bestAgent?.name && agent.satisfaction >= 4;
            const needsAttention = agent.satisfaction < 3;
            
            return (
              <motion.div 
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`p-3 rounded-lg transition-all ${
                  isBest ? 'bg-emerald-500/10 border border-emerald-500/20' : 
                  needsAttention ? 'bg-red-500/5 border border-red-500/20' :
                  'bg-muted/30 hover:bg-muted/50'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      isBest ? 'bg-gradient-to-br from-emerald-500 to-emerald-600' :
                      needsAttention ? 'bg-gradient-to-br from-red-500 to-red-600' :
                      'bg-gradient-to-br from-primary to-secondary'
                    }`}>
                      <span className="text-white text-xs font-bold">
                        {agent.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-sm flex items-center gap-1.5">
                        {agent.name}
                        {isBest && <Trophy className="h-3.5 w-3.5 text-amber-500" />}
                        {needsAttention && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
                      </span>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {agent.conversations} conv.
                  </Badge>
                </div>
                
                <div className="space-y-1.5 mb-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{t('dashboard.performance.relativeVolume')}</span>
                    <span className="text-foreground">
                      {Math.round((agent.conversations / maxConversations) * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-gradient-to-r from-primary to-secondary rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${(agent.conversations / maxConversations) * 100}%` }}
                      transition={{ delay: index * 0.05 + 0.2, duration: 0.5 }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1">
                    <Star className={`h-3.5 w-3.5 ${getSatisfactionColor(agent.satisfaction)}`} />
                    <span className={`font-medium ${getSatisfactionColor(agent.satisfaction)}`}>
                      {agent.satisfaction.toFixed(1)}/5
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{formatDuration(agent.duration)}</span>
                  </div>
                  {agent.satisfaction > 0 && (
                    <div className="flex items-center gap-1 ml-auto">
                      <TrendingUp className={`h-3.5 w-3.5 ${getSatisfactionColor(agent.satisfaction)}`} />
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
