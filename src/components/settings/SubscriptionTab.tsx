import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Check, CreditCard, ExternalLink, Clock, AlertTriangle, MessageSquare, Sparkles, Crown, Zap, X } from 'lucide-react';
import { useBillingConfig, PLANS } from '@/hooks/useBillingConfig';
import { useStripeSubscription } from '@/hooks/useStripeSubscription';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/utils';
import { TrialBanner } from '@/components/billing/TrialBanner';
import { TrialExpiredModal } from '@/components/billing/TrialExpiredModal';
import { ContactSalesModal } from '@/components/billing/ContactSalesModal';

const planIcons: Record<string, React.ElementType> = {
  trial: Zap,
  starter: Zap,
  growth: Sparkles,
  ultimate: Crown,
  enterprise: Crown,
};

export function SubscriptionTab() {
  const { t, language } = useTranslation();
  const { billingConfig, currentPlan, isLoading, isTrialActive, trialDaysRemaining, isTrialExpired, trialEndsAt } = useBillingConfig();
  const { createCheckoutSession, openCustomerPortal, isLoading: isActionLoading } = useStripeSubscription();
  const [isAnnual, setIsAnnual] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);

  const getPrice = (plan: typeof PLANS[0]) => {
    if (plan.price === null) return null;
    if (isAnnual && plan.priceAnnual) {
      return Math.round(plan.priceAnnual / 12);
    }
    return plan.price;
  };

  const getPriceLabel = (plan: typeof PLANS[0]) => {
    const price = getPrice(plan);
    if (price === null) return language === 'fr' ? 'Custom' : 'Custom';
    if (price === 0) return language === 'fr' ? 'Free' : 'Free';
    return `$${price}/${language === 'fr' ? 'month' : 'month'}`;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 bg-muted/50 animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Trial Banner */}
      <TrialBanner />
      
      {/* Trial Expired Modal */}
      <TrialExpiredModal />

      {/* Current Plan */}
      <Card className="glass-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CreditCard className="w-6 h-6 text-primary" />
              <div>
                <CardTitle>{language === 'fr' ? 'Current Plan' : 'Current Plan'}</CardTitle>
                <CardDescription>{language === 'fr' ? 'Your active subscription' : 'Your active subscription'}</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isTrialActive && (
                <Badge variant="secondary" className="bg-amber-500/10 text-amber-600">
                  <Clock className="w-3 h-3 mr-1" />
                  {trialDaysRemaining} {language === 'fr' ? 'days left' : 'days left'}
                </Badge>
              )}
              <Badge variant="default" className="text-lg px-4 py-2">
                {currentPlan.name}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-2xl font-bold">
                {currentPlan.price === 0 ? (language === 'fr' ? 'Free' : 'Free') : `$${currentPlan.price}/${language === 'fr' ? 'month' : 'month'}`}
              </p>
              {isTrialActive && trialEndsAt && (
                <p className="text-sm text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" />
                  {language === 'fr' ? 'Trial ends on' : 'Trial ends on'} {trialEndsAt.toLocaleDateString()}
                </p>
              )}
              {billingConfig?.subscription_ends_at && !isTrialActive && (
                <p className="text-sm text-muted-foreground">
                  {language === 'fr' ? 'Renewal on' : 'Renewal on'} {new Date(billingConfig.subscription_ends_at).toLocaleDateString()}
                </p>
              )}
            </div>
            {billingConfig?.stripe_customer_id && (
              <Button variant="outline" onClick={openCustomerPortal} disabled={isActionLoading}>
                <ExternalLink className="w-4 h-4 mr-2" />
                {language === 'fr' ? 'Manage subscription' : 'Manage subscription'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Billing Toggle */}
      <div className="flex items-center justify-center gap-4 py-4">
        <Label className={cn(!isAnnual && 'font-bold')}>{language === 'fr' ? 'Monthly' : 'Monthly'}</Label>
        <Switch checked={isAnnual} onCheckedChange={setIsAnnual} />
        <Label className={cn(isAnnual && 'font-bold')}>
          {language === 'fr' ? 'Annual' : 'Annual'}
          <Badge variant="secondary" className="ml-2 bg-green-500/10 text-green-500">
            -20%
          </Badge>
        </Label>
      </div>

      {/* Plans Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {PLANS.map((plan) => {
          const isCurrentPlan = plan.id === currentPlan.id;
          const isPopular = plan.popular;
          const Icon = planIcons[plan.id] || Zap;
          const priceId = isAnnual ? plan.priceIdAnnual : plan.priceId;

          return (
            <Card
              key={plan.id}
              className={cn(
                'glass-card relative flex flex-col',
                isPopular && 'border-primary ring-2 ring-primary/20',
                isCurrentPlan && 'bg-primary/5'
              )}
            >
              {isPopular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">
                  {language === 'fr' ? 'Popular' : 'Popular'}
                </Badge>
              )}
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                </div>
                <div className="text-2xl font-bold">
                  {getPriceLabel(plan)}
                </div>
                {isAnnual && plan.priceAnnual && plan.price && (
                  <p className="text-xs text-muted-foreground">
                    ${plan.priceAnnual}/{language === 'fr' ? 'year' : 'year'}
                  </p>
                )}
              </CardHeader>
              <CardContent className="space-y-4 flex-1 flex flex-col">
                {/* Key metrics */}
                <div className="grid grid-cols-2 gap-2 text-center text-xs">
                  <div className="p-2 bg-muted/50 rounded">
                    <div className="font-bold text-primary">{plan.clientsIncluded ?? '∞'}</div>
                    <div className="text-muted-foreground">{language === 'fr' ? 'Clients' : 'Clients'}</div>
                  </div>
                  <div className="p-2 bg-muted/50 rounded">
                    <div className="font-bold text-primary text-xs">{plan.conversationsPerMonth}</div>
                    <div className="text-muted-foreground">{language === 'fr' ? 'Conv.' : 'Conv.'}</div>
                  </div>
                </div>

                <ul className="space-y-1 flex-1">
                  {plan.features.slice(0, 5).map((feature, index) => (
                    <li key={index} className="flex items-start gap-2 text-xs">
                      <Check className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                {plan.limitations && plan.limitations.length > 0 && (
                  <ul className="space-y-1 border-t pt-2">
                    {plan.limitations.slice(0, 2).map((limitation, index) => (
                      <li key={index} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <X className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <span>{limitation}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {isCurrentPlan ? (
                  <Button className="w-full" disabled variant="outline">
                    {language === 'fr' ? 'Current Plan' : 'Current Plan'}
                  </Button>
                ) : plan.isCustom ? (
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => setShowContactModal(true)}
                  >
                    <MessageSquare className="w-4 h-4 mr-2" />
                    {language === 'fr' ? 'Contact Us' : 'Contact Us'}
                  </Button>
                ) : priceId ? (
                  <Button
                    className="w-full"
                    variant={isPopular ? 'default' : 'outline'}
                    onClick={() => createCheckoutSession(priceId)}
                    disabled={isActionLoading}
                  >
                    {plan.price! > (currentPlan.price || 0) 
                      ? (language === 'fr' ? 'Upgrade' : 'Upgrade') 
                      : (language === 'fr' ? 'Select' : 'Select')}
                  </Button>
                ) : (
                  <Button className="w-full" variant="outline" disabled>
                    {language === 'fr' ? 'Free Plan' : 'Free Plan'}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Billing Info Link */}
      {billingConfig?.stripe_customer_id && (
        <div className="text-center">
          <Button variant="link" onClick={openCustomerPortal} disabled={isActionLoading}>
            {language === 'fr' ? 'Edit billing info and view invoices' : 'Edit billing info and view invoices'}
            <ExternalLink className="w-4 h-4 ml-2" />
          </Button>
        </div>
      )}

      <ContactSalesModal open={showContactModal} onOpenChange={setShowContactModal} />
    </div>
  );
}
