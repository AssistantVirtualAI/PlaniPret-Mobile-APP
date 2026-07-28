import React from 'react';
import { colors, font } from '../lib/theme';
import { Card, SectionTitle, SettingsRow, PrimaryButton } from '../components/ui/Primitives';
import { useT } from '../lib/i18n';

export default function SupportScreen() {
  const { lang } = useT();
  const fr = lang === 'fr';
  const diag = () => {
    const body = encodeURIComponent(
      [
        fr ? 'Diagnostic AVA Softphone' : 'AVA Softphone diagnostic',
        '------------------------',
        `${fr ? 'Version' : 'App version'}: 1.0.0`,
        `UA: ${navigator.userAgent}`,
        `${fr ? 'Heure' : 'Time'}: ${new Date().toISOString()}`,
        '',
        fr ? 'Décrivez le problème :' : 'Describe the issue:',
        '',
      ].join('\n'),
    );
    window.location.href = `mailto:support@avastatistic.ca?subject=AVA%20Softphone%20support&body=${body}`;
  };

  return (
    <div style={{ padding: 16, overflowY: 'auto' }}>
      <SectionTitle eyebrow={fr ? 'Aide' : 'Help'} title={fr ? 'Contacter le support' : 'Contact support'} />
      <Card padded={false}>
        <SettingsRow label={fr ? 'Support par courriel' : 'Email support'} icon="✉" value="support@avastatistic.ca" onPress={() => (window.location.href = 'mailto:support@avastatistic.ca')} />
        <SettingsRow label={fr ? 'Nous appeler' : 'Call us'}              icon="☎" value="+1 514 555 0100"       onPress={() => (window.location.href = 'tel:+15145550100')} />
        <SettingsRow label={fr ? 'Base de connaissances' : 'Knowledge base'} icon="📘" value="avastatistic.ca/help" onPress={() => window.open('https://avastatistic.ca/help', '_blank')} />
        <SettingsRow label={fr ? 'État du service' : 'Status page'}       icon="◐" value="status.avastatistic.ca" onPress={() => window.open('https://status.avastatistic.ca', '_blank')} />
      </Card>

      <SectionTitle eyebrow={fr ? 'Diagnostics' : 'Diagnostics'} title={fr ? 'Envoyer un rapport' : 'Send report'} />
      <Card padded={true}>
        <p style={{ fontSize: font.sm, color: colors.textSub, lineHeight: 1.55 }}>
          {fr
            ? "L'envoi des diagnostics joint la version et les infos de l'appareil pour une aide plus rapide. Aucun audio, enregistrement ou message n'est inclus."
            : "Sending diagnostics attaches your app version and device info so we can help you faster. No call audio, recordings or messages are included."}
        </p>
        <PrimaryButton onClick={diag} style={{ marginTop: 10, width: '100%' }}>
          {fr ? 'Envoyer le diagnostic par courriel' : 'Send diagnostic email'}
        </PrimaryButton>
      </Card>

      <p style={{ fontSize: font.xs, color: colors.mutedSilver, textAlign: 'center', marginTop: 14 }}>
        {fr ? 'Réponse sous un jour ouvré · FR / EN' : 'Response within one business day · EN / FR'}
      </p>
    </div>
  );
}
