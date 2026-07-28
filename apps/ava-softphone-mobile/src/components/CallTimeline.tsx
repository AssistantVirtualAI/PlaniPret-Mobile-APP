import React from 'react';

export type CallPhase = 'dialing' | 'ringing' | 'early-media' | 'active' | 'ended';

const STEPS: { id: CallPhase; label: string; sub: string }[] = [
  { id: 'dialing',     label: 'Composition', sub: 'Envoi de l’INVITE' },
  { id: 'ringing',     label: 'Sonnerie',    sub: 'En attente du destinataire' },
  { id: 'early-media', label: 'Tonalité',    sub: 'Média précoce du PBX' },
  { id: 'active',      label: 'Connecté',    sub: 'Audio bidirectionnel actif' },
];

const STEP_INDEX: Record<CallPhase, number> = {
  dialing: 0, ringing: 1, 'early-media': 2, active: 3, ended: 4,
};

export default function CallTimeline({
  phase,
  endReason,
  endCode,
}: {
  phase: CallPhase;
  endReason?: string | null;
  endCode?: string | null;
}) {
  const idx = STEP_INDEX[phase] ?? 0;
  const failed = phase === 'ended' && !!endReason;

  return (
    <div style={{
      margin: '0 16px 10px',
      padding: '10px 12px',
      borderRadius: 14,
      background: 'rgba(255,255,255,0.04)',
      border: `1px solid ${failed ? 'rgba(239,68,68,0.5)' : 'rgba(96,165,250,0.28)'}`,
      boxShadow: failed ? '0 0 30px -10px rgba(239,68,68,0.6)' : '0 8px 24px -16px rgba(0,0,0,0.6)',
      backdropFilter: 'blur(12px)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {STEPS.map((s, i) => {
          const done = i < idx;
          const active = i === idx && phase !== 'ended';
          const dim = i > idx;
          const dotColor = failed && i >= idx ? '#ef4444'
            : done ? '#22c55e'
            : active ? '#60a5fa'
            : 'rgba(148,163,184,0.45)';
          return (
            <React.Fragment key={s.id}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0, flex: 1 }}>
                <span style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: dotColor,
                  boxShadow: active ? `0 0 14px ${dotColor}` : 'none',
                  animation: active ? 'pulse-ring 1.4s ease-out infinite' : undefined,
                }} />
                <span style={{
                  marginTop: 4, fontSize: 9, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase',
                  color: dim ? 'rgba(148,163,184,0.5)' : '#e2e8f0',
                  whiteSpace: 'nowrap',
                }}>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div style={{
                  flex: 0.6, height: 2, borderRadius: 2,
                  background: i < idx ? '#22c55e' : 'rgba(148,163,184,0.18)',
                  transition: 'background .3s ease',
                }} />
              )}
            </React.Fragment>
          );
        })}
      </div>
      <div style={{
        marginTop: 8, fontSize: 11, color: failed ? '#fca5a5' : '#cbd5e1',
        fontFamily: 'JetBrains Mono, monospace', textAlign: 'center',
      }}>
        {failed ? (endReason || 'Appel terminé') : (STEPS[idx]?.sub ?? '')}
        {endCode ? ` · ${endCode}` : ''}
      </div>
    </div>
  );
}
