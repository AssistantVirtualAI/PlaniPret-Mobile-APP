import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';

export interface DashboardOverview {
  period: { start: string; end: string; prevStart: string; prevEnd: string };
  conversations: {
    total: number;
    today: number;
    previous: number;
    trend: number;
    daily: { date: string; count: number }[];
  };
  voice: {
    callsTotal: number;
    callsToday: number;
    callsTrend: number;
    missed: number;
    voicemailsUnread: number;
    activeNow: number;
  };
  leads: {
    new: number;
    previous: number;
    trend: number;
    converted: number;
    conversionRate: number;
  };
  appointments: { upcoming7d: number; today: number; noShows: number };
  campaigns: {
    active: number;
    dialed: number;
    successful: number;
    failed: number;
    successRate: number;
  };
  handoffs: { pending: number; resolved: number };
  messaging: { smsIn: number; smsOut: number };
  team: { total: number; online: number };
  knowledge: { items: number };
  health: {
    erroredIntegrations: { platform: string; error: string | null }[];
    erroredCount: number;
  };
  billing: { orgName: string | null; trialEndsAt: string | null; trialDaysLeft: number | null };
  recentActivity: {
    id: string;
    type: 'conversation' | 'lead' | 'call' | 'appointment';
    title: string;
    timestamp: string;
  }[];
}

interface DateRange {
  start: Date;
  end: Date;
}

export function useDashboardOverview(dateRange?: DateRange) {
  const { selectedOrgId } = useOrganization();
  const qc = useQueryClient();

  const queryKey = [
    'dashboard-overview',
    selectedOrgId,
    dateRange?.start?.toISOString(),
    dateRange?.end?.toISOString(),
  ];

  const result = useQuery({
    queryKey,
    enabled: !!selectedOrgId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<DashboardOverview | null> => {
      if (!selectedOrgId) return null;
      const { data, error } = await supabase.functions.invoke('dashboard-overview', {
        body: {
          organizationId: selectedOrgId,
          startDate: dateRange ? format(dateRange.start, 'yyyy-MM-dd') : undefined,
          endDate: dateRange ? format(dateRange.end, 'yyyy-MM-dd') : undefined,
        },
      });
      if (error) throw error;
      return data as DashboardOverview;
    },
  });

  // Realtime invalidation
  useEffect(() => {
    if (!selectedOrgId) return;
    const channel = supabase
      .channel(`dashboard-overview-${selectedOrgId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversations', filter: `organization_id=eq.${selectedOrgId}` },
        () => qc.invalidateQueries({ queryKey }),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pbx_call_records', filter: `organization_id=eq.${selectedOrgId}` },
        () => qc.invalidateQueries({ queryKey }),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'leads', filter: `organization_id=eq.${selectedOrgId}` },
        () => qc.invalidateQueries({ queryKey }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'handoff_requests', filter: `organization_id=eq.${selectedOrgId}` },
        () => qc.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId]);

  return result;
}
