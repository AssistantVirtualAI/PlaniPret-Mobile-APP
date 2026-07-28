import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { colors, font, radius } from '../lib/theme';
import { Card } from './ui/Primitives';
import { getLastSync, runContactsSync, type SyncReport } from '../lib/contactsSync';
import { useT } from '../lib/i18n';

function fmtAgo(at: number | null, fr: boolean): string {
  if (!at) return fr ? 'jamais' : 'never';
  const s = Math.floor((Date.now() - at) / 1000);
  if (s < 60) return fr ? "à l'instant" : 'just now';
  if (s < 3600) return fr ? `il y a ${Math.floor(s / 60)} min` : `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return fr ? `il y a ${Math.floor(s / 3600)} h` : `${Math.floor(s / 3600)}h ago`;
  return fr ? `il y a ${Math.floor(s / 86400)} j` : `${Math.floor(s / 86400)}d ago`;
}

export default function ContactsSyncCard() {
  const { lang } = useT();
  const fr = lang === 'fr';
  const [last, setLast] = useState<{ at: number | null; count: number | null }>({ at: null, count: null });
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<SyncReport | null>(null);

  useEffect(() => { getLastSync().then(setLast); }, []);

  const onSync = async () => {
    setBusy(true);
    setReport(null);
    try {
      const r = await runContactsSync({ force: true });
      setReport(r);
      const next = await getLastSync();
      setLast(next);
    } finally {
      setBusy(false);
    }
  };

  const native = Capacitor.isNativePlatform();

  return (
    <Card padded={true} accent="blue" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 38, height: 38, borderRadius: '50%',
          background: 'rgba(0,35,230,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18,
        }}>👥</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: font.sm, fontWeight: 700, color: colors.textIce }}>
            {fr ? 'Synchronisation des contacts' : 'Contacts sync'}
          </div>
          <div style={{ fontSize: 11, color: colors.mutedSilver, marginTop: 2 }}>
            {fr
              ? `Dernière sync : ${fmtAgo(last.at, true)}${last.count != null ? ` · ${last.count} contacts` : ''}`
              : `Last sync: ${fmtAgo(last.at, false)}${last.count != null ? ` · ${last.count} contacts` : ''}`}
          </div>
        </div>
        <button
          onClick={onSync}
          disabled={busy || !native}
          style={{
            padding: '8px 14px', borderRadius: radius.md,
            background: busy ? 'rgba(255,255,255,0.08)' : colors.lemtelBlue,
            color: '#fff', border: 'none',
            fontSize: 12, fontWeight: 700, cursor: busy || !native ? 'not-allowed' : 'pointer',
            opacity: native ? 1 : 0.5,
          }}
        >
          {busy ? (fr ? 'Sync…' : 'Syncing…') : (fr ? 'Synchroniser' : 'Sync now')}
        </button>
      </div>
      {!native && (
        <div style={{ marginTop: 8, fontSize: 11, color: colors.mutedSilver }}>
          {fr ? 'Disponible uniquement sur l\'app mobile.' : 'Available only on the mobile app.'}
        </div>
      )}
      {report && (
        <div style={{
          marginTop: 10, padding: '8px 10px', borderRadius: radius.sm,
          background: report.ok ? 'rgba(34,197,94,0.16)' : 'rgba(220,38,38,0.16)',
          fontSize: 11, color: report.ok ? '#bbf7d0' : '#fecaca',
        }}>
          {report.ok
            ? (fr ? `✓ ${report.inserted}/${report.total} contacts synchronisés` : `✓ ${report.inserted}/${report.total} contacts synced`)
            : (fr ? `✗ Échec : ${report.error || 'inconnu'}` : `✗ Failed: ${report.error || 'unknown'}`)}
        </div>
      )}
    </Card>
  );
}
