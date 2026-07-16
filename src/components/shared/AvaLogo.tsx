import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import logoImage from '@/assets/ava-logo.png';

interface AvaLogoProps {
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
  showText?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: {
    container: 'h-8 gap-2',
    icon: 'h-10 w-10',
    iconContainer: 'w-10 h-10',
    text: 'text-lg',
    subtitle: 'text-[8px]',
  },
  md: {
    container: 'h-10 gap-2.5',
    icon: 'h-12 w-12',
    iconContainer: 'w-12 h-12',
    text: 'text-xl',
    subtitle: 'text-[10px]',
  },
  lg: {
    container: 'h-16 gap-3',
    icon: 'h-16 w-16',
    iconContainer: 'w-16 h-16',
    text: 'text-3xl',
    subtitle: 'text-xs',
  },
};

export function AvaLogo({ size = 'md', animated = true, showText = true, className }: AvaLogoProps) {
  const sizes = sizeClasses[size];

  const iconVariants = {
    initial: { scale: 1, rotate: 0 },
    animate: {
      scale: [1, 1.05, 1],
      rotate: [0, 5, -5, 0],
      transition: {
        duration: 4,
        repeat: Infinity,
        ease: 'easeInOut' as const,
      },
    },
  };

  return (
    <div className={cn('flex items-center', sizes.container, className)}>
      <motion.div
        variants={iconVariants}
        initial="initial"
        animate={animated ? 'animate' : 'initial'}
        className={cn(sizes.iconContainer, 'overflow-hidden')}
      >
        <img
          src={logoImage}
          alt="AVA Statistics"
          className={cn(sizes.icon, 'object-cover')}
        />
      </motion.div>

      {showText && (
        <div className="flex flex-col">
          <motion.span
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className={cn(
              sizes.text,
              'font-black tracking-tight text-[#8B5CF6]'
            )}
          >
            LEMTEL
          </motion.span>
          <motion.span
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className={cn(
              sizes.subtitle,
              'font-medium tracking-widest uppercase -mt-1 text-[#8B5CF6]'
            )}
          >
            Communications
          </motion.span>
        </div>
      )}
    </div>
  );
}
