import React from 'react';
import { colors, font, radius } from '../lib/theme';
import { Card, SectionTitle } from '../components/ui/Primitives';
import { useT } from '../lib/i18n';

export default function PrivacyScreen() {
  const { lang } = useT();
  const fr = lang === 'fr';
  const T = fr ? FR : EN;

  return (
    <div style={{ padding: 16, overflowY: 'auto', paddingBottom: 120 }}>
      <SectionTitle eyebrow={T.eyebrow} title={T.title} />

      <Card padded={true}>
        <p style={{ fontSize: font.sm, color: colors.textSub, lineHeight: 1.6 }}
           dangerouslySetInnerHTML={{ __html: T.intro }} />
      </Card>

      {T.sections.map((s) => (
        <Section key={s.title} title={s.title} items={s.items} />
      ))}

      <Card padded={true}>
        <h3 style={{ fontSize: font.md, fontWeight: 800, color: colors.textIce, margin: '0 0 8px' }}>
          {T.controlsTitle}
        </h3>
        {T.controls.map((c) => <ControlRow key={c.label} label={c.label} desc={c.desc} />)}
      </Card>

      <Card padded={true}>
        <p style={{ fontSize: font.sm, color: colors.textSub, lineHeight: 1.6, margin: 0 }}
           dangerouslySetInnerHTML={{ __html: T.contact }} />
        <p style={{ fontSize: font.sm, color: colors.lemtelBlue, marginTop: 10, marginBottom: 0 }}>
          {T.fullPolicy}: <a href="https://avastatistic.ca/privacy" target="_blank" rel="noreferrer" style={{ color: colors.lemtelBlue }}>avastatistic.ca/privacy</a><br/>
          {T.terms}: <a href="https://avastatistic.ca/terms" target="_blank" rel="noreferrer" style={{ color: colors.lemtelBlue }}>avastatistic.ca/terms</a>
        </p>
      </Card>
    </div>
  );
}

function Section({ title, items }: { title: string; items: { k: string; v: string }[] }) {
  return (
    <Card padded={true}>
      <h3 style={{ fontSize: font.md, fontWeight: 800, color: colors.textIce, margin: '0 0 10px' }}>{title}</h3>
      <div style={{ display: 'grid', gap: 8 }}>
        {items.map((it) => (
          <div key={it.k} style={{
            display: 'grid', gridTemplateColumns: '110px 1fr', gap: 10,
            padding: '8px 10px', background: 'rgba(0,35,230,0.04)',
            borderRadius: radius.sm, border: `1px solid ${colors.border}`,
          }}>
            <span style={{ fontSize: font.xs, fontWeight: 800, color: colors.lemtelBlue, letterSpacing: 0.3, textTransform: 'uppercase' }}>{it.k}</span>
            <span style={{ fontSize: font.sm, color: colors.textSub, lineHeight: 1.5 }}>{it.v}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ControlRow({ label, desc }: { label: string; desc: string }) {
  return (
    <div style={{ padding: '10px 0', borderTop: `1px solid ${colors.border}` }}>
      <div style={{ fontSize: font.sm, fontWeight: 800, color: colors.textIce }}>{label}</div>
      <div style={{ fontSize: font.sm, color: colors.textSub, lineHeight: 1.5, marginTop: 2 }}>{desc}</div>
    </div>
  );
}

const EN = {
  eyebrow: 'Privacy',
  title: 'How AVA Softphone uses your data',
  intro: 'AVA Softphone is built around <strong>privacy-by-design</strong>. We only collect what is strictly required to deliver voice service, notify you about calls, transcribe and analyse conversations for your own workspace, and protect your account. All traffic is encrypted with TLS 1.2+ and stored in your workspace database with row-level security.',
  controlsTitle: '7. Your data controls',
  contact: 'We <strong>never</strong> sell your data and <strong>never</strong> share it with advertisers. Questions, exercising rights, or breach reports: <a href="mailto:privacy@avastatistic.ca" style="color:#0023e6">privacy@avastatistic.ca</a>.',
  fullPolicy: 'Full policy',
  terms: 'Terms of service',
  sections: [
    { title: '1. Call history (CDRs)', items: [
      { k: 'Collected', v: 'Caller/callee number, direction, start time, duration, disposition, queue, agent extension.' },
      { k: 'Source', v: 'Synced from your company PBX over a secure backend connection.' },
      { k: 'Purpose', v: 'Display recent calls, dashboards, missed-call alerts.' },
      { k: 'Retention', v: 'Mirrors PBX retention policy — default 90 days, configurable by your workspace admin.' },
      { k: 'Sharing', v: 'Never shared with third parties. Stays inside your workspace.' },
      { k: 'Your control', v: 'Clear local cache · Request data export · Delete account.' },
    ]},
    { title: '2. Call recordings', items: [
      { k: 'Collected', v: 'Audio file reference and metadata. Audio is streamed on demand — never stored on your device.' },
      { k: 'Legal basis', v: 'Recording follows your company PBX recording rules. You are informed before playback.' },
      { k: 'Purpose', v: 'Quality assurance, training, dispute resolution.' },
      { k: 'Retention', v: 'Per workspace policy (typically 30 / 60 / 90 days).' },
      { k: 'Access', v: 'Gated by role. Every playback is written to the audit log.' },
      { k: 'Your control', v: 'Request deletion of recordings tied to your extension via Support.' },
    ]},
    { title: '3. AI transcription & analysis', items: [
      { k: 'Collected', v: 'Transcript text, speaker turns (Agent/Caller), sentiment, summary, key topics, action items.' },
      { k: 'Processing', v: 'Audio is sent to the AVA AI Gateway over TLS, processed transiently. Audio is NOT used to train any third-party model.' },
      { k: 'Storage', v: 'Transcript + analysis stored in your workspace database, linked to the call record.' },
      { k: 'Purpose', v: 'Searchable history, coaching, sentiment trends, customer-experience scoring.' },
      { k: 'Retention', v: 'Same lifecycle as the parent call recording.' },
      { k: 'Your control', v: 'Per-recording "Delete transcript" · Workspace toggle "Disable AI analysis on my calls".' },
    ]},
    { title: '4. Voicemail', items: [
      { k: 'Collected', v: 'Audio + AI transcript + caller metadata.' },
      { k: 'Purpose', v: 'Listen, read, return missed calls.' },
      { k: 'Retention', v: 'Workspace default (30 days). Deleted voicemails are purged within 24h.' },
    ]},
    { title: '5. Account & device', items: [
      { k: 'Collected', v: 'Email, display name, SIP extension, role, device push token, app version, OS.' },
      { k: 'Purpose', v: 'Authentication, push delivery, support diagnostics.' },
      { k: 'Retention', v: 'Until account deletion. 30-day grace period, then full purge.' },
    ]},
    { title: '6. Diagnostics & crash logs', items: [
      { k: 'Collected', v: 'Anonymous error events, build version, SIP connectivity state. NO call content.' },
      { k: 'Your control', v: 'Toggle off in More → Permissions → Diagnostics.' },
    ]},
  ],
  controls: [
    { label: 'Export my data', desc: 'Download a JSON archive of your account, call history, and transcripts.' },
    { label: 'Delete my account', desc: 'Permanent removal of your account, sessions, push tokens, and personal data.' },
    { label: 'Revoke this device', desc: 'Sign out and remove the device push token from our servers.' },
    { label: 'Disable AI analysis on my calls', desc: 'Stops AVA from transcribing or analyzing future calls tied to your extension.' },
    { label: 'Manage permissions', desc: 'Microphone, Notifications, Contacts, Background sync — toggle any time.' },
  ],
};

const FR = {
  eyebrow: 'Confidentialité',
  title: "Comment AVA Softphone utilise vos données",
  intro: "AVA Softphone est conçu selon le principe de <strong>confidentialité dès la conception</strong>. Nous ne collectons que ce qui est strictement nécessaire pour fournir le service vocal, vous notifier des appels, transcrire et analyser les conversations pour votre propre espace de travail, et protéger votre compte. Tout le trafic est chiffré en TLS 1.2+ et stocké dans la base de données de votre espace avec sécurité au niveau des lignes.",
  controlsTitle: '7. Vos contrôles de données',
  contact: "Nous ne vendons <strong>jamais</strong> vos données et ne les partageons <strong>jamais</strong> avec des annonceurs. Questions, exercice de vos droits ou signalement d'incident : <a href=\"mailto:privacy@avastatistic.ca\" style=\"color:#0023e6\">privacy@avastatistic.ca</a>.",
  fullPolicy: 'Politique complète',
  terms: "Conditions d'utilisation",
  sections: [
    { title: "1. Historique d'appels (CDR)", items: [
      { k: 'Collecté', v: "Numéro appelant/appelé, direction, heure de début, durée, disposition, file, extension de l'agent." },
      { k: 'Source', v: 'Synchronisé depuis le PBX de votre entreprise via une connexion backend sécurisée.' },
      { k: 'Finalité', v: "Afficher les appels récents, tableaux de bord, alertes d'appels manqués." },
      { k: 'Conservation', v: 'Reflète la politique du PBX — 90 jours par défaut, configurable par votre admin.' },
      { k: 'Partage', v: "Jamais partagé avec des tiers. Reste dans votre espace de travail." },
      { k: 'Votre contrôle', v: "Vider le cache local · Demander l'export des données · Supprimer le compte." },
    ]},
    { title: "2. Enregistrements d'appels", items: [
      { k: 'Collecté', v: "Référence du fichier audio et métadonnées. L'audio est diffusé à la demande — jamais stocké sur votre appareil." },
      { k: 'Base légale', v: "L'enregistrement suit les règles du PBX de votre entreprise. Vous êtes informé avant la lecture." },
      { k: 'Finalité', v: "Assurance qualité, formation, résolution de litiges." },
      { k: 'Conservation', v: 'Selon la politique de votre espace (typiquement 30 / 60 / 90 jours).' },
      { k: 'Accès', v: "Contrôlé par rôle. Chaque lecture est inscrite au journal d'audit." },
      { k: 'Votre contrôle', v: 'Demander la suppression via le Support.' },
    ]},
    { title: "3. Transcription et analyse IA", items: [
      { k: 'Collecté', v: "Texte de transcription, tours de parole (Agent/Appelant), sentiment, résumé, sujets clés, actions." },
      { k: 'Traitement', v: "L'audio est envoyé à la passerelle AVA AI en TLS, traité de manière transitoire. L'audio n'est PAS utilisé pour entraîner un modèle tiers." },
      { k: 'Stockage', v: 'Transcription + analyse stockées dans votre espace, liées à l\'appel.' },
      { k: 'Finalité', v: 'Historique recherchable, coaching, tendances de sentiment, score client.' },
      { k: 'Conservation', v: "Même cycle de vie que l'enregistrement parent." },
      { k: 'Votre contrôle', v: "« Supprimer la transcription » par enregistrement · Bascule « Désactiver l'analyse IA »." },
    ]},
    { title: '4. Messagerie vocale', items: [
      { k: 'Collecté', v: "Audio + transcription IA + métadonnées de l'appelant." },
      { k: 'Finalité', v: 'Écouter, lire, rappeler les appels manqués.' },
      { k: 'Conservation', v: 'Par défaut 30 jours. Les messages supprimés sont purgés sous 24h.' },
    ]},
    { title: '5. Compte et appareil', items: [
      { k: 'Collecté', v: "E-mail, nom affiché, extension SIP, rôle, jeton push, version de l'app, OS." },
      { k: 'Finalité', v: 'Authentification, livraison des notifications, diagnostics de support.' },
      { k: 'Conservation', v: 'Jusqu\'à la suppression du compte. 30 jours de grâce, puis purge complète.' },
    ]},
    { title: '6. Diagnostics et journaux de crash', items: [
      { k: 'Collecté', v: "Événements d'erreur anonymes, version, état SIP. AUCUN contenu d'appel." },
      { k: 'Votre contrôle', v: 'Désactivez dans Plus → Permissions → Diagnostics.' },
    ]},
  ],
  controls: [
    { label: 'Exporter mes données', desc: "Téléchargez une archive JSON de votre compte, historique d'appels et transcriptions." },
    { label: 'Supprimer mon compte', desc: 'Suppression permanente du compte, sessions, jetons push et données personnelles.' },
    { label: 'Révoquer cet appareil', desc: 'Déconnexion et retrait du jeton push de nos serveurs.' },
    { label: "Désactiver l'analyse IA sur mes appels", desc: "Empêche AVA de transcrire ou analyser les futurs appels liés à votre extension." },
    { label: 'Gérer les permissions', desc: 'Microphone, notifications, contacts, sync arrière-plan — à tout moment.' },
  ],
};
