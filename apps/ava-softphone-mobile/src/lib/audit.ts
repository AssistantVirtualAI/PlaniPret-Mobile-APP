// Phase 5 — fire-and-forget audit logger for the mobile softphone.
// Never throws; never blocks UX. Disabled in mock/demo mode.
import { isMockMode } from './buildGuard';

export type AuditAction =
  | 'recording.played'
  | 'recording.downloaded'
  | 'voicemail.played'
  | 'voicemail.downloaded'
  | 'voicemail.deleted'
  | 'sms.sent'
  | 'call.originated'
  | 'call.transferred'
  | 'softphone.signed_in'
  | 'softphone.signed_out';

const PORTAL = 'https://gejxisrqtvxavbrfcoxz.supabase.co';
const ANON =
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdlanhpc3JxdHZ4YXZicmZjb3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1MDMxNzQsImV4cCI6MjA3NzA3OTE3NH0.kaO-GslE99OCNrZ4_AMnbzGqya2azqz_UMZR34zZvvo';

let getToken: () => Promise<string | null> = async () => null;
export function configureAudit(tokenGetter: () => Promise<string | null>) { getToken = tokenGetter; }

export function audit(action: AuditAction, resourceId?: string | null, metadata?: Record<string, unknown>): void {
  if (isMockMode()) return;
  (async () => {
    try {
      const token = await getToken();
      if (!token) return;
      await fetch(`${PORTAL}/functions/v1/audit-log`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: ANON,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, resource_id: resourceId ?? null, metadata: metadata ?? {} }),
        keepalive: true,
      });
    } catch {
      /* swallow */
    }
  })();
}
