import React from 'react';
import { MicOff, Users, Bell, Settings } from 'lucide-react';
import { colors, gradients, radius, font } from '../lib/theme';
import { useT } from '../lib/i18n';
import { openAppSettings, type PermKey } from '../lib/permissionState';

interface Props {
  perm: PermKey;
  onContinueWithout: () => void;
}

const COPY: Record<PermKey, { icon: React.ReactNode; title: { fr: string; en: string }; body: { fr: string; en: string }; cont: { fr: string; en: string } }> = {
  microphone: {
    icon: <MicOff size={48} color="#94A3B8" strokeWidth={1.6} />,
    title: { fr: 'Microphone bloqué', en: 'Microphone blocked' },
    body: {
      fr: "L'accès au microphone est désactivé. Ouvrez les Réglages pour l'activer, puis revenez à l'application.",
      en: 'Microphone access is turned off. Open Settings to enable it, then come back to the app.',
    },
    cont: { fr: 'Continuer sans appels', en: 'Continue without calls' },
  },
  contacts: {
    icon: <Users size={48} color="#94A3B8" strokeWidth={1.6} />,
    title: { fr: 'Contacts bloqués', en: 'Contacts blocked' },
    body: {
      fr: "L'accès aux contacts est désactivé. Ouvrez les Réglages pour l'activer, ou passez cette étape.",
      en: 'Contacts access is turned off. Open Settings to enable it, or skip this step.',
    },
    cont: { fr: 'Passer cette étape', en: 'Skip this step' },
  },
  notifications: {
    icon: <Bell size={48} color="#94A3B8" strokeWidth={1.6} />,
    title: { fr: 'Notifications bloquées', en: 'Notifications blocked' },
    body: {
      fr: "Vous ne recevrez pas d'alertes d'appels entrants. Ouvrez les Réglages, ou passez cette étape.",
      en: 'You won\'t receive incoming call alerts. Open Settings, or skip this step.',
    },
    cont: { fr: 'Passer cette étape', en: 'Skip this step' },
  },
};

export default function PermissionBlockedScreen({ perm, onContinueWithout }: Props) {
  const { lang } = useT();
  const fr = lang === 'fr';
  const c = COPY[perm];
  return (
    <div style={shell}>
      <div style={iconWrap}>{c.icon}</div>
      <h1 style={titleStyle}>{fr ? c.title.fr : c.title.en}</h1>
      <p style={bodyStyle}>{fr ? c.body.fr : c.body.en}</p>

      <button onClick={() => { void openAppSettings(); }} style={primaryBtn}>
        <Settings size={18} style={{ marginRight: 8, verticalAlign: '-3px' }} />
        {fr ? 'Ouvrir les Réglages' : 'Open Settings'}
      </button>
      <button onClick={onContinueWithout} style={ghostBtn}>
        {fr ? c.cont.fr : c.cont.en}
      </button>
    </div>
  );
}

const shell: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: 360 };
const iconWrap: React.CSSProperties = {
  width: 104, height: 104, borderRadius: '50%',
  background: 'rgba(148,163,184,0.08)', border: '1px solid rgba(148,163,184,0.20)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22,
};
const titleStyle: React.CSSProperties = { fontSize: 24, fontWeight: 800, margin: '0 0 10px', textAlign: 'center', color: colors.textIce };
const bodyStyle: React.CSSProperties = { fontSize: font.sm, color: colors.mutedSilver, textAlign: 'center', margin: '0 0 26px', lineHeight: 1.55 };
const primaryBtn: React.CSSProperties = {
  width: '100%', height: 54, background: gradients.call, color: '#fff',
  border: `1px solid ${colors.signalGold}55`, borderRadius: radius.lg,
  fontSize: font.md, fontWeight: 800, cursor: 'pointer',
  boxShadow: '0 8px 32px rgba(0,61,166,0.45)',
};
const ghostBtn: React.CSSProperties = {
  width: '100%', height: 46, marginTop: 12,
  background: 'transparent', color: colors.mutedSilver,
  border: '1px solid rgba(255,255,255,0.12)', borderRadius: radius.md,
  fontSize: font.sm, fontWeight: 600, cursor: 'pointer',
};
