import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

const LEMTEL_ORG_ID = '71755d33-ed64-4ad5-a828-61c9d2029eb7';

export type SyncJob = {
  id: string;
  job_type: string;
  status: 'running' | 'success' | 'completed' | 'completed_with_errors' | 'failed' | 'error';
  started_at: string;
  completed_at: string | null;
  error: string | null;
};

export function useSyncStatus(organizationId: string = LEMTEL_ORG_ID) {
  const [latest, setLatest] = useState<SyncJob | null>(null);
  const [syncing, setSyncing] = useState(false);

  const fetchLatest = useCallback(async () => {
    const { data } = await (supabase as any)
      .from('pbx_sync_jobs')
      .select('id,job_type,status,started_at,completed_at,error')
      .eq('organization_id', organizationId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) setLatest(data as SyncJob);
  }, [organizationId]);

  useEffect(() => {
    fetchLatest();
    const ch = supabase
      .channel(`sync-jobs-${organizationId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'pbx_sync_jobs',
        filter: `organization_id=eq.${organizationId}`,
      }, () => fetchLatest())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [organizationId, fetchLatest]);

  const syncNow = useCallback(async (kind: string = 'all') => {
    setSyncing(true);
    try {
      await supabase.functions.invoke('realtime-sync', {
        body: { kind, organizationId },
      });
    } finally {
      setSyncing(false);
      fetchLatest();
    }
  }, [organizationId, fetchLatest]);

  return { latest, syncing, syncNow };
}
