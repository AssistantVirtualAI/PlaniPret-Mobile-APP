import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Clock, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface Row {
  bucket_hour: string;
  retries_scheduled: number;
  retries_succeeded: number;
  completed_after_retries: number;
  max_retries_exhausted: number;
  failed_runs: number;
  avg_success_latency_ms: number | null;
  avg_attempts: number | null;
  max_attempts_observed: number | null;
}

export function PendingSyncMetricsCard({ organizationId }: { organizationId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data } = await supabase
        .from('pending_sync_retry_metrics' as any)
        .select('*')
        .eq('organization_id', organizationId)
        .gte('bucket_hour', since)
        .order('bucket_hour', { ascending: false });
      if (!cancelled) {
        setRows(((data as unknown) as Row[]) || []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [organizationId]);

  const totals = rows.reduce(
    (acc, r) => ({
      scheduled: acc.scheduled + (r.retries_scheduled || 0),
      succeeded: acc.succeeded + (r.retries_succeeded || 0) + (r.completed_after_retries || 0),
      exhausted: acc.exhausted + (r.max_retries_exhausted || 0),
      latencySum: acc.latencySum + (Number(r.avg_success_latency_ms) || 0),
      latencyN: acc.latencyN + (r.avg_success_latency_ms != null ? 1 : 0),
      maxAttempts: Math.max(acc.maxAttempts, Number(r.max_attempts_observed) || 0),
    }),
    { scheduled: 0, succeeded: 0, exhausted: 0, latencySum: 0, latencyN: 0, maxAttempts: 0 },
  );
  const successRate = totals.scheduled > 0 ? Math.round((totals.succeeded / (totals.succeeded + totals.exhausted || 1)) * 100) : null;
  const avgLatency = totals.latencyN > 0 ? Math.round(totals.latencySum / totals.latencyN) : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Clock className="w-4 h-4" /> Pending-sync retries (24h)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-xs text-muted-foreground">Loading…</div>
        ) : totals.scheduled === 0 ? (
          <div className="text-xs text-muted-foreground">No pending-sync retries in the last 24 hours.</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <Metric icon={<TrendingUp className="w-3 h-3" />} label="Scheduled" value={totals.scheduled} />
            <Metric icon={<CheckCircle2 className="w-3 h-3 text-emerald-500" />} label="Success rate" value={successRate != null ? `${successRate}%` : '—'} />
            <Metric icon={<Clock className="w-3 h-3" />} label="Avg latency" value={avgLatency != null ? `${(avgLatency / 1000).toFixed(1)}s` : '—'} />
            <Metric icon={<AlertTriangle className="w-3 h-3 text-amber-500" />} label="Max-retry failures" value={totals.exhausted} sub={`peak ${totals.maxAttempts} attempts`} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded border bg-muted/30 p-2">
      <div className="flex items-center gap-1 text-muted-foreground">{icon}<span>{label}</span></div>
      <div className="mt-1 font-semibold text-base">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
