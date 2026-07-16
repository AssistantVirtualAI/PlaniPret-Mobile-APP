import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';

export interface BillingConfig {
  organization_id: string;
  plan_tier: string;
  subscription_status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  credits_limit: number;
  credits_used: number;
  ai_credits: number;
  subscription_ends_at: string | null;
  trial_ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Plan {
  id: string;
  name: string;
  price: number | null; // Monthly price (null for custom)
  priceAnnual: number | null; // Annual price
  priceId: string | null;
  priceIdAnnual: string | null;
  clientsIncluded: number | null;
  additionalClientPrice: number | null;
  features: string[];
  limitations?: string[];
  popular?: boolean;
  isCustom?: boolean;
  trialDays?: number;
  conversationsPerMonth?: string;
  agentsIncluded?: string;
  supportLevel?: string;
}

export interface Addon {
  id: string;
  name: string;
  price: number;
  priceId: string;
  availableFor: string[];
  description: string;
}

export const PLANS: Plan[] = [
  {
    id: 'trial',
    name: 'Free Trial',
    price: 0,
    priceAnnual: 0,
    priceId: null,
    priceIdAnnual: null,
    clientsIncluded: 1,
    additionalClientPrice: null,
    trialDays: 14,
    conversationsPerMonth: '100',
    agentsIncluded: '1',
    supportLevel: 'Community',
    features: [
      '1 client included',
      '1 AI agent',
      '100 conversations/month',
      'Basic analytics',
      'Community support',
      '1 integration',
      'Standard voice quality',
      'Knowledge base (10 docs)',
    ],
    limitations: [
      'No custom domain',
      'No white-label branding',
      'Limited knowledge base',
      '14-day trial period',
    ],
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 69,
    priceAnnual: 662, // ~20% off
    priceId: 'price_starter_monthly',
    priceIdAnnual: 'price_starter_annual',
    clientsIncluded: 5,
    additionalClientPrice: 10,
    conversationsPerMonth: '5,000',
    agentsIncluded: 'Unlimited',
    supportLevel: 'Email (48h)',
    features: [
      '5 clients included (+$10/additional)',
      'Unlimited AI agents',
      '5,000 conversations/month',
      'Advanced analytics',
      'Email support (48h response)',
      '3 integrations (ElevenLabs, Vapi, Retell)',
      'HD voice quality',
      'Custom domain',
      'Knowledge base (100 docs)',
      'Basic webhooks',
      'Conversation export',
    ],
    limitations: [
      'No white-label branding',
      'No API access',
      'No automated reports',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    price: 199,
    priceAnnual: 1910, // ~20% off
    priceId: 'price_growth_monthly',
    priceIdAnnual: 'price_growth_annual',
    clientsIncluded: 15,
    additionalClientPrice: 8,
    conversationsPerMonth: '25,000',
    agentsIncluded: 'Unlimited',
    supportLevel: 'Priority (24h)',
    popular: true,
    features: [
      '15 clients included (+$8/additional)',
      'Unlimited AI agents',
      '25,000 conversations/month',
      'Enterprise analytics + AI insights',
      'Priority support (24h response)',
      'Unlimited integrations',
      'Premium voice quality',
      'Custom domain + SSL',
      'Unlimited knowledge base',
      'Advanced webhooks',
      'Email white-label',
      'Custom KPI metrics',
      'Outbound calling campaigns',
      'Automated AI reports',
      'Team members (up to 5)',
    ],
    limitations: [
      'No full backend white-label',
      'No SSO/SAML',
    ],
  },
  {
    id: 'ultimate',
    name: 'Ultimate',
    price: 399,
    priceAnnual: 3830, // ~20% off
    priceId: 'price_ultimate_monthly',
    priceIdAnnual: 'price_ultimate_annual',
    clientsIncluded: 50,
    additionalClientPrice: 5,
    conversationsPerMonth: 'Unlimited',
    agentsIncluded: 'Unlimited',
    supportLevel: 'Dedicated (4h)',
    features: [
      '50 clients included (+$5/additional)',
      'Unlimited AI agents',
      'Unlimited conversations',
      'Custom analytics dashboard',
      'Dedicated support (4h response)',
      'Unlimited integrations',
      'Studio voice quality',
      'Full white-label (frontend + backend)',
      'Complete API access',
      'SSO/SAML integration',
      'Custom SLA',
      'Dedicated account manager',
      'Priority feature requests',
      'HIPAA compliance ready',
      'Unlimited team members',
      'Advanced security features',
    ],
    limitations: [],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: null, // Custom pricing
    priceAnnual: null,
    priceId: null,
    priceIdAnnual: null,
    clientsIncluded: null, // Unlimited
    additionalClientPrice: null,
    conversationsPerMonth: 'Unlimited',
    agentsIncluded: 'Unlimited',
    supportLevel: '24/7 Dedicated',
    isCustom: true,
    features: [
      'Unlimited clients',
      'Unlimited AI agents',
      'Unlimited conversations',
      'Custom analytics + BI integration',
      '24/7 dedicated support',
      'On-premise deployment option',
      'Custom AI model training',
      'Multi-region deployment',
      'Custom integrations development',
      'Dedicated infrastructure',
      'Training sessions included',
      'Quarterly business reviews',
      'Custom contract terms',
      'Volume discounts',
      'SOC 2 Type II compliance',
    ],
    limitations: [],
  },
];

export const ADDONS: Addon[] = [
  {
    id: 'hipaa',
    name: 'HIPAA Compliance',
    price: 200,
    priceId: 'price_hipaa_addon',
    availableFor: ['starter', 'growth', 'ultimate'],
    description: 'HIPAA compliance for healthcare data',
  },
  {
    id: 'saas_configurator',
    name: 'SaaS Configurator',
    price: 200,
    priceId: 'price_saas_addon',
    availableFor: ['growth'],
    description: 'Advanced SaaS configuration (Growth only)',
  },
  {
    id: 'extra_conversations',
    name: 'Extra Conversations',
    price: 50,
    priceId: 'price_extra_conversations',
    availableFor: ['starter', 'growth', 'ultimate'],
    description: '10,000 additional conversations per month',
  },
];

export function useBillingConfig() {
  const { selectedOrg: selectedOrganization } = useOrganization();

  const { data: billingConfig, isLoading, refetch } = useQuery({
    queryKey: ['billing-config', selectedOrganization?.id],
    queryFn: async () => {
      if (!selectedOrganization?.id) return null;

      const { data, error } = await supabase
        .from('billing_config')
        .select('*')
        .eq('organization_id', selectedOrganization.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data as BillingConfig | null;
    },
    enabled: !!selectedOrganization?.id,
  });

  const currentPlan = PLANS.find(p => p.id === billingConfig?.plan_tier) || PLANS[0];

  // Calculate savings for annual plans
  const getAnnualSavings = (plan: Plan): number => {
    if (!plan.priceAnnual || !plan.price) return 0;
    return (plan.price * 12) - plan.priceAnnual;
  };

  // Trial calculations
  const trialEndsAt = billingConfig?.trial_ends_at ? new Date(billingConfig.trial_ends_at) : null;
  const now = new Date();
  
  const isTrialActive = trialEndsAt && trialEndsAt > now && billingConfig?.plan_tier === 'trial';
  
  const trialDaysRemaining = trialEndsAt 
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;
  
  const isTrialExpired = trialEndsAt && trialEndsAt <= now && billingConfig?.plan_tier === 'trial';
  
  const isTrialExpiringSoon = isTrialActive && trialDaysRemaining <= 3;

  return {
    billingConfig,
    currentPlan,
    isLoading,
    refetch,
    getAnnualSavings,
    // Trial-related exports
    isTrialActive,
    trialDaysRemaining,
    isTrialExpired,
    isTrialExpiringSoon,
    trialEndsAt,
  };
}
