import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { format, subDays, eachDayOfInterval, startOfDay, endOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';

export interface TwilioCallAnalytics {
  totalCalls: number;
  completedCalls: number;
  failedCalls: number;
  successRate: number;
  avgDuration: number;
  totalDuration: number;
  callsByDay: { date: string; calls: number; completed: number; failed: number }[];
  callsByStatus: { status: string; count: number }[];
  callsByDirection: { direction: string; count: number }[];
}

export function useTwilioCallsAnalytics(period: number = 7) {
  const { selectedOrgId } = useOrganization();
  const [analytics, setAnalytics] = useState<TwilioCallAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedOrgId) return;

    const fetchAnalytics = async () => {
      setLoading(true);
      setError(null);

      try {
        // Calculate date range
        const endDate = endOfDay(new Date());
        const startDate = startOfDay(subDays(new Date(), period - 1));

        // Fetch calls from Twilio API
        const { data, error: apiError } = await supabase.functions.invoke('twilio-proxy', {
          body: {
            action: 'list_calls',
            organizationId: selectedOrgId,
            startTime: format(startDate, 'yyyy-MM-dd'),
            endTime: format(endDate, 'yyyy-MM-dd'),
            limit: 500,
          },
        });

        if (apiError) {
          console.error('Twilio API error:', apiError);
          setError(apiError.message);
          setLoading(false);
          return;
        }

        const calls = data?.calls || [];
        console.log('[Analytics] Fetched calls from Twilio:', calls.length);

        // Calculate analytics
        const totalCalls = calls.length;
        const completedCalls = calls.filter((c: any) => c.status === 'completed').length;
        const failedCalls = calls.filter((c: any) => 
          ['failed', 'busy', 'no-answer', 'canceled'].includes(c.status)
        ).length;
        const successRate = totalCalls > 0 ? (completedCalls / totalCalls) * 100 : 0;

        // Calculate durations
        const durations = calls
          .filter((c: any) => c.duration && parseInt(c.duration) > 0)
          .map((c: any) => parseInt(c.duration));
        const totalDuration = durations.reduce((sum: number, d: number) => sum + d, 0);
        const avgDuration = durations.length > 0 ? totalDuration / durations.length : 0;

        // Group calls by day
        const dateRange = eachDayOfInterval({ start: startDate, end: endDate });
        const callsByDay = dateRange.map((date) => {
          const dayStr = format(date, 'yyyy-MM-dd');
          const dayCalls = calls.filter((c: any) => {
            const callDate = new Date(c.date_created || c.start_time);
            return format(callDate, 'yyyy-MM-dd') === dayStr;
          });
          return {
            date: format(date, 'dd/MM', { locale: fr }),
            calls: dayCalls.length,
            completed: dayCalls.filter((c: any) => c.status === 'completed').length,
            failed: dayCalls.filter((c: any) => 
              ['failed', 'busy', 'no-answer', 'canceled'].includes(c.status)
            ).length,
          };
        });

        // Group calls by status
        const statusCounts: Record<string, number> = {};
        calls.forEach((c: any) => {
          const status = c.status || 'unknown';
          statusCounts[status] = (statusCounts[status] || 0) + 1;
        });
        const callsByStatus = Object.entries(statusCounts).map(([status, count]) => ({
          status,
          count,
        }));

        // Group calls by direction
        const directionCounts: Record<string, number> = {};
        calls.forEach((c: any) => {
          const direction = c.direction || 'unknown';
          directionCounts[direction] = (directionCounts[direction] || 0) + 1;
        });
        const callsByDirection = Object.entries(directionCounts).map(([direction, count]) => ({
          direction,
          count,
        }));

        setAnalytics({
          totalCalls,
          completedCalls,
          failedCalls,
          successRate,
          avgDuration,
          totalDuration,
          callsByDay,
          callsByStatus,
          callsByDirection,
        });
      } catch (err: any) {
        console.error('[Analytics] Error:', err);
        setError(err.message || 'Failed to fetch analytics');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [selectedOrgId, period]);

  return { analytics, loading, error };
}
