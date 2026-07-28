/**
 * Calling Features — visual catalogue of every available softphone action
 * with availability rules and inline tooltips.
 */
import React, { useState } from 'react';
import { colors, font, radius, gradients, shadow } from '../lib/theme';
import { SectionTitle } from '../components/ui/Primitives';
import { useT } from '../lib/i18n';

type Availability = 'always' | 'in-call' | 'on-hold' | 'idle' | 'admin' | 'soon';

interface Feature {
  key: string;
  label: { en: string; fr: string };
  icon: string;
  tone: 'blue' | 'gold' | 'cyan' | 'violet' | 'danger';
  description: { en: string; fr: string };
  availability: Availability;
}

const FEATURES: Feature[] = [
  { key: 'mute',       label: { en: 'Mute / Unmute', fr: 'Couper / Activer micro' }, icon: '🎙', tone: 'blue',   description: { en: 'Silence your microphone while you stay on the call. Tap again to unmute.', fr: 'Coupez votre micro tout en restant en ligne. Touchez à nouveau pour réactiver.' }, availability: 'in-call' },
  { key: 'hold',       label: { en: 'Hold', fr: 'Mise en attente' }, icon: '⏸',  tone: 'gold',   description: { en: 'Place the active call on hold with music. The other party cannot hear you.', fr: 'Mettez l’appel en attente avec musique. Votre interlocuteur ne vous entend plus.' }, availability: 'in-call' },
  { key: 'resume',     label: { en: 'Resume', fr: 'Reprendre' }, icon: '▶',  tone: 'blue',   description: { en: 'Take the call back from hold and continue the conversation.', fr: 'Reprenez l’appel mis en attente et poursuivez la conversation.' }, availability: 'on-hold' },
  { key: 'transferB',  label: { en: 'Blind Transfer', fr: 'Transfert aveugle' }, icon: '↗',  tone: 'cyan',   description: { en: 'Send the call to another extension or number without announcing it.', fr: 'Transférez l’appel vers une autre extension ou un numéro sans l’annoncer.' }, availability: 'in-call' },
  { key: 'transferA',  label: { en: 'Attended Transfer', fr: 'Transfert supervisé' }, icon: '↪',  tone: 'cyan',   description: { en: 'Speak with the destination first, then complete the transfer.', fr: 'Parlez d’abord au destinataire, puis finalisez le transfert.' }, availability: 'in-call' },
  { key: 'conference', label: { en: '3-Way Conference', fr: 'Conférence à 3' }, icon: '👥', tone: 'violet', description: { en: 'Add a third participant to create a live conference bridge.', fr: 'Ajoutez un troisième participant pour créer une conférence en direct.' }, availability: 'in-call' },
  { key: 'record',     label: { en: 'Record', fr: 'Enregistrer' }, icon: '●',  tone: 'danger', description: { en: 'Start or stop on-demand recording. AVA can transcribe the audio after.', fr: 'Démarrez ou arrêtez l’enregistrement à la demande. AVA peut transcrire ensuite.' }, availability: 'in-call' },
  { key: 'park',       label: { en: 'Park', fr: 'Parquer' }, icon: '🅿', tone: 'gold',   description: { en: 'Park the call in a shared slot any teammate can pick up.', fr: 'Parquez l’appel dans un emplacement partagé qu’un collègue peut reprendre.' }, availability: 'in-call' },
  { key: 'dtmf',       label: { en: 'DTMF Keypad', fr: 'Clavier DTMF' }, icon: '⌨',  tone: 'blue',   description: { en: 'Send tones to navigate IVRs and phone menus.', fr: 'Envoyez des tonalités pour naviguer dans les SVI et menus téléphoniques.' }, availability: 'in-call' },
  { key: 'dnd',        label: { en: 'Do Not Disturb', fr: 'Ne pas déranger' }, icon: '🌙', tone: 'violet', description: { en: 'Block incoming ringing on this extension. Voicemail still works.', fr: 'Bloquez la sonnerie entrante sur cette extension. La messagerie reste active.' }, availability: 'always' },
  { key: 'forward',    label: { en: 'Call Forwarding', fr: 'Transfert d’appel' }, icon: '⇢',  tone: 'cyan',   description: { en: 'Redirect every incoming call to another number while you are away.', fr: 'Redirigez tous les appels entrants vers un autre numéro pendant votre absence.' }, availability: 'always' },
  { key: 'voicemail',  label: { en: 'Voicemail', fr: 'Messagerie vocale' }, icon: '✉',  tone: 'gold',   description: { en: 'Listen to messages and get AI summaries + sentiment for each one.', fr: 'Écoutez les messages avec résumé IA et analyse de ton pour chacun.' }, availability: 'always' },
  { key: 'cw',         label: { en: 'Call Waiting', fr: 'Appel en attente' }, icon: '⌛', tone: 'blue',   description: { en: 'Get a soft beep when a second call arrives while you are talking.', fr: 'Recevez un bip discret lorsqu’un second appel arrive pendant votre conversation.' }, availability: 'always' },
  { key: 'blocklist',  label: { en: 'Blocked Numbers', fr: 'Numéros bloqués' }, icon: '🚫', tone: 'danger', description: { en: 'Numbers on this list will hear a fast-busy tone — they never ring you.', fr: 'Les numéros de cette liste entendent une tonalité d’occupation — ils ne vous joignent jamais.' }, availability: 'always' },
  { key: 'ava',        label: { en: 'AVA Live Assist', fr: 'Assistance AVA en direct' }, icon: '✦',  tone: 'violet', description: { en: 'Real-time coaching, objection handling and post-call summary.', fr: 'Coaching en temps réel, gestion des objections et résumé post-appel.' }, availability: 'in-call' },
  { key: 'queues',     label: { en: 'Queue Pause', fr: 'Pause de file d’attente' }, icon: '⇉',  tone: 'gold',   description: { en: 'Pause/unpause yourself in your assigned call-center queues.', fr: 'Mettez en pause ou reprenez votre activité dans vos files d’attente assignées.' }, availability: 'always' },
];

function badgeFor(a: Availability, lang: 'en' | 'fr') {
  const L = (en: string, fr: string) => (lang === 'fr' ? fr : en);
  switch (a) {
    case 'always':  return { label: L('Always available', 'Toujours disponible'), color: colors.success };
    case 'in-call': return { label: L('Requires active call', 'Nécessite un appel actif'), color: colors.signalGold };
    case 'on-hold': return { label: L('While on hold', 'Pendant la mise en attente'), color: colors.avaCyan };
    case 'idle':    return { label: L('When idle', 'Au repos'), color: colors.mutedSilver };
    case 'admin':   return { label: L('Admin only', 'Administrateur uniquement'), color: colors.avaViolet };
    case 'soon':    return { label: L('Coming soon', 'Bientôt disponible'), color: colors.mutedSilver };
  }
}

function toneAccent(t: Feature['tone']) {
  switch (t) {
    case 'blue':   return colors.lemtelBlue;
    case 'gold':   return colors.signalGold;
    case 'cyan':   return colors.avaCyan;
    case 'violet': return colors.avaViolet;
    case 'danger': return colors.danger;
  }
}

export default function FeaturesScreen({ sp }: { sp?: any }) {
  const [open, setOpen] = useState<Feature | null>(null);
  const { lang } = useT();
  const inCall = sp?.snap?.callState === 'active' || sp?.snap?.callState === 'held';
  const onHold = sp?.snap?.callState === 'held';

  const isEnabled = (a: Availability) =>
    a === 'always' ? true :
    a === 'in-call' ? inCall :
    a === 'on-hold' ? onHold :
    a === 'idle' ? !inCall :
    false;

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '14px 14px 32px' }}>
      <SectionTitle eyebrow={lang === 'fr' ? 'Référence' : 'Reference'} title={lang === 'fr' ? "Fonctions d'appel" : 'Calling features'} />
      <p style={{ fontSize: font.sm, color: colors.mutedSilver, margin: '4px 0 14px', lineHeight: 1.55 }}>
        {lang === 'fr'
          ? "Touchez une tuile pour voir son fonctionnement. Les tuiles lumineuses sont disponibles maintenant."
          : 'Tap any tile to see how it works. Glowing tiles are available right now.'}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {FEATURES.map((f) => {
          const enabled = isEnabled(f.availability);
          const accent = toneAccent(f.tone);
          return (
            <button
              key={f.key}
              onClick={() => setOpen(f)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 6, padding: '14px 8px',
                borderRadius: radius.lg,
                background: enabled
                  ? `linear-gradient(155deg, ${accent}22 0%, rgba(255,255,255,0.04) 100%)`
                  : gradients.card,
                border: `1px solid ${enabled ? accent + '66' : colors.border}`,
                color: colors.textIce,
                cursor: 'pointer',
                opacity: enabled ? 1 : 0.55,
                boxShadow: enabled ? `0 12px 28px -18px ${accent}` : shadow.glass,
                transition: 'transform .15s ease, box-shadow .15s ease, opacity .15s ease',
              }}
            >
              <span style={{
                width: 42, height: 42, borderRadius: '50%',
                background: enabled ? `${accent}24` : 'rgba(255,255,255,0.04)',
                border: `1px solid ${enabled ? accent : colors.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, color: enabled ? accent : colors.mutedSilver,
              }}>{f.icon}</span>
              <span style={{ fontSize: 11, fontWeight: 700, textAlign: 'center', letterSpacing: 0.2 }}>{f.label[lang]}</span>
            </button>
          );
        })}
      </div>

      {open && (
        <div onClick={() => setOpen(null)} style={{
          position: 'fixed', inset: 0, zIndex: 70,
          background: 'rgba(6,12,28,0.72)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          padding: 12, paddingBottom: 'calc(20px + var(--safe-bottom))',
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: '100%', maxWidth: 520,
            padding: 18, borderRadius: radius.xl,
            background: `linear-gradient(155deg, ${toneAccent(open.tone)}18 0%, rgba(14,27,61,0.96) 100%)`,
            border: `1px solid ${toneAccent(open.tone)}55`,
            boxShadow: shadow.lift, color: colors.textIce,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span style={{
                width: 48, height: 48, borderRadius: '50%',
                background: `${toneAccent(open.tone)}26`,
                border: `1px solid ${toneAccent(open.tone)}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24, color: toneAccent(open.tone),
              }}>{open.icon}</span>
              <div>
                <div style={{ fontSize: font.md, fontWeight: 800 }}>{open.label[lang]}</div>
                <div style={{ fontSize: 10.5, color: badgeFor(open.availability, lang).color, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>
                  {badgeFor(open.availability, lang).label}
                </div>
              </div>
            </div>
            <p style={{ fontSize: font.sm, color: colors.textSub, lineHeight: 1.55, margin: '8px 0 14px' }}>
              {open.description[lang]}
            </p>
            <button onClick={() => setOpen(null)} style={{
              width: '100%', padding: '12px 14px', borderRadius: radius.md, border: 'none',
              background: gradients.shinyPrimary, color: '#fff', fontWeight: 800, letterSpacing: 0.4,
              cursor: 'pointer',
            }}>{lang === 'fr' ? 'Compris' : 'Got it'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
