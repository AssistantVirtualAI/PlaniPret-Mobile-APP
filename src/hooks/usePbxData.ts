import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const DEFAULT_LEMTEL_ORG = '71755d33-ed64-4ad5-a828-61c9d2029eb7';

/** Read the super-admin's active customer domain (set via DomainSwitcher) */
function readActiveDomainOrg(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem('lemtel.activeDomain');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.org_id || null;
  } catch { return null; }
}

/**
 * Effective tenant org id.
 * - Resolved once at module load (DomainSwitcher triggers full reload on change).
 * - Falls back to the Lemtel ops org for customers without a pinned domain.
 */
export const LEMTEL_ORG: string = readActiveDomainOrg() || DEFAULT_LEMTEL_ORG;

export function getEffectiveOrgId(): string {
  return readActiveDomainOrg() || DEFAULT_LEMTEL_ORG;
}

function usePbxTable<T = any>(table: string, opts?: { order?: string; ascending?: boolean; limit?: number; filters?: Record<string, string | number | boolean>; gteFilters?: Record<string, string>; orFilter?: string; enabled?: boolean }) {
  return useQuery({
    queryKey: ['pbx', table, opts],
    enabled: opts?.enabled ?? true,
    queryFn: async () => {
      let q = supabase.from(table as any).select('*').eq('organization_id', LEMTEL_ORG);
      Object.entries(opts?.filters || {}).forEach(([key, value]) => { q = q.eq(key, value as any); });
      Object.entries(opts?.gteFilters || {}).forEach(([key, value]) => { q = q.gte(key, value); });
      if (opts?.orFilter) q = q.or(opts.orFilter);
      if (opts?.order) q = q.order(opts.order, { ascending: opts.ascending ?? false });
      if (opts?.limit) q = q.limit(opts.limit);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as T[];
    },
  });
}

export const usePbxExtensions = () => usePbxTable('pbx_extensions_safe', { order: 'extension', ascending: true });
export const usePbxDevices = () => usePbxTable('pbx_devices', { order: 'created_at' });
export const usePbxIvrs = () => usePbxTable('pbx_ivrs', { order: 'name', ascending: true });
export const usePbxIvrOptions = (ivrId: string | null) => useQuery({
  queryKey: ['pbx', 'pbx_ivr_options', ivrId],
  enabled: !!ivrId,
  queryFn: async () => {
    const { data, error } = await supabase.from('pbx_ivr_options' as any)
      .select('*').eq('ivr_id', ivrId).order('sort_order', { ascending: true });
    if (error) throw error;
    return data || [];
  },
});
export const usePbxIvrAudio = (ivrId: string | null) => useQuery({
  queryKey: ['pbx', 'pbx_ivr_audio', ivrId],
  enabled: !!ivrId,
  queryFn: async () => {
    const { data, error } = await supabase.from('pbx_ivr_audio' as any)
      .select('*').eq('ivr_id', ivrId).order('created_at', { ascending: false });
    if (error) throw error;
    const rows = (data || []) as any[];
    // Hydrate signed URLs for items in the bucket
    await Promise.all(rows.map(async (row: any) => {
      if (row.storage_path) {
        const { data: signed } = await supabase.storage
          .from('lemtel-ivr-audio').createSignedUrl(row.storage_path, 3600);
        if (signed?.signedUrl) row.audio_url = signed.signedUrl;
      }
    }));
    return rows;
  },
});
export const usePbxQueues = () => usePbxTable('pbx_call_queues', { order: 'name', ascending: true });
export const usePbxRingGroups = () => usePbxTable('pbx_ring_groups', { order: 'name', ascending: true });
export const usePbxCallRecords = (limit = 100, opts?: { extension?: string | null; enabled?: boolean; rangeDays?: 7 | 30 | null }) => {
  const qc = useQueryClient();
  const since = opts?.rangeDays ? (() => { const d = new Date(); d.setDate(d.getDate() - opts.rangeDays); d.setHours(0, 0, 0, 0); return d.toISOString(); })() : undefined;
  const q = usePbxTable('pbx_call_records', {
    order: 'start_at',
    limit,
    enabled: opts?.enabled,
    gteFilters: since ? { start_at: since } : undefined,
    orFilter: opts?.extension
      ? `extension.eq.${opts.extension},caller_number.eq.${opts.extension},destination_number.eq.${opts.extension},source_number.eq.${opts.extension}`
      : undefined,
  });
  // Live CDR sync: invalidate on any insert/update for this org.
  useEffect(() => {
    if (opts?.enabled === false) return;
    const ch = supabase
      .channel(`portal-cdr-${LEMTEL_ORG}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'pbx_call_records', filter: `organization_id=eq.${LEMTEL_ORG}` },
        () => { qc.invalidateQueries({ queryKey: ['pbx', 'pbx_call_records'] }); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, opts?.enabled]);
  return q;
};
export const usePbxSmsThreads = () => usePbxTable('pbx_sms_threads', { order: 'last_message_at' });
export const usePbxSmsMessages = (threadId: string | null) => useQuery({
  queryKey: ['pbx', 'pbx_sms_messages', threadId],
  enabled: !!threadId,
  queryFn: async () => {
    const { data, error } = await supabase.from('pbx_sms_messages' as any)
      .select('*').eq('thread_id', threadId).order('sent_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },
});
export const usePbxSoftphoneUsers = () => usePbxTable('pbx_softphone_users_safe', { order: 'extension', ascending: true });
export const usePbxDomainUsers = () => usePbxTable('pbx_domain_users', { order: 'username', ascending: true });
export const usePbxPhoneNumberAssignments = () => usePbxTable('pbx_phone_number_assignments', { order: 'created_at' });
export const usePbxAgents = () => useQuery({
  queryKey: ['pbx', 'agents'],
  queryFn: async () => {
    const { data, error } = await supabase.from('agents').select('*').eq('organization_id', LEMTEL_ORG).order('name');
    if (error) throw error;
    return data || [];
  },
});
export const usePbxClients = () => useQuery({
  queryKey: ['pbx', 'clients'],
  queryFn: async () => {
    const { data, error } = await supabase.from('clients').select('*').eq('organization_id', LEMTEL_ORG).order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },
});
export const usePbxPhoneNumbers = () => useQuery({
  queryKey: ['pbx', 'phone_numbers'],
  queryFn: async () => {
    const { data, error } = await supabase.from('phone_numbers').select('*').eq('organization_id', LEMTEL_ORG);
    if (error) throw error;
    return data || [];
  },
});

export const usePbxIntegration = () => useQuery({
  queryKey: ['pbx', 'integration'],
  queryFn: async () => {
    const { data, error } = await supabase.from('pbx_integrations' as any)
      .select('*').eq('organization_id', LEMTEL_ORG).maybeSingle();
    if (error) throw error;
    return data as any;
  },
});

/** Toggle mock_mode on/off in pbx_integrations.config */
export function usePbxMockModeToggle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const { data: integRaw, error: e1 } = await supabase
        .from('pbx_integrations' as any)
        .select('id, config')
        .eq('organization_id', LEMTEL_ORG)
        .maybeSingle();
      if (e1) throw e1;
      const integ = integRaw as { id?: string; config?: Record<string, unknown> } | null;
      const nextConfig = { ...(integ?.config || {}), mock_mode: enabled };
      if (integ?.id) {
        const { error } = await supabase.from('pbx_integrations' as any)
          .update({ config: nextConfig }).eq('id', integ.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('pbx_integrations' as any).insert({
          organization_id: LEMTEL_ORG, provider: 'fusionpbx', config: nextConfig, status: 'pending',
        });
        if (error) throw error;
      }
      return enabled;
    },
    onSuccess: (enabled) => {
      qc.invalidateQueries({ queryKey: ['pbx', 'integration'] });
      toast.success(`Mock mode ${enabled ? 'enabled' : 'disabled'}`);
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to toggle mock mode'),
  });
}

type SyncKind = 'cdr' | 'config' | 'devices' | 'ivr-queues' | 'all' | 'extensions';
type SyncOpts = {
  kind?: SyncKind;
  resources?: string[];
  start_date?: string;
  end_date?: string;
  extension?: string;
};

/** Manual "Refresh from PBX" — invokes fusionpbx-proxy and re-fetches affected tables. */
export function usePbxSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (arg: SyncKind | SyncOpts) => {
      const opts: SyncOpts = typeof arg === 'string' ? { kind: arg } : arg;
      const kind = opts.kind ?? 'all';
      const action = kind === 'cdr' ? 'sync-cdrs' : 'sync-all';
      const body: Record<string, unknown> = { action, organization_id: LEMTEL_ORG };
      if (opts.resources) body.resources = opts.resources;
      if (opts.start_date) body.start_date = opts.start_date;
      if (opts.end_date) body.end_date = opts.end_date;
      if (opts.extension) body.extension = opts.extension;
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', { body });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).message || (data as any).error);
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['pbx'] });
      const s = data?.stats;
      const msg = s ? Object.entries(s).filter(([k]) => k !== 'duration_ms').map(([k,v]) => `${k}: ${v}`).join(' · ') : 'Synced';
      toast.success(msg || 'Sync complete');
    },
    onError: (e: any) => {
      toast.error(e?.message || 'Sync failed. See audit logs for details.');
    },
  });
}

/** Recent sync jobs (for diagnostics panel). */
export function usePbxSyncJobs(limit = 10) {
  return useQuery({
    queryKey: ['pbx', 'sync_jobs', limit],
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('pbx_sync_jobs')
        .select('*').eq('organization_id', LEMTEL_ORG)
        .order('created_at', { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

/** Test CDR endpoint detection. */
export function usePbxTestCdrEndpoint() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: { action: 'test-cdr-endpoint', organization_id: LEMTEL_ORG },
      });
      if (error) throw error;
      return data as { ok: boolean; endpoint: string | null; record_count: number; attempts: any[] };
    },
  });
}

/** Live SIP registrations from FusionPBX (polled). */
export function usePbxRegistrations(intervalMs = 30000) {
  return useQuery({
    queryKey: ['pbx', 'registrations'],
    refetchInterval: intervalMs,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: { action: 'list-registrations', organization_id: LEMTEL_ORG },
      });
      if (error) return [];
      return ((data as any)?.data ?? []) as any[];
    },
  });
}

/** Ping FusionPBX directly (Test Connection button). */
export function usePbxPing() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: { action: 'ping', organization_id: LEMTEL_ORG },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).message || (data as any).error);
      return data as { status: string; latency_ms: number; extensions_count: number };
    },
    onSuccess: (d) => toast.success(`PBX OK — ${d.extensions_count} ext, ${d.latency_ms}ms`),
    onError: (e: any) => toast.error(e?.message || 'PBX ping failed'),
  });
}


