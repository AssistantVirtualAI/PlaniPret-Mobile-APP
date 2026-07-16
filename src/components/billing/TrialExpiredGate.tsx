import { Shield, Sparkles, ArrowRight, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useBillingConfig, PLANS } from '@/hooks/useBillingConfig';
import { useStripeSubscription } from '@/hooks/useStripeSubscription';
import { useTranslation } from '@/hooks/useTranslation';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface TrialExpiredGateProps {
  children: React.ReactNode;
}

export function TrialExpiredGate({ children }: TrialExpiredGateProps) {
  const { t } = useTranslation();
  const { isTrialExpired, billingConfig, isLoading } = useBillingConfig();
  const { createCheckoutSession, isLoading: checkoutLoading } = useStripeSubscription();
  const navigate = useNavigate();

  if (isLoading) return <>{children}</>;

  // Allow access if not expired or on a paid plan
  const isPaidPlan = billingConfig?.plan_tier && 
    !['free', 'trial'].includes(billingConfig.plan_tier) &&
    billingConfig.subscription_status === 'active';

  if (!isTrialExpired || isPaidPlan) {
    return <>{children}</>;
  }

  const paidPlans = PLANS.filter(p => p.priceId && !p.isCustom);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-5xl w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-destructive/10 mb-4">
            <Shield className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold">
            {t('billing.trial.trialExpiredTitle')}
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {t('billing.trial.trialExpiredDesc')}
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {paidPlans.map((plan) => (
            <Card
              key={plan.id}
              className={cn(
                'relative overflow-hidden transition-all hover:shadow-lg',
                plan.popular && 'border-primary shadow-md ring-2 ring-primary/20'
              )}
            >
              {plan.popular && (
                <div className="absolute top-0 right-0">
                  <Badge className="rounded-none rounded-bl-lg bg-primary text-primary-foreground">
                    {t('billing.planDetails.popular')}
                  </Badge>
                </div>
              )}
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-4xl font-bold">${plan.price}</span>
                  <span className="text-muted-foreground">{t('billing.planDetails.perMonth')}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {plan.features.slice(0, 6).map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full gap-2"
                  variant={plan.popular ? 'default' : 'outline'}
                  onClick={() => plan.priceId && createCheckoutSession(plan.priceId)}
                  disabled={checkoutLoading}
                >
                  {t('billing.planDetails.getStarted')}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Contact Sales */}
        <div className="text-center space-y-3">
          <p className="text-muted-foreground">
            {t('billing.trial.contactSalesInstead')}
          </p>
          <Button
            variant="ghost"
            className="gap-2"
            onClick={() => navigate('/contact')}
          >
            <MessageSquare className="w-4 h-4" />
            {t('billing.planDetails.contactUs')}
          </Button>
        </div>
      </div>
    </div>
  );
}
