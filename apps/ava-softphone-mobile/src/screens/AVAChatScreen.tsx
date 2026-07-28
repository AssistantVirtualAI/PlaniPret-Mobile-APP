import React, { useEffect, useRef, useState } from 'react';
import { colors, font, gradients, radius, shadow } from '../lib/theme';
import { mobileApi } from '../lib/mobileApi';
import { useT } from '../lib/i18n';

type Msg = { id: string; role: 'user' | 'assistant'; text: string; pending?: boolean };

const SUGGESTIONS_FR = [
  "Combien d'appels avons-nous reçus aujourd'hui ?",
  'Qui a manqué le plus d\u2019appels cette semaine ?',
  'Résume le dernier appel de Quebec Auto',
  "Quelle file a le plus long temps d'attente ?",
];
const SUGGESTIONS_EN = [
  "How many calls did we receive today?",
  "Who missed the most calls this week?",
  "Summarize the latest call from Quebec Auto",
  "Which queue has the longest wait time?",
];

export default function AVAChatScreen() {
  const { tx, lang } = useT();
  const SUGGESTIONS = lang === 'fr' ? SUGGESTIONS_FR : SUGGESTIONS_EN;
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    // Keep the textarea focused (per chat-ui contract)
    taRef.current?.focus();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs]);

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    const userMsg: Msg = { id: 'u' + Date.now(), role: 'user', text };
    const placeholder: Msg = { id: 'a' + Date.now(), role: 'assistant', text: '', pending: true };
    setMsgs((m) => [...m, userMsg, placeholder]);
    setInput(''); setBusy(true);
    try {
      const reply = await mobileApi.chat(text, msgs.map((m) => ({ role: m.role, content: m.text })));
      setMsgs((m) => m.map((x) => x.id === placeholder.id ? { ...x, text: reply.answer || '…', pending: false } : x));
    } catch (e: any) {
      setMsgs((m) => m.map((x) => x.id === placeholder.id ? { ...x, text: `${tx('Désolé', 'Sorry')} — ${e.message || tx('AVA est indisponible.', 'AVA is unavailable.')}`, pending: false } : x));
    } finally {
      setBusy(false);
      setTimeout(() => taRef.current?.focus(), 50);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: gradients.app }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 38, height: 38, borderRadius: '50%', background: gradients.ai,
          display: 'grid', placeItems: 'center', fontSize: 18, color: '#fff', boxShadow: shadow.ai,
        }}>✦</div>
        <div>
          <div style={{ fontSize: font.lg, fontWeight: 800, color: colors.textIce, letterSpacing: -0.3 }}>AVA</div>
          <div style={{ fontSize: font.xs, color: colors.mutedSilver }}>{tx('Votre assistant téléphonique IA · données PBX en direct', 'Your AI phone assistant · live PBX data')}</div>
        </div>
      </div>

      {/* Transcript */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 14px 12px' }}>
        {msgs.length === 0 && (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: font.md, fontWeight: 700, color: colors.textIce, marginBottom: 8 }}>
              {tx("Posez n'importe quelle question à AVA sur votre système téléphonique.", 'Ask AVA anything about your phone system.')}
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} style={{
                  textAlign: 'left', padding: '12px 14px', borderRadius: radius.lg,
                  background: gradients.card, border: `1px solid ${colors.borderAI}`,
                  color: colors.textIce, fontSize: font.base, cursor: 'pointer',
                }}>
                  <span style={{ color: colors.avaViolet, marginRight: 8 }}>✦</span>{s}
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m) => (
          <div key={m.id} style={{
            display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
            marginBottom: 10,
          }}>
            <div style={{
              maxWidth: '82%',
              padding: m.role === 'user' ? '10px 14px' : '12px 14px',
              borderRadius: 16,
              background: m.role === 'user'
                ? `linear-gradient(135deg, ${colors.lemtelBlue}, ${colors.blueGlow})`
                : 'transparent',
              color: m.role === 'user' ? '#fff' : colors.textIce,
              fontSize: font.base, lineHeight: 1.5,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              border: m.role === 'assistant' ? `1px solid ${colors.border}` : 'none',
            }}>
              {m.pending ? <Shimmer /> : m.text}
            </div>
          </div>
        ))}
      </div>

      {/* Composer */}
      <div style={{
        padding: '8px 12px 12px',
        borderTop: `1px solid ${colors.border}`,
        background: 'rgba(255,255,255,0.7)',
        backdropFilter: 'blur(14px)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 8,
          background: '#fff', borderRadius: radius.xl,
          border: `1px solid ${colors.border}`,
          padding: 6, boxShadow: shadow.glass,
        }}>
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={tx('Message AVA…', 'Message AVA…')}
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            style={{
              flex: 1, resize: 'none', border: 'none', outline: 'none',
              padding: '10px 8px', fontSize: font.base, fontFamily: 'inherit',
              background: 'transparent', color: colors.textIce, maxHeight: 120,
            }}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || busy}
            aria-label={tx('Envoyer', 'Send')}
            style={{
              width: 38, height: 38, borderRadius: '50%',
              border: 'none', cursor: input.trim() && !busy ? 'pointer' : 'not-allowed',
              background: input.trim() && !busy ? gradients.ai : 'rgba(0,0,0,0.08)',
              color: '#fff', fontSize: 18, display: 'grid', placeItems: 'center',
              flexShrink: 0,
            }}
          >↑</button>
        </div>
      </div>
    </div>
  );
}

function Shimmer() {
  return (
    <span style={{
      display: 'inline-block', color: colors.mutedSilver, fontStyle: 'italic',
      animation: 'avaPulse 1.4s ease-in-out infinite',
    }}>
      Réflexion…
      <style>{`@keyframes avaPulse{0%,100%{opacity:.45}50%{opacity:1}}`}</style>
    </span>
  );
}
