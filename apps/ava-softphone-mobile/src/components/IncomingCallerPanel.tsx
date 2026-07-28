/**
 * Rich identity panel rendered above the Accept/Decline buttons on an
 * incoming call. Falls back to the raw number while the caller-id lookup
 * is in flight, then upgrades with name + CRM context + photo when the
 * `pp-caller-lookup` edge function responds.
 */
import React from 'react';
import { colors, font, radius } from '../lib/theme';
import { useT } from '../lib/i18n';
import type { CallerLookup } from '../lib/sip/callerLookup';

interface Props {
  lookup: CallerLookup | null;
  rawNumber: string;
}

function sourceLabel(s: CallerLookup['source'], fr: boolean): string | null {
  switch (s) {
    case 'maestro': return fr ? 'Client Maestro' : 'Maestro client';
    case 'broker': return fr ? 'Collègue Planiprêt' : 'Planiprêt colleague';
    case 'microsoft': return fr ? 'Contact Microsoft' : 'Microsoft contact';
    case 'device': return fr ? 'Contact téléphone' : 'Phone contact';
    default: return null;
  }
}

function crmLine(l: CallerLookup): string | null {
  if (l.source !== 'maestro' || !l.crm_meta) return null;
  const parts: string[] = [];
  if (l.crm_meta.stage) parts.push(l.crm_meta.stage);
  if (typeof l.crm_meta.score === 'number') parts.push(`Score ${Math.round(l.crm_meta.score)}`);
  return parts.length ? parts.join(' · ') : null;
}

export default function IncomingCallerPanel({ lookup, rawNumber }: Props) {
  const { lang, tx } = useT();
  const fr = lang === 'fr';
  const name = lookup?.found ? lookup.name : (lookup?.display_number || rawNumber);
  const sub = lookup?.found ? lookup.display_number : tx('Inconnu', 'Unknown');
  const tag = lookup?.found ? sourceLabel(lookup.source, fr) : null;
  const crm = lookup?.found ? crmLine(lookup) : null;
  const company = lookup?.found ? lookup.company : null;
  const photo = lookup?.found ? lookup.photo_url : null;
  const initial = String(name || '#').trim().charAt(0).toUpperCase();

  return (
    <div style={{
      margin: '0 16px 8px',
      padding: '14px 16px',
      borderRadius: radius.lg,
      background: 'linear-gradient(180deg, rgba(0,35,230,0.20), rgba(255,255,255,0.04))',
      border: `1px solid ${colors.border}`,
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        background: photo ? `url(${photo}) center/cover` : 'linear-gradient(135deg, #2456ff, #23d6ff)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 22, fontWeight: 600,
        boxShadow: '0 8px 22px -10px rgba(0,35,230,0.6)',
        flexShrink: 0,
      }}>
        {photo ? '' : initial}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: font.md, fontWeight: 700, color: colors.textIce, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {name}
        </div>
        <div style={{ fontSize: 12, color: colors.mutedSilver, fontFamily: 'JetBrains Mono, monospace', marginTop: 2 }}>
          {sub}
        </div>
        {(tag || company || crm) && (
          <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tag && <Chip color={lookup?.source === 'maestro' ? '#f59e0b' : '#23d6ff'}>{tag}</Chip>}
            {company && <Chip>{company}</Chip>}
            {crm && <Chip color="#f59e0b">{crm}</Chip>}
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ children, color = '#94a3b8' }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{
      padding: '3px 8px', borderRadius: 999,
      background: 'rgba(255,255,255,0.06)',
      border: `1px solid ${color}66`,
      fontSize: 10, fontWeight: 700, letterSpacing: 0.6,
      color, textTransform: 'uppercase',
    }}>{children}</span>
  );
}
