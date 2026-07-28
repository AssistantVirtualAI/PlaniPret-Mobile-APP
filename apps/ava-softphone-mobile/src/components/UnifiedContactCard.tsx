/**
 * Unified contact card — merges device + Microsoft + Maestro data for a
 * single phone number. Used in Contacts detail and Call detail.
 */
import React from 'react';
import { colors, font, radius } from '../lib/theme';
import { useT } from '../lib/i18n';
import type { CallerLookup } from '../lib/sip/callerLookup';

interface Props {
  lookup: CallerLookup;
  onCall?: (number: string) => void;
  onSms?: (number: string) => void;
  maestroLinkBase?: string;
}

export default function UnifiedContactCard({ lookup, onCall, onSms, maestroLinkBase }: Props) {
  const { tx } = useT();
  const name = lookup.name;
  const initial = (name || '#').trim().charAt(0).toUpperCase();
  const mobile = lookup.ms_meta?.mobile ?? lookup.display_number;
  const business = lookup.ms_meta?.business ?? [];
  const email = lookup.email ?? lookup.ms_meta?.email ?? null;
  const company = lookup.company ?? null;
  const isMaestro = lookup.source === 'maestro';

  return (
    <div style={{
      padding: 16, borderRadius: radius.lg,
      background: 'rgba(255,255,255,0.04)',
      border: `1px solid ${colors.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <div style={{
          width: 62, height: 62, borderRadius: '50%',
          background: lookup.photo_url ? `url(${lookup.photo_url}) center/cover` : 'linear-gradient(135deg, #2456ff, #23d6ff)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 26, fontWeight: 600,
        }}>{lookup.photo_url ? '' : initial}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: font.lg, fontWeight: 700, color: colors.textIce }}>{name}</div>
          {company && <div style={{ fontSize: 12, color: colors.mutedSilver, marginTop: 2 }}>🏢 {company}</div>}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {mobile && <Row icon="📱" label={tx('Mobile', 'Mobile')} value={mobile} onPress={onCall ? () => onCall(mobile) : undefined} />}
        {business.map((n, i) => (
          <Row key={`b-${i}`} icon="📞" label={tx('Bureau', 'Office')} value={n} onPress={onCall ? () => onCall(n) : undefined} />
        ))}
        {email && <Row icon="📧" label={tx('Courriel', 'Email')} value={email} onPress={() => { try { window.open(`mailto:${email}`); } catch {} }} />}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        {onCall && mobile && (
          <ActionButton color={colors.success} onClick={() => onCall(mobile)} label={tx('Appeler', 'Call')} icon="📞" />
        )}
        {onSms && mobile && (
          <ActionButton color="#2456ff" onClick={() => onSms(mobile)} label="SMS" icon="💬" />
        )}
        {isMaestro && maestroLinkBase && (
          <ActionButton color="#f59e0b" onClick={() => { try { window.open(maestroLinkBase, '_blank'); } catch {} }} label="Maestro" icon="🔗" />
        )}
      </div>
    </div>
  );
}

function Row({ icon, label, value, onPress }: { icon: string; label: string; value: string; onPress?: () => void }) {
  return (
    <button
      onClick={onPress}
      disabled={!onPress}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 10px', borderRadius: radius.sm,
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${colors.border}`,
        color: colors.textIce, textAlign: 'left',
        cursor: onPress ? 'pointer' : 'default', width: '100%',
      }}
    >
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ fontSize: 10, color: colors.mutedSilver, width: 64, textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</span>
      <span style={{ flex: 1, fontSize: 13, fontFamily: 'JetBrains Mono, monospace' }}>{value}</span>
    </button>
  );
}

function ActionButton({ color, onClick, label, icon }: { color: string; onClick: () => void; label: string; icon: string }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '10px 12px', borderRadius: radius.md,
      background: color, color: '#fff', border: 'none',
      fontSize: 12, fontWeight: 700, cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    }}>
      <span>{icon}</span>{label}
    </button>
  );
}
