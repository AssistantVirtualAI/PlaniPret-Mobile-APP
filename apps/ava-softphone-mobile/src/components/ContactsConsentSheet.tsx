/**
 * Contacts consent sheet — Apple Guideline 5.1.2 compliance.
 *
 * Shown BEFORE the app requests iOS Contacts permission or uploads any
 * contact to Supabase. States plainly what data is collected, that it is
 * uploaded to our servers, what it is used for, and how to revoke access.
 */
import React, { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { colors, font } from '../lib/theme';
import { setConsent } from '../lib/contactsConsent';
import { useT } from '../lib/i18n';

interface Props {
  open: boolean;
  onClose: (result: 'allowed' | 'declined' | 'ios_denied') => void;
}

export default function ContactsConsentSheet({ open, onClose }: Props) {
  const { tx } = useT();
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  const t = {
    title: tx('Accès à vos contacts', 'Access to your contacts'),
    intro: tx(
      "Planiprêt / AVA Softphone souhaite accéder à vos contacts pour identifier vos appelants et les associer automatiquement à vos dossiers clients.",
      'Planiprêt / AVA Softphone would like to access your contacts to identify incoming callers and automatically match them with your client files.'
    ),
    header: tx('Ce que nous faisons avec vos contacts', 'What we do with your contacts'),
    u1: tx('Identifier les appelants entrants par nom', 'Identify incoming callers by name'),
    u2: tx('Associer les numéros à vos dossiers clients', 'Match phone numbers to your client files'),
    u3: tx('Téléverser de façon sécurisée sur nos serveurs', 'Securely upload to our servers'),
    u4: tx('Jamais partagés avec des tiers', 'Never shared with third parties'),
    privacy: tx('Vos données sont protégées selon notre', 'Your data is protected under our'),
    privacyLink: tx('politique de confidentialité', 'privacy policy'),
    allow: tx("Autoriser l'accès aux contacts", 'Allow access to contacts'),
    decline: tx('Ne pas autoriser', "Don't allow"),
    revoke: tx(
      'Vous pouvez révoquer cet accès en tout temps dans Réglages → Planiprêt → Contacts, ou depuis « Plus → Supprimer mes contacts du serveur ».',
      'You can revoke this access at any time in Settings → Planiprêt → Contacts, or from "More → Delete my contacts from server".'
    ),
  };

  async function handleAllow() {
    if (busy) return;
    setBusy(true);
    await setConsent(true);
    let iosGranted = true;
    if (Capacitor.isNativePlatform()) {
      try {
        const { Contacts } = await import('@capacitor-community/contacts');
        const res = await Contacts.requestPermissions();
        iosGranted = res?.contacts === 'granted';
      } catch { iosGranted = false; }
    }
    setBusy(false);
    onClose(iosGranted ? 'allowed' : 'ios_denied');
  }

  async function handleDecline() {
    if (busy) return;
    setBusy(true);
    await setConsent(false);
    setBusy(false);
    onClose('declined');
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(2,7,20,0.82)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} role="dialog" aria-modal="true">
      <div style={{
        width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto',
        background: colors.cardBg || '#0E1B3D', color: colors.textIce,
        borderTopLeftRadius: 22, borderTopRightRadius: 22,
        padding: '24px 20px 32px', border: `1px solid ${colors.border}`,
      }}>
        <div style={{ textAlign: 'center', fontSize: 44, lineHeight: 1, marginBottom: 8 }}>👥</div>
        <h2 style={{ margin: 0, textAlign: 'center', fontSize: font.lg, fontWeight: 800 }}>{t.title}</h2>
        <p style={{ marginTop: 12, fontSize: font.sm, lineHeight: 1.45, color: colors.mutedSilver }}>{t.intro}</p>

        <div style={{
          marginTop: 16, padding: '14px 14px', borderRadius: 14,
          background: 'rgba(46,155,220,0.08)', border: `1px solid ${colors.border}`,
        }}>
          <div style={{ fontWeight: 700, fontSize: font.sm, marginBottom: 8 }}>{t.header}</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: font.sm, lineHeight: 1.55 }}>
            <li>{t.u1}</li>
            <li>{t.u2}</li>
            <li>{t.u3}</li>
            <li>{t.u4}</li>
          </ul>
        </div>

        <div style={{ marginTop: 14, fontSize: font.xs, color: colors.mutedSilver, textAlign: 'center' }}>
          {t.privacy}{' '}
          <a href="https://avastatistic.ca/privacy" target="_blank" rel="noreferrer"
             style={{ color: '#2E9BDC', textDecoration: 'underline' }}>
            {t.privacyLink}
          </a>.
        </div>

        <button onClick={handleAllow} disabled={busy} style={{
          marginTop: 18, width: '100%', padding: '14px 16px', borderRadius: 14,
          border: 'none', cursor: busy ? 'wait' : 'pointer', fontWeight: 800, fontSize: font.md,
          background: '#2E9BDC', color: '#fff',
        }}>{t.allow}</button>

        <button onClick={handleDecline} disabled={busy} style={{
          marginTop: 10, width: '100%', padding: '14px 16px', borderRadius: 14,
          border: `1px solid ${colors.border}`, background: 'transparent',
          color: colors.textIce, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontSize: font.md,
        }}>{t.decline}</button>

        <p style={{ marginTop: 14, fontSize: 11, color: colors.mutedSilver, textAlign: 'center', lineHeight: 1.4 }}>
          {t.revoke}
        </p>
      </div>
    </div>
  );
}
