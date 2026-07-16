import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface GlowBadgeProps {
  children: React.ReactNode;
  variant?: 'admin' | 'viewer' | 'success' | 'warning' | 'info' | 'secondary' | 'destructive' | 'primary';
  pulse?: boolean;
  className?: string;
}

const variantStyles: Record<string, { bg: string; glow: string; text: string }> = {
  admin: {
    bg: 'bg-gradient-to-r from-amber-400 to-orange-500',
    glow: 'bg-amber-400/50',
    text: 'text-white',
  },
  viewer: {
    bg: 'bg-gradient-to-r from-slate-400 to-slate-500',
    glow: 'bg-slate-400/30',
    text: 'text-white',
  },
  success: {
    bg: 'bg-gradient-to-r from-green-400 to-emerald-500',
    glow: 'bg-green-400/50',
    text: 'text-white',
  },
  warning: {
    bg: 'bg-gradient-to-r from-yellow-400 to-orange-400',
    glow: 'bg-yellow-400/50',
    text: 'text-white',
  },
  info: {
    bg: 'bg-gradient-to-r from-blue-400 to-cyan-500',
    glow: 'bg-blue-400/50',
    text: 'text-white',
  },
  secondary: {
    bg: 'bg-gradient-to-r from-slate-400 to-slate-500',
    glow: 'bg-slate-400/30',
    text: 'text-white',
  },
  destructive: {
    bg: 'bg-gradient-to-r from-red-400 to-rose-500',
    glow: 'bg-red-400/50',
    text: 'text-white',
  },
  primary: {
    bg: 'bg-gradient-to-r from-primary to-purple-500',
    glow: 'bg-primary/50',
    text: 'text-white',
  },
};

export function GlowBadge({ children, variant = 'info', pulse = false, className }: GlowBadgeProps) {
  const styles = variantStyles[variant];

  return (
    <div className={cn('relative inline-flex', className)}>
      {/* Glow effect */}
      <motion.div
        animate={pulse ? {
          opacity: [0.5, 0.8, 0.5],
          scale: [1, 1.05, 1],
        } : {}}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className={cn(
          'absolute inset-0 rounded-full blur-md',
          styles.glow
        )}
      />
      
      {/* Badge */}
      <span className={cn(
        'relative px-3 py-1 rounded-full text-xs font-semibold shadow-lg',
        styles.bg,
        styles.text
      )}>
        {children}
      </span>
    </div>
  );
}
