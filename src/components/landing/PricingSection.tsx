import { useState } from 'react';
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles, Zap, Crown, MessageSquare, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { PLANS } from "@/hooks/useBillingConfig";
import { ContactSalesModal } from "@/components/billing/ContactSalesModal";

const planIcons = [Zap, Zap, Sparkles, Crown, Crown];
const planColors = [
  'from-gray-500 to-gray-600',
  'from-blue-500 to-cyan-500',
  'from-purple-500 to-pink-500',
  'from-orange-500 to-amber-500',
  'from-indigo-600 to-purple-700',
];

export const PricingSection = () => {
  const navigate = useNavigate();
  const { t, language } = useTranslation();
  const [showContactModal, setShowContactModal] = useState(false);

  // Show only main plans for landing page
  const displayPlans = PLANS.filter(p => ['starter', 'growth', 'ultimate', 'enterprise'].includes(p.id));

  return (
    <section className="py-32 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-secondary/5 to-background" />
      
      <div className="container mx-auto px-6 relative z-10">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <motion.div
            initial={{ scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20 text-accent mb-6"
          >
            <Crown className="w-4 h-4" />
            <span className="text-sm font-medium">{t('pricing.badge')}</span>
          </motion.div>
          
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            {t('pricing.title')}
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            {t('pricing.subtitle')}
          </p>

          {/* Trial badge */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="mt-6"
          >
            <Badge variant="secondary" className="bg-green-500/10 text-green-600 text-sm px-4 py-2">
              🎉 {language === 'fr' ? 'Essai gratuit de 14 jours • Aucune carte de crédit requise' : '14-day free trial • No credit card required'}
            </Badge>
          </motion.div>
        </motion.div>

        {/* Pricing cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
          {displayPlans.map((plan, index) => {
            const Icon = planIcons[index + 1];
            const isPopular = plan.popular;
            const isEnterprise = plan.isCustom;

            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                whileHover={{ y: -10 }}
                className={`relative rounded-3xl p-6 ${
                  isPopular 
                    ? "bg-gradient-to-b from-primary/20 to-card border-2 border-primary shadow-xl shadow-primary/20" 
                    : "bg-card/50 backdrop-blur-xl border border-border/50 hover:border-primary/50"
                } transition-all duration-300`}
              >
                {/* Popular badge */}
                {isPopular && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-gradient-to-r from-primary to-secondary text-white text-sm font-medium shadow-lg"
                  >
                    {t('pricing.popular')}
                  </motion.div>
                )}

                {/* Icon */}
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${planColors[index + 1]} flex items-center justify-center mb-6 shadow-lg`}>
                  <Icon className="w-7 h-7 text-white" />
                </div>

                {/* Plan info */}
                <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                <p className="text-muted-foreground mb-4 text-sm min-h-[40px]">
                  {plan.isCustom 
                    ? (language === 'fr' ? 'Solution personnalisée pour votre entreprise' : 'Custom solution for your business')
                    : `${plan.clientsIncluded} ${language === 'fr' ? 'clients inclus' : 'clients included'}`
                  }
                </p>

                {/* Price */}
                <div className="mb-6">
                  {plan.isCustom ? (
                    <span className="text-3xl font-bold">{language === 'fr' ? 'Sur mesure' : 'Custom'}</span>
                  ) : (
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold">${plan.price}</span>
                      <span className="text-muted-foreground text-sm">CAD{t('pricing.perMonth')}</span>
                    </div>
                  )}
                  {plan.additionalClientPrice && (
                    <p className="text-xs text-muted-foreground mt-1">
                      +${plan.additionalClientPrice}/{language === 'fr' ? 'client additionnel' : 'additional client'}
                    </p>
                  )}
                </div>

                {/* Key metrics */}
                <div className="grid grid-cols-2 gap-2 mb-6">
                  <div className="text-center p-2 bg-muted/50 rounded-lg">
                    <div className="text-sm font-bold text-primary">{plan.conversationsPerMonth}</div>
                    <div className="text-xs text-muted-foreground">{language === 'fr' ? 'Conv./mois' : 'Conv./month'}</div>
                  </div>
                  <div className="text-center p-2 bg-muted/50 rounded-lg">
                    <div className="text-sm font-bold text-primary">{plan.agentsIncluded}</div>
                    <div className="text-xs text-muted-foreground">{language === 'fr' ? 'Agents' : 'Agents'}</div>
                  </div>
                </div>

                {/* CTA */}
                <Button
                  className={`w-full h-12 mb-6 ${
                    isPopular 
                      ? "bg-gradient-to-r from-primary to-secondary hover:opacity-90 shadow-lg shadow-primary/25" 
                      : ""
                  }`}
                  variant={isPopular ? "default" : "outline"}
                  onClick={() => isEnterprise ? setShowContactModal(true) : navigate("/login")}
                >
                  {isEnterprise ? (
                    <>
                      <MessageSquare className="w-4 h-4 mr-2" />
                      {t('pricing.ctaContact')}
                    </>
                  ) : (
                    t('pricing.cta')
                  )}
                </Button>

                {/* Features */}
                <ul className="space-y-2">
                  {plan.features.slice(0, 6).map((feature: string, i: number) => (
                    <li key={i} className="flex items-center gap-2">
                      <div className={`w-5 h-5 rounded-full bg-gradient-to-br ${planColors[index + 1]} flex items-center justify-center flex-shrink-0`}>
                        <Check className="w-3 h-3 text-white" />
                      </div>
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                  {plan.features.length > 6 && (
                    <li className="text-xs text-muted-foreground text-center pt-2">
                      +{plan.features.length - 6} {language === 'fr' ? 'fonctionnalités' : 'more features'}
                    </li>
                  )}
                </ul>

                {/* Limitations */}
                {plan.limitations && plan.limitations.length > 0 && (
                  <div className="border-t mt-4 pt-4">
                    <ul className="space-y-1">
                      {plan.limitations.slice(0, 2).map((limitation, i) => (
                        <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <X className="w-3 h-3 flex-shrink-0" />
                          <span>{limitation}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Bottom note */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center text-muted-foreground mt-12"
        >
          {language === 'fr' 
            ? 'Tous les plans incluent un essai gratuit de 14 jours. Annulez à tout moment.'
            : 'All plans include a 14-day free trial. Cancel anytime.'}
        </motion.p>
      </div>

      <ContactSalesModal open={showContactModal} onOpenChange={setShowContactModal} />
    </section>
  );
};
