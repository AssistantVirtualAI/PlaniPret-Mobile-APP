import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface SatisfactionScoreProps {
  score: number; // 1-10
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function SatisfactionScore({ 
  score, 
  size = 'md',
  showLabel = true 
}: SatisfactionScoreProps) {
  // Normaliser le score entre 1 et 10
  const normalizedScore = Math.min(10, Math.max(1, score));
  const percentage = (normalizedScore / 10) * 100;

  const getScoreColor = () => {
    if (normalizedScore >= 8) return 'text-green-500';
    if (normalizedScore >= 6) return 'text-yellow-500';
    if (normalizedScore >= 4) return 'text-orange-500';
    return 'text-red-500';
  };

  const getGradientColor = () => {
    if (normalizedScore >= 8) return 'from-green-500 to-emerald-400';
    if (normalizedScore >= 6) return 'from-yellow-500 to-amber-400';
    if (normalizedScore >= 4) return 'from-orange-500 to-amber-500';
    return 'from-red-500 to-rose-400';
  };

  const getScoreLabel = () => {
    if (normalizedScore >= 9) return 'Excellent';
    if (normalizedScore >= 8) return 'Très bien';
    if (normalizedScore >= 7) return 'Bien';
    if (normalizedScore >= 6) return 'Correct';
    if (normalizedScore >= 5) return 'Moyen';
    if (normalizedScore >= 4) return 'À améliorer';
    return 'Insatisfait';
  };

  const getScoreEmoji = () => {
    if (normalizedScore >= 9) return '🌟';
    if (normalizedScore >= 8) return '😊';
    if (normalizedScore >= 7) return '🙂';
    if (normalizedScore >= 6) return '😐';
    if (normalizedScore >= 5) return '😕';
    if (normalizedScore >= 4) return '😟';
    return '😞';
  };

  const sizeConfig = {
    sm: {
      container: 'w-16 h-16',
      text: 'text-lg',
      label: 'text-xs'
    },
    md: {
      container: 'w-24 h-24',
      text: 'text-2xl',
      label: 'text-sm'
    },
    lg: {
      container: 'w-32 h-32',
      text: 'text-4xl',
      label: 'text-base'
    }
  };

  const config = sizeConfig[size];

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Cercle de progression */}
      <div className={cn("relative", config.container)}>
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-muted/30"
          />
          {/* Progress circle */}
          <motion.circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="url(#scoreGradient)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${percentage * 2.83} 283`}
            initial={{ strokeDasharray: "0 283" }}
            animate={{ strokeDasharray: `${percentage * 2.83} 283` }}
            transition={{ duration: 1, ease: "easeOut" }}
          />
          {/* Gradient definition */}
          <defs>
            <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" className={cn("stop-color-current", getScoreColor())} />
              <stop offset="100%" className={cn("stop-color-current", getScoreColor())} />
            </linearGradient>
          </defs>
        </svg>

        {/* Score au centre */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className={cn("font-bold", config.text, getScoreColor())}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.5, type: "spring" }}
          >
            {normalizedScore.toFixed(1)}
          </motion.span>
          <span className="text-xs text-muted-foreground">/10</span>
        </div>
      </div>

      {/* Label et emoji */}
      {showLabel && (
        <motion.div
          className="flex items-center gap-1"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
        >
          <span className="text-lg">{getScoreEmoji()}</span>
          <span className={cn("font-medium", config.label, getScoreColor())}>
            {getScoreLabel()}
          </span>
        </motion.div>
      )}
    </div>
  );
}

interface SatisfactionBadgeProps {
  score: number;
}

export function SatisfactionBadge({ score }: SatisfactionBadgeProps) {
  const normalizedScore = Math.min(10, Math.max(1, score));

  const getBgColor = () => {
    if (normalizedScore >= 8) return 'bg-green-500/10 text-green-500 border-green-500/30';
    if (normalizedScore >= 6) return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30';
    if (normalizedScore >= 4) return 'bg-orange-500/10 text-orange-500 border-orange-500/30';
    return 'bg-red-500/10 text-red-500 border-red-500/30';
  };

  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border",
      getBgColor()
    )}>
      <span className="font-bold">{normalizedScore.toFixed(1)}</span>
      <span>/10</span>
    </span>
  );
}
