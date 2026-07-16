import { Card } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { SimpleAnimatedCounter } from "@/components/ui/animated-counter";

interface StatCardProps {
  title: string;
  value: string | number;
  numericValue?: number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  trend?: number[];
  delay?: number;
  color?: "primary" | "emerald" | "amber" | "purple" | "cyan" | "pink" | "blue" | "orange";
  isGlowing?: boolean;
}

const colorClasses = {
  primary: {
    bg: "from-primary/20 to-primary/5",
    text: "text-primary",
    glow: "shadow-primary/40",
  },
  emerald: {
    bg: "from-emerald-500/20 to-emerald-500/5",
    text: "text-emerald-500",
    glow: "shadow-emerald-500/40",
  },
  amber: {
    bg: "from-amber-500/20 to-amber-500/5",
    text: "text-amber-500",
    glow: "shadow-amber-500/40",
  },
  purple: {
    bg: "from-purple-500/20 to-purple-500/5",
    text: "text-purple-500",
    glow: "shadow-purple-500/40",
  },
  cyan: {
    bg: "from-cyan-500/20 to-cyan-500/5",
    text: "text-cyan-500",
    glow: "shadow-cyan-500/40",
  },
  pink: {
    bg: "from-pink-500/20 to-pink-500/5",
    text: "text-pink-500",
    glow: "shadow-pink-500/40",
  },
  blue: {
    bg: "from-blue-500/20 to-blue-500/5",
    text: "text-blue-500",
    glow: "shadow-blue-500/40",
  },
  orange: {
    bg: "from-orange-500/20 to-orange-500/5",
    text: "text-orange-500",
    glow: "shadow-orange-500/40",
  },
};

export const StatCard = ({ 
  title, 
  value, 
  numericValue,
  change, 
  changeType = "neutral", 
  icon: Icon, 
  trend,
  delay = 0,
  color = "primary",
  isGlowing = false
}: StatCardProps) => {
  const changeColors = {
    positive: "text-emerald-500",
    negative: "text-destructive",
    neutral: "text-muted-foreground",
  };

  const colors = colorClasses[color];

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
        scale: 1.03, 
        y: -5,
        transition: { duration: 0.2 }
      }}
    >
      <Card className={`relative overflow-hidden stat-card glass-card p-6 border-border/50 ${
        isGlowing ? `shadow-lg ${colors.glow}` : ''
      }`}>
        {/* Animated glow background */}
        {isGlowing && (
          <motion.div
            className={`absolute inset-0 bg-gradient-to-br ${colors.bg} opacity-50`}
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        )}

        <div className="relative">
          <div className="flex items-start justify-between mb-4">
            <motion.div 
              className={`p-3 rounded-2xl bg-gradient-to-br ${colors.bg}`}
              whileHover={{ rotate: 10, scale: 1.1 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <Icon className={`w-6 h-6 ${colors.text}`} />
            </motion.div>
            {change && (
              <motion.span 
                className={`text-sm font-semibold ${changeColors[changeType]}`}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: delay + 0.2 }}
              >
                {change}
              </motion.span>
            )}
          </div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">{title}</h3>
          <div className="text-3xl font-bold tracking-tight">
            {numericValue !== undefined ? (
              <SimpleAnimatedCounter 
                value={numericValue}
                duration={1200 + delay * 500}
              />
            ) : (
              value
            )}
          </div>
          {trend && (
            <div className="mt-4 h-12 flex items-end gap-1">
              {trend.map((height, i) => (
                <motion.div
                  key={i}
                  initial={{ height: 0 }}
                  animate={{ height: `${height}%` }}
                  transition={{ delay: delay + 0.1 + i * 0.05, duration: 0.5 }}
                  className={`flex-1 bg-gradient-to-t ${colors.bg} rounded-t`}
                />
              ))}
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
};
