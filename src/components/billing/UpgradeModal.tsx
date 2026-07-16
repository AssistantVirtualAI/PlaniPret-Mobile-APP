import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: '/mois',
    features: [
      '5 clients maximum',
      '1,000 crédits IA/mois',
      'Support par email',
      '1 intégration',
    ],
    current: true,
  },
  {
    name: 'Pro',
    price: '$49',
    period: '/mois',
    features: [
      '50 clients maximum',
      '10,000 crédits IA/mois',
      'Support prioritaire',
      'Intégrations illimitées',
      'Marque blanche',
      'Webhooks avancés',
    ],
    popular: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    features: [
      'Clients illimités',
      'Crédits IA sur mesure',
      'Support dédié 24/7',
      'SLA garanti',
      'Configuration personnalisée',
      'Formation incluse',
    ],
  },
];

export const UpgradeModal = ({ open, onOpenChange }: UpgradeModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="text-2xl text-center">
            Choisissez votre plan
          </DialogTitle>
        </DialogHeader>

        <div className="grid md:grid-cols-3 gap-6 mt-6">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-xl border p-6 ${
                plan.popular
                  ? 'border-primary shadow-lg scale-105'
                  : 'border-border/50'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-semibold">
                    Populaire
                  </span>
                </div>
              )}

              <div className="text-center mb-6">
                <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground">{plan.period}</span>
                </div>
              </div>

              <ul className="space-y-3 mb-6">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                className="w-full"
                variant={plan.current ? 'outline' : plan.popular ? 'default' : 'secondary'}
                disabled={plan.current}
              >
                {plan.current ? 'Plan actuel' : plan.name === 'Enterprise' ? 'Contactez-nous' : 'Mettre à niveau'}
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
