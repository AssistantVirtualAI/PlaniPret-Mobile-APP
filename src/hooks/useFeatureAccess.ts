import { useBillingConfig } from './useBillingConfig';

export type Feature =
  | 'unlimited_agents'
  | 'custom_domain'
  | 'stripe_billing'
  | 'email_templates'
  | 'custom_kpis'
  | 'outbound_campaigns'
  | 'whitelabel_email'
  | 'whitelabel_backend'
  | 'api_access'
  | 'priority_support'
  | 'dedicated_support'
  | 'hipaa_compliance'
  | 'saas_configurator';

const FEATURE_MATRIX: Record<string, Feature[]> = {
  free: ['unlimited_agents'],
  starter: [
    'unlimited_agents',
    'custom_domain',
    'stripe_billing',
    'email_templates',
  ],
  growth: [
    'unlimited_agents',
    'custom_domain',
    'stripe_billing',
    'email_templates',
    'custom_kpis',
    'outbound_campaigns',
    'whitelabel_email',
    'priority_support',
  ],
  ultimate: [
    'unlimited_agents',
    'custom_domain',
    'stripe_billing',
    'email_templates',
    'custom_kpis',
    'outbound_campaigns',
    'whitelabel_email',
    'whitelabel_backend',
    'api_access',
    'priority_support',
    'dedicated_support',
  ],
  enterprise: [
    'unlimited_agents',
    'custom_domain',
    'stripe_billing',
    'email_templates',
    'custom_kpis',
    'outbound_campaigns',
    'whitelabel_email',
    'whitelabel_backend',
    'api_access',
    'priority_support',
    'dedicated_support',
    'hipaa_compliance',
    'saas_configurator',
  ],
};

const FEATURE_LABELS: Record<Feature, string> = {
  unlimited_agents: 'Agents illimités',
  custom_domain: 'Domaine personnalisé',
  stripe_billing: 'Facturation Stripe',
  email_templates: 'Templates email',
  custom_kpis: 'KPIs personnalisés',
  outbound_campaigns: 'Campagnes sortantes',
  whitelabel_email: 'Email white-label',
  whitelabel_backend: 'Backend white-label',
  api_access: 'Accès API',
  priority_support: 'Support prioritaire',
  dedicated_support: 'Support dédié 24/7',
  hipaa_compliance: 'Conformité HIPAA',
  saas_configurator: 'SaaS Configurator',
};

const FEATURE_MIN_PLAN: Record<Feature, string> = {
  unlimited_agents: 'free',
  custom_domain: 'starter',
  stripe_billing: 'starter',
  email_templates: 'starter',
  custom_kpis: 'growth',
  outbound_campaigns: 'growth',
  whitelabel_email: 'growth',
  whitelabel_backend: 'ultimate',
  api_access: 'ultimate',
  priority_support: 'growth',
  dedicated_support: 'ultimate',
  hipaa_compliance: 'starter', // Add-on
  saas_configurator: 'growth', // Add-on (Growth only)
};

export const useFeatureAccess = () => {
  const { billingConfig, currentPlan } = useBillingConfig();
  const currentTier = billingConfig?.plan_tier || 'free';

  const hasFeature = (feature: Feature): boolean => {
    const features = FEATURE_MATRIX[currentTier] || FEATURE_MATRIX.free;
    return features.includes(feature);
  };

  const getRequiredPlan = (feature: Feature): string => {
    return FEATURE_MIN_PLAN[feature] || 'ultimate';
  };

  const getFeatureLabel = (feature: Feature): string => {
    return FEATURE_LABELS[feature] || feature;
  };

  const canAccessFeature = (feature: Feature): boolean => {
    if (currentTier === 'enterprise') return true;
    // Add-ons are handled separately
    if (feature === 'hipaa_compliance') {
      return billingConfig?.plan_tier !== 'free'; // Available on paid plans
    }
    if (feature === 'saas_configurator') {
      return billingConfig?.plan_tier === 'growth'; // Growth only
    }
    return hasFeature(feature);
  };

  return {
    hasFeature,
    canAccessFeature,
    getRequiredPlan,
    getFeatureLabel,
    currentTier,
    currentPlan,
  };
};
