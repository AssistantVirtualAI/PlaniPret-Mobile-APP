import React from 'react';
import { MicOff, Users, Bell } from 'lucide-react';
import { colors, gradients, radius, font } from '../lib/theme';
import { useT } from '../lib/i18n';
import type { PermKey } from '../lib/permissionState';

interface Props {
  perm: PermKey;
  onAllow: () => void;
  onLater: () => void;
  busy?: boolean;
  skipLabel?: string;
}

const COPY: Record<PermKey, { icon: React.ReactNode; title: { fr: string; en: string }; body: { fr: string; en: string } }> = {
  microphone: {
    icon: <MicOff size={42} color={colors.signalGold} strokeWidth={1.8} />,
    title: { fr: 'Activer le microphone', en: 'Enable your microphone' },
    body: {
      fr: 'Lemtel a besoin du microphone pour passer et recevoir des appels VoIP. Vous pouvez continuer sans, mais les appels ne fonctionneront pas.',
      en: 'Lemtel needs the microphone to make and receive VoIP calls. You can continue without it, but calls will not work.',
    },
  },
  contacts: {
    icon: <Users size={42} color="#3B82F6" strokeWidth={1.8} />,
    title: { fr: 'Importer vos contacts', en: 'Import your contacts' },
    body: {
      fr: 'Facilite la composition et affiche le nom des appelants. Vous pouvez sauter cette étape.',
      en: 'Speeds up dialing and shows caller names. You can skip this step.',
    },
  },
  notifications: {
    icon: <Bell size={42} color="#10B981" strokeWidth={1.8} />,
    title: { fr: 'Activer les notifications', en: 'Enable notifications' },
    body: {
      fr: 'Recevez les appels entrants, appels manqués et messages vocaux. Optionnel.',
      en: 'Get incoming calls, missed calls and voicemail alerts. Optional.',
    },
  },
};

export default function PermissionSoftPrompt({ perm, onAllow, onLater, busy, skipLabel }: Props) {
  const { lang } = useT();
  const fr = lang === 'fr';
  const c = COPY[perm];
  return (
    <div style={shell}>
      <div style={iconWrap}>{c.icon}</div>
      <h1 style={titleStyle}>{fr ? c.title.fr : c.title.en}</h1>
      <p style={bodyStyle}>{fr ? c.body.fr : c.body.en}</p>
      <button onClick={onAllow} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
        {busy ? (fr ? 'Demande…' : 'Requesting…') : fr ? 'Continuer' : 'Continue'}
      </button>
      <button onClick={onLater} style={ghostBtn}>{skipLabel ?? (fr ? 'Plus tard' : 'Not now')}</button>
    </div>
  );
}

const shell: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: 360 };
const iconWrap: React.CSSProperties = {
  width: 96, height: 96, borderRadius: '50%',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
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
