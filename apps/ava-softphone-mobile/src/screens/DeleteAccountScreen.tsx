import React, { useState } from 'react';
import { colors, font, radius } from '../lib/theme';
import { mobileApi } from '../lib/mobileApi';
import { Card, PrimaryButton } from '../components/ui/Primitives';
import { useT } from '../lib/i18n';

export default function DeleteAccountScreen({ onDone }: { onDone: () => void }) {
  const { lang } = useT();
  const fr = lang === 'fr';
  const KEYWORD = fr ? 'SUPPRIMER' : 'DELETE';
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canDelete = confirm.trim().toUpperCase() === KEYWORD;

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await mobileApi.deleteAccount();
      onDone();
    } catch (e: any) {
      setErr(e.message || (fr ? 'Suppression impossible. Contactez help@avastatistic.ca' : 'Could not delete account. Contact help@avastatistic.ca'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: '16px', overflowY: 'auto' }}>
      <Card padded={true} accent="gold">
        <div style={{ fontSize: font.md, fontWeight: 800, color: colors.danger }}>
          {fr ? 'Supprimer définitivement votre compte' : 'Permanently delete your account'}
        </div>
        <p style={{ fontSize: font.sm, color: colors.textSub, lineHeight: 1.55, marginTop: 8 }}>
          {fr
            ? "Cela supprimera votre compte AVA Softphone, vous déconnectera de tous les appareils et délier votre extension. Les enregistrements, messageries et analyses appartenant à votre organisation restent chez votre administrateur."
            : "This will remove your AVA Softphone account, sign you out on all devices, and unlink your extension. Call recordings, voicemails and analytics owned by your organization remain with your administrator."}
        </p>
        <ul style={{ fontSize: font.sm, color: colors.textSub, lineHeight: 1.55, paddingLeft: 18, margin: '8px 0' }}>
          {(fr ? [
            "Identité d'authentification supprimée",
            'Jetons push révoqués',
            "Rôles et lien d'extension retirés",
            "Entrée d'audit créée (conservation 90 jours)",
          ] : [
            'Authentication identity deleted',
            'Push tokens revoked',
            'Roles and extension link removed',
            'Audit log entry created (90-day retention)',
          ]).map((s) => <li key={s}>{s}</li>)}
        </ul>
        <p style={{ fontSize: font.sm, color: colors.textIce, marginTop: 10 }}>
          {fr ? <>Tapez <strong>{KEYWORD}</strong> pour confirmer :</> : <>Type <strong>{KEYWORD}</strong> to confirm:</>}
        </p>
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={KEYWORD}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '12px 14px', borderRadius: radius.md,
            border: `1px solid ${colors.border}`,
            background: '#fff', color: colors.textIce, fontSize: font.base, marginTop: 6,
            fontFamily: 'JetBrains Mono, monospace', letterSpacing: 2,
          }}
        />
        {err && <div style={{ fontSize: font.sm, color: colors.danger, marginTop: 8 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <PrimaryButton onClick={submit} disabled={!canDelete || busy} style={{
            flex: 1, background: colors.danger,
          }}>{busy ? (fr ? 'Suppression…' : 'Deleting…') : (fr ? 'Supprimer mon compte' : 'Delete my account')}</PrimaryButton>
        </div>
      </Card>

      <p style={{ fontSize: font.xs, color: colors.mutedSilver, textAlign: 'center', marginTop: 12 }}>
        {fr ? 'Besoin d’aide à la place ? Écrivez à help@avastatistic.ca' : 'Need help instead? Email help@avastatistic.ca'}
      </p>
    </div>
  );
}
