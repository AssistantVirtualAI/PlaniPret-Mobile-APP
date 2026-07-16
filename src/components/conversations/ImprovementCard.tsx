import { 
  Lightbulb, 
  MessageSquare, 
  Zap, 
  BookOpen, 
  Eye, 
  Wrench, 
  UserCheck,
  AlertTriangle,
  AlertCircle,
  Info
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/useTranslation';

export interface Improvement {
  category: 'tone' | 'response_speed' | 'knowledge' | 'clarity' | 'problem_solving' | 'handoff';
  priority: 'high' | 'medium' | 'low';
  suggestion: string;
  example?: string;
  recommended_action?: string;
}

interface ImprovementCardProps {
  improvement: Improvement;
  index?: number;
}

const categoryConfig = {
  tone: {
    icon: MessageSquare,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10'
  },
  response_speed: {
    icon: Zap,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10'
  },
  knowledge: {
    icon: BookOpen,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10'
  },
  clarity: {
    icon: Eye,
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500/10'
  },
  problem_solving: {
    icon: Wrench,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10'
  },
  handoff: {
    icon: UserCheck,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10'
  }
};

const priorityConfig = {
  high: {
    icon: AlertTriangle,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30'
  },
  medium: {
    icon: AlertCircle,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30'
  },
  low: {
    icon: Info,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30'
  }
};

export function ImprovementCard({ improvement, index = 0 }: ImprovementCardProps) {
  const { t } = useTranslation();
  const category = categoryConfig[improvement.category] || categoryConfig.knowledge;
  const priority = priorityConfig[improvement.priority] || priorityConfig.medium;
  const CategoryIcon = category.icon;
  const PriorityIcon = priority.icon;

  const categoryLabel: Record<string, string> = {
    tone: t('componentUi.improvementCard.tone'),
    response_speed: t('componentUi.improvementCard.responseSpeed'),
    knowledge: t('componentUi.improvementCard.knowledge'),
    clarity: t('componentUi.improvementCard.clarity'),
    problem_solving: t('componentUi.improvementCard.problemSolving'),
    handoff: t('componentUi.improvementCard.handoff'),
  };

  const priorityLabel: Record<string, string> = {
    high: t('componentUi.improvementCard.highPriority'),
    medium: t('componentUi.improvementCard.mediumPriority'),
    low: t('componentUi.improvementCard.lowPriority'),
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.3 }}
    >
      <Card className={cn(
        "glass-card border-l-4 hover:shadow-md transition-shadow",
        priority.borderColor
      )}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center",
                category.bgColor
              )}>
                <CategoryIcon className={cn("w-4 h-4", category.color)} />
              </div>
              <CardTitle className="text-sm font-medium">
                {categoryLabel[improvement.category] || improvement.category}
              </CardTitle>
            </div>
            <Badge 
              variant="outline" 
              className={cn(
                "text-xs",
                priority.color,
                priority.bgColor
              )}
            >
              <PriorityIcon className="w-3 h-3 mr-1" />
              {priorityLabel[improvement.priority] || improvement.priority}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Suggestion principale */}
          <div className="flex items-start gap-2">
            <Lightbulb className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <p className="text-sm font-medium">
              {improvement.suggestion}
            </p>
          </div>

          {/* Exemple tiré de la conversation */}
          {improvement.example && (
            <div className="pl-6">
              <div className="text-xs text-muted-foreground mb-1">{t('componentUi.improvementCard.example')}</div>
              <div className="text-xs bg-muted/50 rounded-lg p-2 italic">
                "{improvement.example}"
              </div>
            </div>
          )}

          {/* Action recommandée */}
          {improvement.recommended_action && (
            <div className="pl-6 pt-2 border-t border-border/50">
              <div className="text-xs text-muted-foreground mb-1">{t('componentUi.improvementCard.recommendedAction')}</div>
              <div className="text-sm text-primary font-medium">
                → {improvement.recommended_action}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

interface ImprovementsListProps {
  improvements: Improvement[];
}

export function ImprovementsList({ improvements }: ImprovementsListProps) {
  const { t } = useTranslation();

  if (!improvements || improvements.length === 0) {
    return (
      <Card className="glass-card p-6 text-center">
        <div className="text-4xl mb-2">🎉</div>
        <p className="text-muted-foreground">
          {t('componentUi.improvementCard.noImprovements')}
        </p>
      </Card>
    );
  }

  // Trier par priorité
  const sortedImprovements = [...improvements].sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
  });

  return (
    <div className="space-y-3">
      {sortedImprovements.map((improvement, index) => (
        <ImprovementCard 
          key={index} 
          improvement={improvement} 
          index={index}
        />
      ))}
    </div>
  );
}