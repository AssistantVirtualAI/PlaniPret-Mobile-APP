import { ReactNode } from 'react';
import { useFeatureAccess, Feature } from '@/hooks/useFeatureAccess';
import { Badge } from '@/components/ui/badge';
import { Lock, Crown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface FeatureGateProps {
  feature: Feature;
  children: ReactNode;
  fallback?: ReactNode;
  showOverlay?: boolean;
  className?: string;
}

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  growth: 'Growth',
  ultimate: 'Ultimate',
};

export const FeatureGate = ({
  feature,
  children,
  fallback,
  showOverlay = true,
  className,
}: FeatureGateProps) => {
  const { canAccessFeature, getRequiredPlan, getFeatureLabel } = useFeatureAccess();

  if (canAccessFeature(feature)) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  const requiredPlan = getRequiredPlan(feature);
  const planLabel = PLAN_LABELS[requiredPlan] || requiredPlan;

  if (showOverlay) {
    return (
      <div className={cn('relative', className)}>
        <div className="opacity-40 pointer-events-none select-none">
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm rounded-lg">
          <div className="text-center p-4">
            <Lock className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium mb-1">
              {getFeatureLabel(feature)}
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              Disponible à partir du plan {planLabel}
            </p>
            <Link to="/billing">
              <Badge className="cursor-pointer hover:bg-primary/80">
                <Crown className="h-3 w-3 mr-1" />
                Passer à {planLabel}
              </Badge>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

// Simple badge component to show required plan
interface UpgradeBadgeProps {
  feature: Feature;
  className?: string;
}

export const UpgradeBadge = ({ feature, className }: UpgradeBadgeProps) => {
  const { getRequiredPlan } = useFeatureAccess();
  const requiredPlan = getRequiredPlan(feature);
  const planLabel = PLAN_LABELS[requiredPlan] || requiredPlan;

  return (
    <Link to="/billing">
      <Badge 
        variant="outline" 
        className={cn(
          'cursor-pointer hover:bg-primary/10 border-primary/30',
          className
        )}
      >
        <Crown className="h-3 w-3 mr-1 text-primary" />
        Plan {planLabel}+
      </Badge>
    </Link>
  );
};
