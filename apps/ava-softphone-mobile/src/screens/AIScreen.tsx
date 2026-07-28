import React, { useState } from 'react';
import { colors, font, radius, gradients } from '../lib/theme';
import { mobileApi } from '../lib/mobileApi';
import { Card, Chip, AIPanel, SectionTitle, PrimaryButton, GhostButton } from '../components/ui/Primitives';
import { AvaBadge } from '../components/Brand';
import { useT } from '../lib/i18n';

type Module = 'intelligence' | 'actions' | 'greetings' | 'queues' | 'agents';

export default function AIScreen() {
  const { tx } = useT();
  const [active, setActive] = useState<Module>('intelligence');

  const MODULES: { id: Module; label: string; tone: 'violet' | 'cyan' | 'gold' | 'success' | 'danger' }[] = [
    { id: 'intelligence', label: tx('Intelligence des appels', 'Call intelligence'), tone: 'violet' },
    { id: 'actions',      label: tx('Centre des actions', 'Action center'),         tone: 'cyan' },
    { id: 'greetings',    label: tx('Studio de messages', 'Greetings studio'),       tone: 'gold' },
    { id: 'queues',       label: tx('Constructeur de files', 'Queue builder'),       tone: 'success' },
    { id: 'agents',       label: tx('Agents vocaux', 'Voice agents'),                tone: 'danger' },
  ];

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '14px 14px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.8, color: colors.avaViolet, textTransform: 'uppercase' }}>AVA AI</span>
        <AvaBadge compact />
      </div>
      <h1 style={{ fontSize: font.xxl, color: colors.textIce, margin: '0 0 6px', fontWeight: 800, letterSpacing: -0.3 }}>{tx('Espace IA', 'AI space')}</h1>
      <p style={{ fontSize: font.sm, color: colors.mutedSilver, margin: 0, lineHeight: 1.5 }}>
        {tx("Intelligence, automatisation et contrôle des agents vocaux pour vos communications d'affaires.", 'Intelligence, automation and voice-agent control for your business communications.')}
      </p>

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '16px -14px 14px', padding: '0 14px' }}>
        {MODULES.map((m) => {
          const c = m.tone === 'violet' ? colors.avaViolet : m.tone === 'cyan' ? colors.avaCyan : m.tone === 'gold' ? colors.signalGold : m.tone === 'success' ? colors.success : colors.danger;
          const on = active === m.id;
          return (
            <button key={m.id} onClick={() => setActive(m.id)} style={{
              flexShrink: 0, padding: '8px 14px', borderRadius: 999,
              background: on ? `${c}1c` : 'transparent',
              border: `1px solid ${on ? c + '88' : colors.border}`,
              color: on ? c : colors.mutedSilver,
              fontSize: 11, fontWeight: 800, letterSpacing: 0.8, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>{m.label}</button>
          );
        })}
      </div>

      {active === 'intelligence' && <Intelligence />}
      {active === 'actions' && <Actions />}
      {active === 'greetings' && <Greetings />}
      {active === 'queues' && <Queues />}
      {active === 'agents' && <Agents />}

      <div style={{ height: 80 }} />
    </div>
  );
}

function Intelligence() {
  const { tx } = useT();
  const rows = [
    { who: 'Marie Tremblay', score: 87, sent: tx('Positif','Positive'), topic: tx('Renouvellement','Renewal') },
    { who: 'Acme Corp',      score: 64, sent: tx('Neutre','Neutral'),   topic: tx('Report','Postponement') },
    { who: 'Vincent K.',     score: 41, sent: tx('Négatif','Negative'), topic: tx('Plainte','Complaint') },
  ];
  return (
    <AIPanel title={tx('Derniers appels analysés','Latest analyzed calls')} accent={colors.avaViolet}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${colors.border}` }}>
          <div>
            <div style={{ fontSize: font.base, fontWeight: 700, color: colors.textIce }}>{r.who}</div>
            <div style={{ fontSize: font.xs, color: colors.mutedSilver }}>{r.topic} · {r.sent}</div>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: r.score > 70 ? colors.success : r.score > 50 ? colors.warning : colors.danger, fontFamily: 'JetBrains Mono, monospace' }}>{r.score}</div>
        </div>
      ))}
    </AIPanel>
  );
}

function Actions() {
  const { tx } = useT();
  const items = [
    { who: 'Marie Tremblay', task: tx('Envoyer le PDF des tarifs','Send the pricing PDF'), due: tx("Aujourd'hui",'Today') },
    { who: 'Acme Corp',      task: tx('Reporter la démo à jeudi','Reschedule demo to Thursday'), due: tx('Demain','Tomorrow') },
    { who: 'Sophie B.',      task: tx("Faire un suivi sur l'onboarding",'Follow up on onboarding'), due: tx('+3 jours','+3 days') },
  ];
  return (
    <AIPanel title={tx('Tâches à faire','Tasks to do')} accent={colors.avaCyan}>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i === items.length - 1 ? 'none' : `1px solid ${colors.border}` }}>
          <span style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${colors.avaCyan}` }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: font.base, fontWeight: 600, color: colors.textIce }}>{it.task}</div>
            <div style={{ fontSize: font.xs, color: colors.mutedSilver }}>{it.who} · {it.due}</div>
          </div>
        </div>
      ))}
    </AIPanel>
  );
}

function Greetings() {
  const { tx } = useT();
  const [prompt, setPrompt] = useState(tx("Message d'accueil convivial hors heures pour notre ligne ventes",'Friendly after-hours greeting for our sales line'));
  const [out, setOut] = useState('');
  const [busy, setBusy] = useState(false);
  const gen = async () => {
    setBusy(true);
    const r = await mobileApi.generateGreeting(prompt);
    setOut(r.text); setBusy(false);
  };
  return (
    <Card padded={true} accent="gold">
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, color: colors.signalGold, textTransform: 'uppercase', marginBottom: 8 }}>{tx('Studio de messages','Greetings studio')}</div>
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} style={{
        width: '100%', boxSizing: 'border-box', padding: 12, borderRadius: 12,
        background: colors.midnight2, border: `1px solid ${colors.border}`,
        color: colors.textIce, fontSize: font.base, resize: 'vertical', fontFamily: 'inherit', outline: 'none',
      }} />
      <PrimaryButton onClick={gen} disabled={busy} style={{ marginTop: 10, width: '100%' }}>
        {busy ? tx('Génération…','Generating…') : tx('✨ Générer avec AVA','✨ Generate with AVA')}
      </PrimaryButton>
      {out && (
        <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: colors.midnight2, border: `1px solid ${colors.borderAI}` }}>
          <div style={{ fontSize: 10, color: colors.avaCyan, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 6 }}>{tx('Script généré','Generated script')}</div>
          <p style={{ fontSize: font.base, color: colors.textIce, lineHeight: 1.55, margin: 0 }}>{out}</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <GhostButton tone="gold">{tx('🎙 Synthétiser','🎙 Synthesize')}</GhostButton>
            <GhostButton tone="cyan">{tx('Enregistrer comme SVI','Save as IVR')}</GhostButton>
          </div>
        </div>
      )}
    </Card>
  );
}

function Queues() {
  const { tx } = useT();
  const rows = [
    { q: tx('Ventes','Sales'),        wait: '42s',     sla: 88, rec: tx('Ajouter 1 agent 13:00–15:00 — abandon +12 %','Add 1 agent 1–3pm — abandonment +12%') },
    { q: tx('Support','Support'),       wait: '1m 18s',  sla: 71, rec: tx("Passer au routage 'plus longtemps inactif' — réduit l'attente d'environ 22 %", "Switch to 'longest idle' routing — reduces wait by ~22%") },
    { q: tx('Hors heures','After hours'),   wait: '—',       sla: 0,  rec: tx('Activer un agent vocal AVA pour la capture de rappel','Enable an AVA voice agent for callback capture') },
  ];
  return (
    <AIPanel title={tx('Recommandations de files','Queue recommendations')} accent={colors.success}>
      {rows.map((r, i) => (
        <div key={i} style={{ padding: '10px 0', borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${colors.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: font.base, fontWeight: 700, color: colors.textIce }}>{r.q}</span>
            <span style={{ fontSize: font.xs, color: colors.mutedSilver, fontFamily: 'JetBrains Mono, monospace' }}>{r.wait} · SLA {r.sla}%</span>
          </div>
          <div style={{ fontSize: font.sm, color: colors.success, marginTop: 4 }}>↳ {r.rec}</div>
        </div>
      ))}
    </AIPanel>
  );
}

function Agents() {
  const { tx } = useT();
  const agents = [
    { name: tx('Réception AVA','AVA reception'),          voice: 'ElevenLabs · Rachel', assigned: ['+1 514 555 0100', tx('SVI → 0','IVR → 0')] },
    { name: tx('Repli hors heures','After-hours fallback'),       voice: 'ElevenLabs · Adam',   assigned: [tx('Débordement de file > 60s','Queue overflow > 60s')] },
    { name: tx('Ligne espagnole','Spanish line'),         voice: 'ElevenLabs · Mateo',  assigned: ['+1 514 555 0144'] },
  ];
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 4px 10px' }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.5, color: colors.danger, textTransform: 'uppercase' }}>{tx('Agents vocaux actifs','Active voice agents')}</div>
        <GhostButton tone="violet" style={{ padding: '6px 10px' }}>{tx('+ Nouveau','+ New')}</GhostButton>
      </div>
      {agents.map((a, i) => (
        <Card key={i} style={{ marginBottom: 8 }} accent={i === 0 ? 'violet' : undefined}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ fontSize: font.base, fontWeight: 700, color: colors.textIce }}>{a.name}</div>
            <span style={{ fontSize: font.xs, color: colors.mutedSilver }}>{a.voice}</span>
          </div>
          <div style={{ fontSize: font.sm, color: colors.avaCyan, marginTop: 6, fontFamily: 'JetBrains Mono, monospace' }}>{a.assigned.join(' · ')}</div>
        </Card>
      ))}
    </>
  );
}
