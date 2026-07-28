import React, { useEffect, useState } from 'react';

export type CallStatusKind =
  | 'idle'
  | 'calling'      // outgoing, before remote answer
  | 'ringing'      // outgoing 180/183 OR incoming offered
  | 'connected'   // RTP active
  | 'on-hold'
  | 'disconnected';

export interface CallStatusBadgeProps {
  /** Raw callState from useSoftphoneNative. */
  callState: string | undefined;
  /** True when this is an incoming offer (callState === 'ringing-in'). */
  incoming?: boolean;
  /** True when the ringback or ringtone is currently playing. */
  ringing?: boolean;
  /** True when haptics/vibration pulse is active. */
  vibrating?: boolean;
}

const PALETTE: Record<CallStatusKind, { bg: string; fg: string; dot: string; label: string }> = {
  idle:         { bg: 'rgba(100,116,139,0.18)', fg: '#cbd5e1', dot: '#64748b', label: 'Idle' },
  calling:      { bg: 'rgba(59,130,246,0.20)',  fg: '#bfdbfe', dot: '#3b82f6', label: 'Calling…' },
  ringing:      { bg: 'rgba(245,158,11,0.18)',  fg: '#fde68a', dot: '#f59e0b', label: 'Ringing' },
  connected:    { bg: 'rgba(34,197,94,0.18)',   fg: '#bbf7d0', dot: '#22c55e', label: 'Connected' },
  'on-hold':    { bg: 'rgba(148,163,184,0.22)', fg: '#e2e8f0', dot: '#94a3b8', label: 'On hold' },
  disconnected: { bg: 'rgba(239,68,68,0.18)',   fg: '#fecaca', dot: '#ef4444', label: 'Disconnected' },
};

function classify(callState: string | undefined, incoming?: boolean): CallStatusKind {
  switch (callState) {
    case 'active':     return 'connected';
    case 'held':       return 'on-hold';
    case 'ringing-in': return 'ringing';
    case 'ringing':    return incoming ? 'ringing' : 'calling';
    case 'ringing-out':return 'calling';
    case 'ended':      return 'disconnected';
    case 'idle':       return 'idle';
    default:           return 'idle';
  }
}

export default function CallStatusBadge({ callState, incoming, ringing, vibrating }: CallStatusBadgeProps) {
  const kind = classify(callState, incoming);
  const p = PALETTE[kind];
  // Pulse the dot while ringing/calling so users see the alert is live in sync
  // with the audio/vibration loop.
  const animated = kind === 'ringing' || kind === 'calling';
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (!animated) { setPulse(false); return; }
    const id = setInterval(() => setPulse((v) => !v), 600);
    return () => clearInterval(id);
  }, [animated]);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '6px 12px', borderRadius: 999,
        background: p.bg, color: p.fg,
        fontSize: 12, fontWeight: 600, letterSpacing: 0.4,
        textTransform: 'uppercase',
      }}
    >
      <span
        style={{
          width: 8, height: 8, borderRadius: '50%', background: p.dot,
          boxShadow: animated && pulse ? `0 0 0 4px ${p.dot}33` : 'none',
          transition: 'box-shadow 200ms ease',
        }}
      />
      <span>{p.label}</span>
      {ringing && <span aria-hidden style={{ fontSize: 11, opacity: 0.85 }}>♪</span>}
      {vibrating && <span aria-hidden style={{ fontSize: 11, opacity: 0.85 }}>📳</span>}
    </div>
  );
}
