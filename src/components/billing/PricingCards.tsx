import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Check, Loader2, Sparkles, X, MessageSquare, Users, Zap, Crown } from 'lucide-react';
import { PLANS, useBillingConfig } from '@/hooks/useBillingConfig';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/useTranslation';
import { ContactSalesModal } from './ContactSalesModal';

interface PricingCardsProps {
  currentPlanId: string;
  onSelectPlan: (priceId: string) => void;
  isLoading: boolean;
}

const planIcons: Record<string, React.ElementType> = {
  trial: Zap,
  starter: Zap,
  growth: Sparkles,
  ultimate: Crown,
  enterprise: Crown,
};

export const PricingCards = ({ currentPlanId, onSelectPlan, isLoading }: PricingCardsProps) => {
  const { t, language } = useTranslation();
  const [isAnnual, setIsAnnual] = useState(true);
  const [showContactModal, setShowContactModal] = useState(false);
  const { getAnnualSavings } = useBillingConfig();

  return (
    <div className="space-y-6">
      {/* Trial banner */}
      <div className="text-center p-4 bg-primary/5 rounded-lg border border-primary/20">
        <Badge variant="secondary" className="bg-green-500/10 text-green-600 mb-2">
          {language === 'fr' ? '🎉 Essai gratuit de 14 jours' : '🎉 14-day free trial'}
        </Badge>
        <p className="text-sm text-muted-foreground">
          {language === 'fr' 
            ? 'Essayez toutes les fonctionnalités gratuitement. Aucune carte de crédit requise.'
            : 'Try all features for free. No credit card required.'}
        </p>
      </div>

      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-4">
        <span className={cn("text-sm", !isAnnual && "font-semibold")}>
          {language === 'fr' ? 'Mensuel' : 'Monthly'}
        </span>
        <Switch
          checked={isAnnual}
          onCheckedChange={setIsAnnual}
        />
        <span className={cn("text-sm", isAnnual && "font-semibold")}>
          {language === 'fr' ? 'Annuel' : 'Annual'}
          <Badge variant="secondary" className="ml-2 bg-green-500/10 text-green-600">
            {language === 'fr' ? 'Économisez jusqu\'à 20%' : 'Save up to 20%'}
          </Badge>
        </span>
      </div>

      {/* Plans grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          const isUpgrade = PLANS.findIndex(p => p.id === plan.id) > PLANS.findIndex(p => p.id === currentPlanId);
          const price = isAnnual ? plan.priceAnnual : plan.price;
          const priceId = isAnnual ? plan.priceIdAnnual : plan.priceId;
          const savings = getAnnualSavings(plan);
          const Icon = planIcons[plan.id] || Zap;

          return (
            <Card 
              key={plan.id} 
              className={cn(
                'relative transition-all hover:scale-[1.02] flex flex-col',
                plan.popular && 'border-primary ring-2 ring-primary/20',
                isCurrent && 'border-green-500 bg-green-500/5'
              )}
            >
              {plan.popular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">
                  <Sparkles className="h-3 w-3 mr-1" />
                  {language === 'fr' ? 'Plus populaire' : 'Most Popular'}
                </Badge>
              )}
              {isCurrent && (
                <Badge className="absolute -top-3 right-4 bg-green-500">
                  {language === 'fr' ? 'Plan actuel' : 'Current Plan'}
                </Badge>
              )}

              <CardHeader className="text-center pb-2">
                <div className="mx-auto w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <CardDescription className="min-h-[40px]">
                  {plan.isCustom ? (
                    <span className="text-3xl font-bold text-foreground">
                      {language === 'fr' ? 'Sur mesure' : 'Custom'}
                    </span>
                  ) : plan.price === 0 ? (
                    <span className="text-3xl font-bold text-foreground">
                      {language === 'fr' ? 'Gratuit' : 'Free'}
                    </span>
                  ) : (
                    <>
                      <span className="text-3xl font-bold text-foreground">
                        ${isAnnual && price ? Math.round(price / 12) : price}
                      </span>
                      <span className="text-muted-foreground text-sm">
                        {language === 'fr' ? '/mois' : '/month'}
                      </span>
                      {isAnnual && price && price > 0 && (
                        <div className="mt-1">
                          <span className="text-xs text-muted-foreground">
                            ${price}{language === 'fr' ? '/an' : '/year'}
                          </span>
                          {savings > 0 && (
                            <Badge variant="outline" className="ml-2 text-xs text-green-600 border-green-600/30">
                              -{Math.round((savings / (plan.price! * 12)) * 100)}%
                            </Badge>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4 flex-1 flex flex-col">
                {/* Key metrics */}
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-2 bg-muted/50 rounded-lg">
                    <div className="text-lg font-bold text-primary">
                      {plan.clientsIncluded ?? '∞'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {language === 'fr' ? 'Clients' : 'Clients'}
                    </div>
                  </div>
                  <div className="p-2 bg-muted/50 rounded-lg">
                    <div className="text-sm font-bold text-primary">
                      {plan.conversationsPerMonth}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {language === 'fr' ? 'Conv./mois' : 'Conv./month'}
                    </div>
                  </div>
                </div>

                {/* Additional client pricing */}
                {plan.additionalClientPrice && (
                  <div className="text-center text-xs text-muted-foreground p-2 bg-muted/30 rounded">
                    +${plan.additionalClientPrice}/{language === 'fr' ? 'client additionnel' : 'additional client'}
                  </div>
                )}

                {/* Features list */}
                <ul className="space-y-2 flex-1">
                  {plan.features.slice(0, 6).map((feature, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                      <span className="text-xs">{feature}</span>
                    </li>
                  ))}
                  {plan.features.length > 6 && (
                    <li className="text-xs text-muted-foreground text-center pt-1">
                      +{plan.features.length - 6} {language === 'fr' ? 'fonctionnalités' : 'more features'}
                    </li>
                  )}
                </ul>

                {/* Limitations */}
                {plan.limitations && plan.limitations.length > 0 && (
                  <div className="border-t pt-2">
                    <p className="text-xs text-muted-foreground mb-1">
                      {language === 'fr' ? 'Limitations:' : 'Limitations:'}
                    </p>
                    <ul className="space-y-1">
                      {plan.limitations.slice(0, 2).map((limitation, index) => (
                        <li key={index} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <X className="w-3 h-3 flex-shrink-0 mt-0.5" />
                          <span>{limitation}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* CTA Button */}
                <div className="pt-2">
                  {plan.isCustom ? (
                    <Button 
                      className="w-full"
                      variant="outline"
                      onClick={() => setShowContactModal(true)}
                    >
                      <MessageSquare className="w-4 h-4 mr-2" />
                      {language === 'fr' ? 'Nous contacter' : 'Contact Us'}
                    </Button>
                  ) : (
                    <Button 
                      className="w-full"
                      variant={isCurrent ? 'outline' : plan.popular ? 'default' : 'outline'}
                      disabled={isCurrent || isLoading || !priceId}
                      onClick={() => priceId && onSelectPlan(priceId)}
                    >
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : isCurrent ? (
                        language === 'fr' ? 'Plan actuel' : 'Current Plan'
                      ) : plan.price === 0 ? (
                        language === 'fr' ? 'Plan gratuit' : 'Free Plan'
                      ) : isUpgrade ? (
                        language === 'fr' ? 'Upgrader' : 'Upgrade'
                      ) : (
                        language === 'fr' ? 'Sélectionner' : 'Select'
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <ContactSalesModal open={showContactModal} onOpenChange={setShowContactModal} />
    </div>
  );
};
