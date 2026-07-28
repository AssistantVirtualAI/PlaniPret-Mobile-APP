import React from 'react';
import { useT } from '../lib/i18n';

export default function RecentsScreen({ sp }: { sp: any }) {
  const recents: any[] = sp.snap.recents || [];
  const { lang } = useT();
  const fr = lang === 'fr';
  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '20px 16px' }}>
      <h2 style={titleStyle}>{fr ? 'Récents' : 'Recents'}</h2>
      {recents.length === 0 ? (
        <Empty label={fr ? 'Aucun appel récent' : 'No recent calls'} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {recents.map((r, i) => (
            <button key={i} onClick={() => sp.call(r.number)} style={rowStyle}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                <span style={{ fontSize: 16, color: r.direction === 'missed' ? 'var(--danger)' : 'white' }}>
                  {r.name || r.number}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {r.direction === 'in' ? '↙' : r.direction === 'missed' ? '✕' : '↗'} {new Date(r.at).toLocaleString(fr ? 'fr-CA' : undefined)}
                </span>
              </div>
              <span style={{ fontSize: 18, color: 'var(--brand-blue-2)' }}>☏</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Empty({ label }: { label: string }) {
  return (
    <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)', fontSize: 13 }}>{label}</div>
  );
}

const titleStyle: React.CSSProperties = { fontSize: 28, fontWeight: 700, margin: '8px 0 16px', letterSpacing: -0.5 };
const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '14px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--border)', cursor: 'pointer', color: 'white',
};
