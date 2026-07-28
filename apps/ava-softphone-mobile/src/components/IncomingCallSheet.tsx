import React from 'react';
import { colors } from '../lib/theme';
import { formatSipParty } from '../lib/sip/formatSipParty';
import { useCallActionBridge } from '../lib/sip/useCallActionBridge';

interface Props {
  open: boolean;
  callerName?: string;
  callerNumber?: string;
  onAccept: () => void;
  onDecline: () => void;
  onReplySms?: (text: string) => void;
}

/**
 * Full-screen incoming call sheet (Phase 6).
 * Native-feeling slide-up with accept / decline / SMS-reply quick actions.
 */
export default function IncomingCallSheet({ open, callerName, callerNumber, onAccept, onDecline, onReplySms }: Props) {
  const [replying, setReplying] = React.useState(false);
  const quickReplies = ["Can't talk now", "Call you back", "On my way"];
  const lang: 'fr' | 'en' = (typeof localStorage !== 'undefined' && localStorage.getItem('ava.mobile.lang') === 'en') ? 'en' : 'fr';
  // Prefer the number for parsing; a generic fallback name (e.g. "Appel entrant"
  // / "Incoming call" / "Unknown") should never mask the actual caller ID.
  const GENERIC = /^(appel entrant|incoming call|unknown|inconnu|numero inconnu|numéro inconnu)$/i;
  const nameIsGeneric = !callerName || GENERIC.test(callerName.trim());
  const party = formatSipParty(callerNumber || callerName || '', lang);
  const displayName = !nameIsGeneric && callerName && !/^sip:|<sip:/i.test(callerName)
    ? callerName
    : (callerNumber || party.name);
  const initials = (displayName || '?')
    .split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('') || '📞';

  // Forward notification-button taps (Android) and CallKit actions (iOS) to
  // the same accept/decline handlers so the app behaves identically whether
  // the user interacts via UI, notification, or lockscreen.
  useCallActionBridge({
    onAnswer: onAccept,
    onDecline: onDecline,
    onHangup: onDecline,
  }, open);

  return (
    <>
      {open && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'linear-gradient(180deg, #0b1220 0%, #060912 100%)',
            color: colors.textIce,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            paddingTop: 'calc(var(--safe-top) + 80px)',
            paddingBottom: 'calc(var(--safe-bottom) + 40px)',
          }}
        >
          <div style={{ fontSize: 14, opacity: 0.7, display: 'flex', alignItems: 'center', gap: 8 }}>
            {party.isInternal ? (lang === 'en' ? 'Internal call' : 'Appel interne') : (lang === 'en' ? 'Incoming call' : 'Appel entrant')}
          </div>
          <div style={{ fontSize: 28, fontWeight: 600, marginTop: 12, textAlign: 'center', padding: '0 24px' }}>{displayName}</div>
          {party.subtitle ? (
            <div style={{
              marginTop: 6, fontSize: 13, opacity: 0.9,
              padding: '4px 12px',
              borderRadius: 999,
              background: party.isInternal ? 'rgba(35,214,255,0.14)' : 'rgba(255,255,255,0.06)',
              border: party.isInternal ? '1px solid rgba(35,214,255,0.45)' : '1px solid rgba(255,255,255,0.10)',
              letterSpacing: 0.5,
            }}>{party.subtitle}</div>
          ) : (
            <div style={{ fontSize: 16, opacity: 0.8, marginTop: 4 }}>{party.user || callerNumber}</div>
          )}

          <div style={{
            width: 140, height: 140, borderRadius: '50%', marginTop: 40,
            background: party.isInternal
              ? 'linear-gradient(135deg, rgba(35,214,255,0.30), rgba(0,35,230,0.35))'
              : 'rgba(0,35,230,0.25)',
            border: party.isInternal ? '1px solid rgba(35,214,255,0.55)' : '1px solid rgba(255,255,255,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: initials.length > 1 ? 42 : 48, fontWeight: 600, letterSpacing: 1,
          }}>{initials}</div>

          {replying ? (
            <div style={{ marginTop: 'auto', width: '100%', padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {quickReplies.map((q) => (
                <button key={q} onClick={() => { onReplySms?.(q); onDecline(); }}
                  style={replyBtn}>{q}</button>
              ))}
              <button onClick={() => setReplying(false)} style={{ ...replyBtn, opacity: 0.6 }}>Cancel</button>
            </div>
          ) : (
            <div style={{
              marginTop: 'auto', width: '100%', padding: 24,
              display: 'flex', justifyContent: 'space-around', alignItems: 'center',
            }}>
              <ActionButton color="#ef4444" label="Decline" onClick={onDecline}>✕</ActionButton>
              <ActionButton color="#64748b" label="SMS" onClick={() => setReplying(true)}>💬</ActionButton>
              <ActionButton color="#22c55e" label="Accept" onClick={onAccept}>✓</ActionButton>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function ActionButton({ color, label, onClick, children }: any) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer',
    }}>
      <span style={{
        width: 64, height: 64, borderRadius: '50%', background: color,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 600,
      }}>{children}</span>
      <span style={{ fontSize: 12, opacity: 0.85 }}>{label}</span>
    </button>
  );
}

const replyBtn: React.CSSProperties = {
  width: '100%', padding: '14px 16px', borderRadius: 12,
  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
  color: '#fff', fontSize: 15, textAlign: 'left', cursor: 'pointer',
};
