import React, { useEffect, useState } from 'react';
import { colors } from '../lib/theme';

type Status = 'offline' | 'available' | 'paused' | 'on_call';

interface Props {
  portalUrl: string;
  accessToken: string;
  extension: string;
  organizationId: string;
}

/**
 * Call Center agent screen (Phase 4 / mobile).
 * Large status toggle, pause-reason sheet, queue list.
 */
export default function CallCenterAgentScreen({ portalUrl, accessToken, extension, organizationId }: Props) {
  const [status, setStatus] = useState<Status>('offline');
  const [reason, setReason] = useState<string | null>(null);
  const [queues, setQueues] = useState<string[]>([]);
  const [reasons, setReasons] = useState<any[]>([]);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
    apikey: accessToken,
  };

  const refresh = async () => {
    const r = await fetch(`${portalUrl}/rest/v1/pbx_softphone_users?select=cc_status,cc_pause_reason,cc_queues&extension=eq.${extension}&organization_id=eq.${organizationId}`, { headers });
    const [row] = await r.json();
    if (row) {
      setStatus(row.cc_status || 'offline');
      setReason(row.cc_pause_reason);
      setQueues(row.cc_queues || []);
    }
    const rr = await fetch(`${portalUrl}/rest/v1/cc_pause_reasons?select=*&organization_id=eq.${organizationId}`, { headers });
    setReasons(await rr.json());
  };

  useEffect(() => { refresh(); }, [extension]);

  const call = async (action: string, extra: any = {}) => {
    setBusy(true);
    try {
      await fetch(`${portalUrl}/functions/v1/call-center-sync`, {
        method: 'POST', headers,
        body: JSON.stringify({ action, extension, organization_id: organizationId, queue: queues[0], ...extra }),
      });
      await refresh();
    } finally { setBusy(false); setSheet(false); }
  };

  const statusColor = { available: '#22c55e', paused: '#f59e0b', on_call: '#ef4444', offline: '#64748b' }[status];
  const label = { available: 'Disponible', paused: `En pause${reason ? ` · ${reason}` : ''}`, on_call: 'En appel', offline: 'Hors ligne' }[status];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 20, color: colors.textIce, gap: 20 }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Call Center</h1>

      <div style={{
        padding: 24, borderRadius: 16,
        background: `linear-gradient(135deg, ${statusColor}33, ${statusColor}11)`,
        border: `2px solid ${statusColor}`,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 12, opacity: 0.7, textTransform: 'uppercase' }}>Status</div>
        <div style={{ fontSize: 22, fontWeight: 600, marginTop: 6 }}>{label}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {status === 'offline' && <BigBtn color="#22c55e" disabled={busy} onClick={() => call('agent-login')}>Log in</BigBtn>}
        {status === 'paused' && <BigBtn color="#22c55e" disabled={busy} onClick={() => call('agent-unpause')}>Resume</BigBtn>}
        {status === 'available' && <BigBtn color="#f59e0b" disabled={busy} onClick={() => setSheet(true)}>Pause</BigBtn>}
        {status !== 'offline' && <BigBtn color="#64748b" disabled={busy} onClick={() => call('agent-logout')}>Log out</BigBtn>}
      </div>

      <div>
        <div style={{ fontSize: 12, opacity: 0.7, textTransform: 'uppercase', marginBottom: 8 }}>My queues</div>
        {queues.length === 0 && <div style={{ fontSize: 13, opacity: 0.6 }}>No queues assigned</div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {queues.map((q) => (
            <span key={q} style={{ padding: '6px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.08)', fontSize: 13 }}>{q}</span>
          ))}
        </div>
      </div>

      {sheet && (
        <div onClick={() => setSheet(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100,
          display: 'flex', alignItems: 'flex-end',
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: '100%', background: '#0b1220', padding: 20,
            borderTopLeftRadius: 20, borderTopRightRadius: 20,
            paddingBottom: 'calc(20px + var(--safe-bottom))',
          }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Raison de la pause</div>
            {reasons.map((r) => (
              <button key={r.id} onClick={() => call('agent-pause', { reason: r.reason })} style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: 14, background: 'rgba(255,255,255,0.06)', border: 'none',
                borderRadius: 12, color: '#fff', textAlign: 'left', marginBottom: 8, cursor: 'pointer',
              }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: r.color }} />
                {r.reason}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BigBtn({ color, children, disabled, onClick }: any) {
  return (
    <button disabled={disabled} onClick={onClick} style={{
      padding: 16, borderRadius: 14, background: color, color: '#fff',
      fontSize: 17, fontWeight: 600, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.6 : 1,
    }}>{children}</button>
  );
}
