import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PortalPageHeaderProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  gradient?: 'blue-purple' | 'green-cyan' | 'pink-orange' | 'purple-pink';
  actions?: React.ReactNode;
}

const gradientClasses = {
  'blue-purple': 'from-blue-500 to-purple-500',
  'green-cyan': 'from-green-400 to-cyan-400',
  'pink-orange': 'from-pink-500 to-orange-400',
  'purple-pink': 'from-purple-500 to-pink-500',
};

export function PortalPageHeader({
  icon: Icon,
  title,
  description,
  gradient = 'blue-purple',
  actions,
}: PortalPageHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8"
    >
      <div className="flex items-center gap-4">
        <div className={cn(
          'rounded-xl p-3 bg-gradient-to-br shadow-lg',
          gradientClasses[gradient]
        )}>
          <Icon className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          {description && (
            <p className="text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
      </div>
      
      {actions && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="flex items-center gap-2"
        >
          {actions}
        </motion.div>
      )}
    </motion.div>
  );
}
