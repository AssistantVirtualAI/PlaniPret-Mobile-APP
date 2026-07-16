import { useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Crown, MessageSquare, Sparkles, Zap } from 'lucide-react';
import { useBillingConfig, PLANS } from '@/hooks/useBillingConfig';
import { useStripeSubscription } from '@/hooks/useStripeSubscription';
import { useTranslation } from '@/hooks/useTranslation';
import { ContactSalesModal } from './ContactSalesModal';

export function TrialExpiredModal() {
  const { t } = useTranslation();
  const { isTrialExpired } = useBillingConfig();
  const { createCheckoutSession, isLoading } = useStripeSubscription();
  const [showContactModal, setShowContactModal] = useState(false);
  const [open, setOpen] = useState(true);

  if (!isTrialExpired) return null;

  // Only show recommended plans
  const recommendedPlans = PLANS.filter(p => ['starter', 'growth', 'ultimate'].includes(p.id));

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <Crown className="h-8 w-8 text-destructive" />
            </div>
            <DialogTitle className="text-2xl">
              {t('billing.trial.expiredTitle')}
            </DialogTitle>
            <DialogDescription className="text-base">
              {t('billing.trial.expiredDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            {recommendedPlans.map((plan) => {
              const Icon = plan.id === 'starter' ? Zap : plan.id === 'growth' ? Sparkles : Crown;
              
              return (
                <div
                  key={plan.id}
                  className={`relative rounded-xl border p-6 ${
                    plan.popular 
                      ? 'border-primary ring-2 ring-primary/20 bg-primary/5' 
                      : 'border-border'
                  }`}
                >
                  {plan.popular && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">
                      {t('billing.mostPopular')}
                    </Badge>
                  )}

                  <div className="flex items-center gap-2 mb-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      plan.popular ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    }`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{plan.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {plan.clientsIncluded} {t('billing.clientsIncluded')}
                      </p>
                    </div>
                  </div>

                  <div className="mb-4">
                    <span className="text-3xl font-bold">${plan.price}</span>
                    <span className="text-muted-foreground">{t('billing.perMonth')}</span>
                  </div>

                  <ul className="space-y-2 mb-6">
                    {plan.features.slice(0, 5).map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    className="w-full"
                    variant={plan.popular ? 'default' : 'outline'}
                    disabled={isLoading || !plan.priceId}
                    onClick={() => plan.priceId && createCheckoutSession(plan.priceId)}
                  >
                    {t('billing.selectPlan')}
                  </Button>
                </div>
              );
            })}
          </div>

          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground mb-3">
              {t('billing.trial.needCustom')}
            </p>
            <Button variant="link" onClick={() => setShowContactModal(true)}>
              <MessageSquare className="h-4 w-4 mr-2" />
              {t('billing.contactSales')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ContactSalesModal 
        open={showContactModal} 
        onOpenChange={setShowContactModal} 
      />
    </>
  );
}
