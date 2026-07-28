// Sequential permission diagnostic panel.
// Runs mic → speaker → contacts → notifications in order, showing per-step
// status, timing, and error message so blocking point is immediately visible.

import React, { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  requestMicrophone, unlockAudioOutput, requestContacts, requestNotifications,
  type PermissionStatus,
} from '../lib/permissions';

type StepId = 'microphone' | 'speaker' | 'contacts' | 'notifications';
interface StepResult {
  id: StepId;
  label: string;
  status: 'pending' | 'running' | PermissionStatus;
  ms?: number;
  error?: string;
}

const INIT: StepResult[] = [
  { id: 'microphone',    label: '🎤 Microphone',    status: 'pending' },
  { id: 'speaker',       label: '🔊 Speaker / Audio', status: 'pending' },
  { id: 'contacts',      label: '👥 Contacts',      status: 'pending' },
  { id: 'notifications', label: '🔔 Notifications', status: 'pending' },
];

async function runStep(id: StepId): Promise<PermissionStatus> {
  switch (id) {
    case 'microphone':    return requestMicrophone();
    case 'speaker':       return unlockAudioOutput();
    case 'contacts':      return requestContacts();
    case 'notifications': return requestNotifications();
  }
}

export default function PermissionDiagPanel({ onClose }: { onClose?: () => void }) {
  const [steps, setSteps] = useState<StepResult[]>(INIT);
  const [running, setRunning] = useState(false);
  const [blocker, setBlocker] = useState<StepResult | null>(null);

  const run = async () => {
    setRunning(true);
    setBlocker(null);
    const next: StepResult[] = INIT.map((s) => ({ ...s }));
    setSteps([...next]);
    console.log('[diag] starting permission sequence', { platform: Capacitor.getPlatform() });

    for (let i = 0; i < next.length; i++) {
      next[i].status = 'running';
      setSteps([...next]);
      const t0 = performance.now();
      try {
        const status = await runStep(next[i].id);
        next[i].status = status;
        next[i].ms = Math.round(performance.now() - t0);
        console.log('[diag] step done', next[i]);
      } catch (e: any) {
        next[i].status = 'denied';
        next[i].ms = Math.round(performance.now() - t0);
        next[i].error = e?.message ?? String(e);
        console.error('[diag] step threw', next[i]);
      }
      setSteps([...next]);
      if (next[i].status !== 'granted' && !blocker) {
        setBlocker({ ...next[i] });
      }
    }
    setRunning(false);
  };

  const okCount = steps.filter((s) => s.status === 'granted').length;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'rgba(6,10,20,0.94)', color: '#E6F1FF',
      padding: '32px 20px', overflowY: 'auto',
      paddingTop: 'calc(var(--safe-top) + 24px)',
    }}>
      <div style={{ maxWidth: 460, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Permission Diagnostic</h2>
          {onClose && (
            <button onClick={onClose} style={{
              background: 'transparent', color: '#94A3B8',
              border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10,
              padding: '6px 12px', fontSize: 12, cursor: 'pointer',
            }}>Close</button>
          )}
        </div>

        <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 16 }}>
          Platform: <b>{Capacitor.getPlatform()}</b> · Native: <b>{String(Capacitor.isNativePlatform())}</b>
        </div>

        <button
          onClick={run}
          disabled={running}
          style={{
            width: '100%', padding: '14px', borderRadius: 14,
            background: running ? '#334155' : 'linear-gradient(135deg,#003DA6,#FFC72C)',
            color: '#fff', fontWeight: 800, fontSize: 15,
            border: 'none', cursor: running ? 'default' : 'pointer', marginBottom: 20,
          }}
        >
          {running ? 'Running…' : 'Run Test Sequence'}
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {steps.map((s) => (
            <div key={s.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 14px', borderRadius: 12,
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${statusColor(s.status)}55`,
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{s.label}</span>
                {s.error && <span style={{ fontSize: 11, color: '#F87171' }}>{s.error}</span>}
                {s.ms !== undefined && <span style={{ fontSize: 10, color: '#64748B' }}>{s.ms} ms</span>}
              </div>
              <span style={{
                fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 999,
                background: `${statusColor(s.status)}22`, color: statusColor(s.status),
              }}>
                {statusIcon(s.status)} {s.status}
              </span>
            </div>
          ))}
        </div>

        <div style={{
          marginTop: 22, padding: 14, borderRadius: 12,
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Summary</div>
          <div style={{ fontSize: 12, color: '#CBD5E1' }}>
            {okCount}/{steps.length} granted
          </div>
          {blocker && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#FCA5A5' }}>
              Blocked at <b>{blocker.label}</b> — status: <b>{blocker.status}</b>
              {blocker.error && <div style={{ marginTop: 4 }}>{blocker.error}</div>}
            </div>
          )}
          {!blocker && !running && okCount === steps.length && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#34D399' }}>
              ✅ All permissions granted.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function statusColor(s: StepResult['status']): string {
  if (s === 'granted') return '#10B981';
  if (s === 'denied') return '#EF4444';
  if (s === 'running') return '#F59E0B';
  if (s === 'unsupported') return '#64748B';
  return '#94A3B8';
}
function statusIcon(s: StepResult['status']): string {
  if (s === 'granted') return '✅';
  if (s === 'denied') return '⛔';
  if (s === 'running') return '⏳';
  if (s === 'unsupported') return '—';
  if (s === 'prompt') return '❔';
  return '·';
}
