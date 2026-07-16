import { motion } from 'framer-motion';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

interface PortalStatCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  gradient?: 'blue' | 'green' | 'purple' | 'pink' | 'blue-purple' | 'green-cyan' | 'pink-orange' | 'purple-pink';
  suffix?: string;
  delay?: number;
}

const gradientClasses: Record<string, string> = {
  'blue': 'from-blue-500 to-cyan-500',
  'green': 'from-green-400 to-emerald-500',
  'purple': 'from-purple-500 to-violet-500',
  'pink': 'from-pink-500 to-rose-500',
  'blue-purple': 'from-blue-500 to-purple-500',
  'green-cyan': 'from-green-400 to-cyan-400',
  'pink-orange': 'from-pink-500 to-orange-400',
  'purple-pink': 'from-purple-500 to-pink-500',
};

const iconBgClasses: Record<string, string> = {
  'blue': 'bg-blue-500/10 text-blue-500',
  'green': 'bg-green-500/10 text-green-500',
  'purple': 'bg-purple-500/10 text-purple-500',
  'pink': 'bg-pink-500/10 text-pink-500',
  'blue-purple': 'bg-blue-500/10 text-blue-500',
  'green-cyan': 'bg-green-500/10 text-green-500',
  'pink-orange': 'bg-pink-500/10 text-pink-500',
  'purple-pink': 'bg-purple-500/10 text-purple-500',
};

export function PortalStatCard({
  title,
  value,
  icon: Icon,
  trend,
  gradient = 'blue-purple',
  suffix = '',
  delay = 0,
}: PortalStatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay * 0.1, duration: 0.4 }}
    >
      <Card className="relative overflow-hidden border-0 bg-card/50 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 group">
        {/* Gradient border on hover */}
        <div className={cn(
          'absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-lg',
          'bg-gradient-to-r p-[1px]',
          gradientClasses[gradient]
        )}>
          <div className="absolute inset-[1px] bg-card rounded-lg" />
        </div>

        <div className="relative p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">{title}</p>
              <div className="flex items-baseline gap-1">
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: delay * 0.1 + 0.2 }}
                  className="text-3xl font-bold"
                >
                  {typeof value === 'number' ? value.toLocaleString() : value}
                </motion.span>
                {suffix && (
                  <span className="text-lg text-muted-foreground">{suffix}</span>
                )}
              </div>
              
              {trend && (
                <div className={cn(
                  'flex items-center gap-1 text-sm font-medium',
                  trend.isPositive ? 'text-green-500' : 'text-red-500'
                )}>
                  {trend.isPositive ? (
                    <TrendingUp className="h-4 w-4" />
                  ) : (
                    <TrendingDown className="h-4 w-4" />
                  )}
                  <span>{trend.isPositive ? '+' : ''}{trend.value}%</span>
                  <span className="text-muted-foreground font-normal">vs hier</span>
                </div>
              )}
            </div>

            <motion.div
              whileHover={{ scale: 1.1, rotate: 5 }}
              className={cn(
                'rounded-xl p-3',
                iconBgClasses[gradient]
              )}
            >
              <Icon className="h-6 w-6" />
            </motion.div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
