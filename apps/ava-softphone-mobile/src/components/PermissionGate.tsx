import React, { useCallback, useEffect, useState } from 'react';
import { colors, gradients, radius, font } from '../lib/theme';
import { LemtelMark } from './Brand';
import { useT } from '../lib/i18n';
import { usePermissions } from '../hooks/usePermissions';
import PermissionSoftPrompt from './PermissionSoftPrompt';
import PermissionBlockedScreen from './PermissionBlockedScreen';
import type { PermKey, PermState } from '../lib/permissionState';

interface PermissionGateProps {
  onComplete: () => void;
}

type Step = 'intro' | PermKey | 'done';

const ORDER: PermKey[] = ['microphone', 'contacts', 'notifications'];

/**
 * Just-in-time onboarding gate — Apple 5.1.1 + Google UX compliant.
 *
 *  intro → microphone → contacts → notifications → done → onComplete()
 *
 * Rules:
 *  - One permission per screen, one language per screen (system-detected).
 *  - `prompt` / `unknown` / `denied` → soft in-app prompt with Allow + skip.
 *  - `blocked` → neutral gray screen with Open Settings + skip.
 *  - `granted` / `unavailable` → skip to next automatically.
 *  - Skip is ALWAYS available — the flow never blocks the user.
 *  - No red text, no technical status badges, no diagnostic button in prod.
 */
export default function PermissionGate({ onComplete }: PermissionGateProps) {
  const { lang } = useT();
  const fr = lang === 'fr';
  const {
    micStatus, contactsStatus, notifStatus,
    requestMicrophonePermission, requestContactsPermission, requestNotificationsPermission,
    refresh,
  } = usePermissions();

  const [step, setStep] = useState<Step>('microphone');
  const [busy, setBusy] = useState(false);

  useEffect(() => { void refresh(); }, [refresh]);

  const finish = useCallback(() => { setStep('done'); setTimeout(onComplete, 400); }, [onComplete]);

  const next = useCallback((from: PermKey) => {
    const i = ORDER.indexOf(from);
    if (i < 0 || i >= ORDER.length - 1) return finish();
    setStep(ORDER[i + 1]);
  }, [finish]);

  const statusFor = (key: PermKey): PermState =>
    key === 'microphone' ? micStatus : key === 'contacts' ? contactsStatus : notifStatus;

  // Auto-skip granted / unavailable steps.
  useEffect(() => {
    if (step === 'intro' || step === 'done') return;
    const s = statusFor(step);
    if (s === 'granted' || s === 'unavailable') next(step);
  }, [step, micStatus, contactsStatus, notifStatus, next]);

  const handleAllow = async (key: PermKey) => {
    setBusy(true);
    try {
      if (key === 'microphone') await requestMicrophonePermission();
      else if (key === 'contacts') await requestContactsPermission();
      else await requestNotificationsPermission();
    } finally {
      setBusy(false);
      next(key);
    }
  };

  // ── INTRO ─────────────────────────────────────────────────────────────
  if (step === 'intro') {
    const rows = [
      { icon: '🎤', label: fr ? 'Microphone' : 'Microphone', hint: fr ? 'pour passer des appels' : 'to make calls' },
      { icon: '👥', label: 'Contacts', hint: fr ? 'optionnel' : 'optional' },
      { icon: '🔔', label: 'Notifications', hint: fr ? 'optionnel' : 'optional' },
    ];
    return (
      <Shell>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <LemtelMark size={64} />
          <div style={{ fontSize: font.xl, fontWeight: 800, color: colors.signalGold, marginTop: 12, letterSpacing: 2 }}>LEMTEL</div>
          <div style={{ fontSize: font.xs, color: colors.mutedSilver, letterSpacing: 4 }}>COMMUNICATIONS</div>
        </div>
        <h1 style={titleStyle}>{fr ? 'Bienvenue' : 'Welcome'}</h1>
        <p style={subtitleStyle}>
          {fr
            ? "Nous vous demanderons quelques autorisations une par une — jamais toutes d'un coup."
            : 'We\'ll ask for a few permissions one at a time — never all at once.'}
        </p>
        <div style={{ width: '100%', maxWidth: 360, margin: '4px 0 24px' }}>
          {rows.map((p) => (
            <div key={p.label} style={previewRow}>
              <div style={previewIcon}><span style={{ fontSize: 22 }}>{p.icon}</span></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: font.base, fontWeight: 700, color: colors.textIce }}>{p.label}</div>
                <div style={{ fontSize: font.xs, color: colors.mutedSilver, marginTop: 2 }}>{p.hint}</div>
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => setStep('microphone')} style={primaryBtnStyle}>
          {fr ? 'Commencer' : 'Get started'} →
        </button>
        <p style={{ fontSize: 11, color: '#64748B', marginTop: 14, textAlign: 'center' }}>
          {fr ? 'Modifiable à tout moment dans les Réglages.' : 'Change anytime in Settings.'}
        </p>
      </Shell>
    );
  }

  if (step === 'done') {
    return (
      <Shell>
        <div style={{ fontSize: 64, marginBottom: 12 }}>✅</div>
        <h1 style={titleStyle}>{fr ? 'Prêt !' : 'All set!'}</h1>
      </Shell>
    );
  }

  // ── PER-PERMISSION STEP ──────────────────────────────────────────────
  const key = step;
  const s = statusFor(key);

  const skipLabel =
    key === 'microphone'
      ? (fr ? 'Continuer sans appels' : 'Continue without calls')
      : (fr ? 'Passer cette étape' : 'Skip this step');

  if (s === 'granted' || s === 'unavailable') {
    // Rendered while the effect above advances us.
    return <Shell />;
  }

  if (s === 'blocked') {
    return (
      <Shell>
        <PermissionBlockedScreen perm={key} onContinueWithout={() => next(key)} />
      </Shell>
    );
  }

  return (
    <Shell>
      <PermissionSoftPrompt
        perm={key}
        busy={busy}
        skipLabel={skipLabel}
        onAllow={() => void handleAllow(key)}
        onLater={() => next(key)}
      />
    </Shell>
  );
}

function Shell({ children }: { children?: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: gradients.app,
      paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '32px 22px', color: colors.textIce, zIndex: 9999, overflowY: 'auto',
    }}>
      {children}
    </div>
  );
}

const titleStyle: React.CSSProperties = { fontSize: 26, fontWeight: 800, margin: '0 0 10px', textAlign: 'center', color: colors.textIce };
const subtitleStyle: React.CSSProperties = { fontSize: font.sm, color: colors.mutedSilver, textAlign: 'center', maxWidth: 340, margin: '0 0 20px', lineHeight: 1.55 };
const primaryBtnStyle: React.CSSProperties = {
  width: '100%', maxWidth: 320, height: 54, background: gradients.call, color: '#fff',
  border: `1px solid ${colors.signalGold}55`, borderRadius: radius.lg,
  fontSize: font.md, fontWeight: 800, cursor: 'pointer',
  boxShadow: '0 8px 32px rgba(0,61,166,0.45)',
};
const previewRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: 12, marginBottom: 10,
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: radius.md,
};
const previewIcon: React.CSSProperties = {
  width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
};
