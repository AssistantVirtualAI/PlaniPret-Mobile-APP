import React from 'react';
import {
  User, MessageCircle, Phone, Grid3x3, LayoutGrid,
  type LucideIcon,
} from 'lucide-react';
import { colors, radius } from '../lib/theme';
import { useT } from '../lib/i18n';

export type Tab =
  | 'contacts' | 'chats' | 'calls' | 'keypad' | 'speeddial'
  // legacy routes still reachable via deep-link / query param:
  | 'home' | 'ava' | 'messages' | 'settings' | 'more' | 'voicemail' | 'sms' | 'queues'
  | 'audiodiag' | 'permissions';

type LabelKey =
  | 'tabs.contacts' | 'tabs.chats' | 'tabs.calls' | 'tabs.keypad' | 'tabs.speeddial';

type Item = { id: Tab; labelKey: LabelKey; Icon: LucideIcon };

const TABS: Item[] = [
  { id: 'contacts',  labelKey: 'tabs.contacts',  Icon: User },
  { id: 'chats',     labelKey: 'tabs.chats',     Icon: MessageCircle },
  { id: 'calls',     labelKey: 'tabs.calls',     Icon: Phone },
  { id: 'keypad',    labelKey: 'tabs.keypad',    Icon: Grid3x3 },
  { id: 'speeddial', labelKey: 'tabs.speeddial', Icon: LayoutGrid },
];

export default function BottomTabs({
  active, onChange, badges,
}: { active: Tab; onChange: (t: Tab) => void; badges?: Partial<Record<Tab, number>> }) {
  const { t } = useT();
  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        width: 'min(100% - 16px, 480px)',
        marginLeft: 'auto',
        marginRight: 'auto',
        marginBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2px)',
        display: 'flex', flexDirection: 'column',
        padding: '10px 8px 8px',
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(244,247,255,0.86) 100%)',
        backdropFilter: 'blur(28px) saturate(180%)',
        WebkitBackdropFilter: 'blur(28px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.9)',
        borderRadius: radius.xxl,
        boxShadow:
          '0 24px 60px -28px rgba(7,22,168,0.35), 0 1px 0 rgba(255,255,255,0.9) inset, 0 -1px 0 rgba(0,35,230,0.05) inset',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          alignItems: 'center',
        }}
      >
        {TABS.map((it) => (
          <TabBtn
            key={it.id}
            label={t(it.labelKey as any)}
            Icon={it.Icon}
            active={active === it.id}
            onPress={() => onChange(it.id)}
            badge={badges?.[it.id]}
          />
        ))}
      </div>
    </nav>
  );
}

function TabBtn({ label, Icon, active, onPress, badge }: { label: string; Icon: LucideIcon; active: boolean; onPress: () => void; badge?: number }) {
  const accent = colors.lemtelBlue;
  return (
    <button
      onClick={onPress}
      style={{
        position: 'relative', minHeight: 50, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 3, padding: '6px 2px',
        borderRadius: radius.lg,
        background: active
          ? `linear-gradient(180deg, ${accent}22 0%, rgba(255,255,255,0.4) 100%)`
          : 'transparent',
        border: active ? `1px solid ${accent}33` : '1px solid transparent',
        boxShadow: active
          ? `0 8px 20px -10px ${accent}66, 0 1px 0 rgba(255,255,255,0.9) inset`
          : 'none',
        color: active ? accent : colors.mutedSilver,
        cursor: 'pointer',
        transition: 'all .22s cubic-bezier(.34,1.56,.64,1)',
        transform: active ? 'translateY(-2px)' : 'translateY(0)',
      }}
    >
      <span
        style={{
          position: 'relative',
          display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 10,
          background: active
            ? `radial-gradient(circle at 30% 30%, ${accent}33, ${accent}11 70%)`
            : 'transparent',
        }}
      >
        <Icon size={20} strokeWidth={active ? 2.6 : 2} />
        {badge && badge > 0 ? (
          <span
            aria-label={`${badge} new`}
            style={{
              position: 'absolute', top: -4, right: -6,
              minWidth: 16, height: 16, padding: '0 4px',
              borderRadius: 8, background: '#ff3b30',
              color: '#fff', fontSize: 10, fontWeight: 800,
              display: 'grid', placeItems: 'center',
              boxShadow: '0 2px 6px rgba(255,59,48,0.45), 0 0 0 2px #fff',
              lineHeight: 1,
            }}
          >
            {badge > 99 ? '99+' : badge}
          </span>
        ) : null}
      </span>
      <span style={{ fontSize: 10, fontWeight: active ? 800 : 600, letterSpacing: 0.3 }}>
        {label}
      </span>
    </button>
  );
}
