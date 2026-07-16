import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SentimentPoint {
  time_percent: number;
  sentiment: 'positive' | 'negative' | 'neutral';
  reason: string;
}

interface SentimentTimelineProps {
  timeline: SentimentPoint[];
}

export function SentimentTimeline({ timeline }: SentimentTimelineProps) {
  if (!timeline || timeline.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-4">
        Aucune donnée de sentiment disponible
      </div>
    );
  }

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
        return 'bg-green-500';
      case 'negative':
        return 'bg-red-500';
      default:
        return 'bg-amber-500';
    }
  };

  const getSentimentY = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
        return 15;
      case 'negative':
        return 85;
      default:
        return 50;
    }
  };

  const getSentimentEmoji = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
        return '😊';
      case 'negative':
        return '😞';
      default:
        return '😐';
    }
  };

  return (
    <TooltipProvider delayDuration={100}>
      <div className="space-y-2">
        {/* Compact Graph */}
        <div className="relative h-16 bg-gradient-to-r from-muted/20 via-muted/30 to-muted/20 rounded-xl p-2 overflow-hidden">
          {/* Background zones */}
          <div className="absolute inset-0 flex flex-col">
            <div className="flex-1 bg-green-500/5" />
            <div className="flex-1 bg-amber-500/5" />
            <div className="flex-1 bg-red-500/5" />
          </div>

          {/* Y-axis emojis */}
          <div className="absolute left-1 top-0 h-full flex flex-col justify-between text-xs py-1">
            <span className="opacity-60">😊</span>
            <span className="opacity-60">😐</span>
            <span className="opacity-60">😞</span>
          </div>

          {/* Graph area */}
          <div className="ml-5 relative h-full">
            {/* Connection line with gradient */}
            <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
                  <stop offset="50%" stopColor="hsl(var(--primary))" stopOpacity="1" />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
                </linearGradient>
              </defs>
              <motion.path
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                d={timeline.map((point, i) => {
                  const y = getSentimentY(point.sentiment);
                  return i === 0 ? `M ${point.time_percent}% ${y}%` : `L ${point.time_percent}% ${y}%`;
                }).join(' ')}
                fill="none"
                stroke="url(#lineGradient)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>

            {/* Interactive points */}
            {timeline.map((point, index) => (
              <Tooltip key={index}>
                <TooltipTrigger asChild>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.1 + index * 0.08, type: "spring", stiffness: 300 }}
                    className={cn(
                      "absolute w-5 h-5 rounded-full -translate-x-1/2 -translate-y-1/2 cursor-pointer",
                      "flex items-center justify-center text-xs",
                      "ring-2 ring-background shadow-lg",
                      "hover:scale-125 transition-transform duration-150",
                      getSentimentColor(point.sentiment)
                    )}
                    style={{
                      left: `${point.time_percent}%`,
                      top: `${getSentimentY(point.sentiment)}%`,
                    }}
                  >
                    <span className="text-[10px]">{getSentimentEmoji(point.sentiment)}</span>
                  </motion.div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[200px] text-xs">
                  <p className="font-medium">{point.time_percent}%</p>
                  <p className="text-muted-foreground">{point.reason}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>

          {/* Progress bar at bottom */}
          <div className="absolute bottom-0 left-5 right-1 h-0.5 bg-muted/50 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-primary/50"
              initial={{ width: 0 }}
              animate={{ width: '100%' }}
              transition={{ duration: 1, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Compact legend - horizontal pills */}
        <div className="flex flex-wrap gap-1.5">
          {timeline.map((point, index) => (
            <Tooltip key={index}>
              <TooltipTrigger asChild>
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + index * 0.05 }}
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs cursor-pointer",
                    "bg-muted/50 hover:bg-muted transition-colors",
                    "border border-transparent hover:border-primary/20"
                  )}
                >
                  <span className={cn("w-1.5 h-1.5 rounded-full", getSentimentColor(point.sentiment))} />
                  <span className="text-muted-foreground">{point.time_percent}%</span>
                  <span>{getSentimentEmoji(point.sentiment)}</span>
                </motion.div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[220px]">
                <p className="text-xs">{point.reason}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
