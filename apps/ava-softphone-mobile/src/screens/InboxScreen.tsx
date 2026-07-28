import React, { useState } from 'react';
import type { ImpactStyle } from '@capacitor/haptics';
import { Voicemail, MessageSquareText, Users } from 'lucide-react';
import { colors, radius, font } from '../lib/theme';
import VoicemailScreen from './VoicemailScreen';
import MessagesScreen from './MessagesScreen';
import TeamChatScreen from './TeamChatScreen';
import { useStoredCreds } from '../lib/creds';
import { useT } from '../lib/i18n';

type SubTab = 'voicemail' | 'sms' | 'team';

export default function InboxScreen({
  haptic,
  initial = 'voicemail',
}: {
  haptic: (s?: ImpactStyle) => Promise<void>;
  initial?: SubTab;
}) {
  const [tab, setTab] = useState<SubTab>(initial);
  const { creds } = useStoredCreds();
  const { t, lang } = useT();

  const TABS: { id: SubTab; label: string; Icon: typeof Voicemail; accent: string }[] = [
    { id: 'team',       label: t('messages.team'),     Icon: Users,             accent: '#21D4FD' },
    { id: 'voicemail',  label: t('calls.voicemail'),   Icon: Voicemail,         accent: '#FFD86B' },
    { id: 'sms',        label: t('messages.sms'),      Icon: MessageSquareText, accent: '#B79CFF' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header style={{ padding: '16px 16px 12px' }}>
        <div style={{ fontSize: 11, color: colors.mutedSilver, textTransform: 'uppercase', letterSpacing: 1.6, fontWeight: 700 }}>
          {lang === 'fr' ? 'Boîte de réception' : 'Inbox'}
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: colors.textIce, marginTop: 2, letterSpacing: -0.3 }}>
          {t('tabs.messages')}
        </div>
      </header>


      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6,
        padding: '0 14px 12px',
      }}>
        {TABS.map(({ id, label, Icon, accent }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => { haptic(); setTab(id); }}
              style={{
                position: 'relative',
                padding: '12px 8px',
                borderRadius: radius.lg,
                background: active
                  ? `linear-gradient(160deg, ${accent}22 0%, rgba(255,255,255,0.04) 100%)`
                  : 'linear-gradient(160deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.015) 100%)',
                border: `1px solid ${active ? accent + '80' : 'rgba(255,255,255,0.08)'}`,
                color: active ? accent : colors.mutedSilver,
                fontSize: font.xs, fontWeight: 700, letterSpacing: 0.4,
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                boxShadow: active
                  ? `0 8px 24px -8px ${accent}66, inset 0 1px 0 rgba(255,255,255,0.08)`
                  : 'inset 0 1px 0 rgba(255,255,255,0.04)',
                backdropFilter: 'blur(14px)',
                transition: 'all 220ms cubic-bezier(.2,.8,.2,1)',
                transform: active ? 'translateY(-1px)' : 'translateY(0)',
              }}
            >
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, borderRadius: 10,
                background: active
                  ? `radial-gradient(circle at 30% 30%, ${accent}55, ${accent}11 70%)`
                  : 'rgba(255,255,255,0.05)',
                border: `1px solid ${active ? accent + '55' : 'rgba(255,255,255,0.06)'}`,
              }}>
                <Icon size={16} strokeWidth={2.2} />
              </span>
              {label}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tab === 'team'       && <TeamChatScreen accessToken={creds?.accessToken || null} userId={creds?.userId} />}
        {tab === 'voicemail'  && <VoicemailScreen haptic={haptic} />}
        {tab === 'sms'        && <MessagesScreen haptic={haptic} />}
      </div>
    </div>
  );
}
