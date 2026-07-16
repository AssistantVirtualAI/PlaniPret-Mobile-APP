import { useState } from 'react';
import { AlertTriangle, Clock, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useBillingConfig } from '@/hooks/useBillingConfig';
import { useStripeSubscription } from '@/hooks/useStripeSubscription';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/utils';

export function TrialBanner() {
  const { t } = useTranslation();
  const { isTrialActive, trialDaysRemaining } = useBillingConfig();
  const { createCheckoutSession, isLoading } = useStripeSubscription();
  const [dismissed, setDismissed] = useState(false);

  if (!isTrialActive || dismissed) return null;

  const isUrgent = trialDaysRemaining <= 3;

  return (
    <div
      className={cn(
        'relative flex items-center justify-between gap-4 px-4 py-3 rounded-lg mb-4',
        isUrgent 
          ? 'bg-destructive/10 border border-destructive/30' 
          : 'bg-primary/10 border border-primary/30'
      )}
    >
      <div className="flex items-center gap-3">
        {isUrgent ? (
          <AlertTriangle className="h-5 w-5 text-destructive" />
        ) : (
          <Clock className="h-5 w-5 text-primary" />
        )}
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
          <span className="font-medium">
            {trialDaysRemaining} {trialDaysRemaining === 1 ? t('billing.trial.dayRemaining') : t('billing.trial.daysRemaining')}
          </span>
          <Badge variant={isUrgent ? 'destructive' : 'secondary'}>
            {t('billing.trial.freeTrial')}
          </Badge>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={isUrgent ? 'destructive' : 'default'}
          onClick={() => createCheckoutSession('price_growth_monthly')}
          disabled={isLoading}
          className="gap-2"
        >
          <Sparkles className="h-4 w-4" />
          {t('billing.trial.upgradeNow')}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => setDismissed(true)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
