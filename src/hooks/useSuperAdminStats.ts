import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { subMonths, startOfMonth, format } from 'date-fns';

interface OrganizationWithBilling {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  is_active: boolean | null;
  client_count?: number;
  member_count?: number;
  billing_config?: {
    plan_tier: string | null;
    subscription_status: string | null;
    trial_ends_at: string | null;
    stripe_customer_id: string | null;
    credits_used?: number | null;
    credits_limit?: number | null;
  };
}

interface SuperAdminStats {
  totalOrganizations: number;
  activeOrganizations: number;
  inactiveOrganizations: number;
  newThisMonth: number;
  newThisWeek: number;
  newToday: number;
  activeSubscriptions: number;
  activeTrials: number;
  trialsExpiringSoon: number;
  totalClients: number;
  totalMembers: number;
  totalCreditsUsed: number;
  planDistribution: Record<string, number>;
  growthData: Array<{ month: string; organizations: number }>;
}

export const useSuperAdminStats = () => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['super-admin-stats'],
    queryFn: async () => {
      // Fetch all organizations with their billing config
      const { data: orgs, error: orgsError } = await supabase
        .from('organizations')
        .select(`
          id,
          name,
          slug,
          created_at,
          is_active,
          billing_config (
            plan_tier,
            subscription_status,
            trial_ends_at,
            stripe_customer_id,
            credits_used,
            credits_limit
          )
        `)
        .order('created_at', { ascending: false });

      if (orgsError) throw orgsError;

      // Fetch client counts per organization
      const { data: clientCounts, error: clientsError } = await supabase
        .from('clients')
        .select('organization_id');
      
      if (clientsError) throw clientsError;

      // Fetch member counts per organization
      const { data: memberRows, error: membersError } = await supabase
        .from('organization_members')
        .select('organization_id');
      if (membersError) throw membersError;

      // Count clients per org
      const clientCountMap: Record<string, number> = {};
      clientCounts?.forEach(client => {
        if (client.organization_id) {
          clientCountMap[client.organization_id] = (clientCountMap[client.organization_id] || 0) + 1;
        }
      });

      const memberCountMap: Record<string, number> = {};
      memberRows?.forEach(m => {
        if (m.organization_id) {
          memberCountMap[m.organization_id] = (memberCountMap[m.organization_id] || 0) + 1;
        }
      });

      // Add client + member counts to organizations
      const organizations: OrganizationWithBilling[] = (orgs || []).map(org => ({
        ...org,
        client_count: clientCountMap[org.id] || 0,
        member_count: memberCountMap[org.id] || 0,
        billing_config: Array.isArray(org.billing_config) 
          ? org.billing_config[0] 
          : org.billing_config,
      }));

      // Calculate stats
      const now = new Date();
      const startOfThisMonth = startOfMonth(now);
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

      const stats: SuperAdminStats = {
        totalOrganizations: organizations.length,
        activeOrganizations: organizations.filter(o => o.is_active !== false).length,
        inactiveOrganizations: organizations.filter(o => o.is_active === false).length,
        newThisMonth: organizations.filter(o => new Date(o.created_at) >= startOfThisMonth).length,
        newThisWeek: organizations.filter(o => new Date(o.created_at) >= oneWeekAgo).length,
        newToday: organizations.filter(o => new Date(o.created_at) >= today).length,
        activeSubscriptions: organizations.filter(o => 
          o.billing_config?.subscription_status === 'active'
        ).length,
        activeTrials: organizations.filter(o => 
          o.billing_config?.subscription_status === 'trialing'
        ).length,
        trialsExpiringSoon: organizations.filter(o => {
          if (o.billing_config?.subscription_status !== 'trialing') return false;
          if (!o.billing_config?.trial_ends_at) return false;
          const trialEnd = new Date(o.billing_config.trial_ends_at);
          return trialEnd <= threeDaysFromNow && trialEnd >= now;
        }).length,
        totalClients: Object.values(clientCountMap).reduce((a, b) => a + b, 0),
        totalMembers: Object.values(memberCountMap).reduce((a, b) => a + b, 0),
        totalCreditsUsed: organizations.reduce(
          (sum, o) => sum + (o.billing_config?.credits_used || 0),
          0
        ),
        planDistribution: {},
        growthData: [],
      };

      // Calculate plan distribution
      const planCounts: Record<string, number> = {
        trial: 0,
        starter: 0,
        growth: 0,
        ultimate: 0,
        enterprise: 0,
      };

      organizations.forEach(org => {
        const plan = org.billing_config?.plan_tier || 'trial';
        if (planCounts[plan] !== undefined) {
          planCounts[plan]++;
        } else {
          planCounts[plan] = 1;
        }
      });

      stats.planDistribution = planCounts;

      // Calculate growth data (last 6 months)
      const growthData: Array<{ month: string; organizations: number }> = [];
      for (let i = 5; i >= 0; i--) {
        const monthDate = subMonths(now, i);
        const monthStart = startOfMonth(monthDate);
        const monthEnd = startOfMonth(subMonths(now, i - 1));
        
        const count = organizations.filter(o => {
          const created = new Date(o.created_at);
          return created <= monthEnd;
        }).length;

        growthData.push({
          month: format(monthDate, 'MMM'),
          organizations: count,
        });
      }
      stats.growthData = growthData;

      return { stats, organizations };
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  return {
    stats: data?.stats,
    organizations: data?.organizations || [],
    isLoading,
    error,
    refetch,
  };
};
