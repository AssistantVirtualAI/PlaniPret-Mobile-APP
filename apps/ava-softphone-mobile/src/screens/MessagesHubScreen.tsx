import React, { useState } from 'react';
import type { ImpactStyle } from '@capacitor/haptics';
import { colors, font, gradients, radius } from '../lib/theme';
import TeamChatScreen from './TeamChatScreen';
import MessagesScreen from './MessagesScreen';
import ContactsScreen from './ContactsScreen';
import { useTr } from '../lib/i18n';

type Sub = 'team' | 'sms' | 'contacts';

export default function MessagesHubScreen({
  accessToken, userId, sp, haptic, channelUnread,
}: {
  accessToken: string | null;
  userId: string | undefined;
  sp: any;
  haptic: (s?: ImpactStyle) => Promise<void>;
  channelUnread?: Record<string, number>;
}) {
  const [sub, setSub] = useState<Sub>('team');
  const { tr } = useTr();

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 14px 0' }}>
        <Segmented value={sub} onChange={(v) => { haptic(); setSub(v); }} tr={tr} />
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {sub === 'team' && <TeamChatScreen accessToken={accessToken} userId={userId} channelUnread={channelUnread} />}
        {sub === 'sms' && <MessagesScreen haptic={haptic} />}
        {sub === 'contacts' && <ContactsScreen sp={sp} />}
      </div>
    </div>
  );
}

function Segmented({ value, onChange, tr }: { value: Sub; onChange: (v: Sub) => void; tr: any }) {
  const items: { id: Sub; label: string }[] = [
    { id: 'team', label: tr.messages.team },
    { id: 'sms', label: tr.messages.sms },
    { id: 'contacts', label: tr.messages.contacts },
  ];
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 4,
      padding: 4, borderRadius: radius.lg,
      background: 'rgba(255,255,255,0.04)',
      border: `1px solid ${colors.border}`,
    }}>
      {items.map((it) => {
        const active = it.id === value;
        return (
          <button key={it.id} onClick={() => onChange(it.id)} style={{
            padding: '10px 8px', borderRadius: radius.md, border: 'none',
            background: active ? gradients.call : 'transparent',
            color: active ? '#fff' : colors.mutedSilver,
            fontSize: font.sm, fontWeight: 700, cursor: 'pointer',
            transition: 'all .18s ease',
          }}>{it.label}</button>
        );
      })}
    </div>
  );
}
