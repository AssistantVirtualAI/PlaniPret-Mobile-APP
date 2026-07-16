import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { LEMTEL_ORG } from '@/hooks/usePbxData';

/**
 * Auto-pull live data from FusionPBX every time a Lemtel page mounts.
 *
 * The Supabase tables (pbx_call_records, pbx_call_recordings, pbx_voicemails,
 * pbx_sms_threads) are populated by the `fusionpbx-proxy` edge function. If a
 * page only reads from those tables without also poking the proxy, the user
 * ends up staring at stale (or empty) rows.
 *
 * This hook fires the relevant sync actions in the background on mount, then
 * again every `intervalMs` while the tab is open. React Query invalidations
 * refresh the on-page grids as soon as new rows land.
 */

type SyncKey = 'cdrs' | 'voicemails' | 'sms' | 'recordings';

const IN_FLIGHT: Record<string, Promise<unknown> | undefined> = {};
const LAST_RUN: Record<string, number> = {};

// Recordings are pulled implicitly by sync-cdrs (has_recording flag), so we
// reuse that action. SMS threads are populated by the telnyx-sms edge function
// via inbound webhooks, so there's no proxy action — invalidating the query is
// enough to force a re-read of any newly inserted rows.
const ACTION_MAP: Record<SyncKey, { action: string | null; invalidate: (string | undefined)[][] }> = {
  cdrs:        { action: 'sync-cdrs',                invalidate: [['pbx', 'pbx_call_records']] },
  recordings:  { action: 'sync-cdrs',                invalidate: [['pbx', 'pbx_call_records'], ['pbx', 'pbx_call_recordings']] },
  voicemails:  { action: 'sync-voicemail-messages',  invalidate: [['pbx', 'pbx_voicemails'], ['my', 'voicemails']] },
  sms:         { action: null,                       invalidate: [['pbx', 'pbx_sms_threads'], ['pbx', 'pbx_sms_messages']] },
};

async function runSync(key: SyncKey, orgId: string) {
  const { action } = ACTION_MAP[key];
  if (!action) return null;
  const cacheKey = `${orgId}:${key}`;
  const now = Date.now();
  // Debounce: don't re-hit the proxy for the same (org, action) within 20s.
  if (LAST_RUN[cacheKey] && now - LAST_RUN[cacheKey] < 20_000) return null;
  if (IN_FLIGHT[cacheKey]) return IN_FLIGHT[cacheKey];
  const p = supabase.functions.invoke('fusionpbx-proxy', {
    body: { action, organization_id: orgId },
  }).then((res) => {
    LAST_RUN[cacheKey] = Date.now();
    return res;
  }).catch((err) => {
    // Silent — the page still shows whatever is in the DB.
    console.warn(`[pbx-auto-sync] ${action} failed`, err);
    return null;
  }).finally(() => { IN_FLIGHT[cacheKey] = undefined; });
  IN_FLIGHT[cacheKey] = p;
  return p;
}

export function usePbxAutoSync(
  keys: SyncKey[],
  opts?: { enabled?: boolean; intervalMs?: number; orgId?: string },
) {
  const qc = useQueryClient();
  const enabled = opts?.enabled ?? true;
  const intervalMs = opts?.intervalMs ?? 60_000;
  const orgId = opts?.orgId ?? LEMTEL_ORG;
  const keysRef = useRef(keys);
  keysRef.current = keys;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const runAll = async () => {
      for (const key of keysRef.current) {
        if (cancelled) return;
        await runSync(key, orgId);
        if (cancelled) return;
        for (const qk of ACTION_MAP[key].invalidate) {
          qc.invalidateQueries({ queryKey: qk });
        }
      }
    };

    // Kick off immediately, then poll.
    runAll();
    const timer = setInterval(runAll, intervalMs);
    const onFocus = () => runAll();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [enabled, intervalMs, orgId, qc]);
}
