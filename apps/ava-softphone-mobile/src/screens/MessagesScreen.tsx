import React, { useEffect, useMemo, useState } from 'react';
import { ImpactStyle } from '@capacitor/haptics';
import { Search } from 'lucide-react';
import { colors, font, radius, gradients } from '../lib/theme';
import { mobileApi, SmsThread, SmsMessage } from '../lib/mobileApi';
import { Card, Chip, EmptyState, GhostButton, SectionTitle, Skeleton } from '../components/ui/Primitives';
import { audit } from '../lib/audit';
import { useMobileCredentials } from '../hooks/useMobileCredentials';
import { authedRealtime } from '../lib/mobileSupabase';

export default function MessagesScreen({ haptic }: { haptic: (s?: ImpactStyle) => Promise<void> }) {
  const mobile = useMobileCredentials();
  const [threads, setThreads] = useState<SmsThread[] | null>(null);
  const [active, setActive] = useState<SmsThread | null>(null);
  const [msgs, setMsgs] = useState<SmsMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [q, setQ] = useState('');

  const loadThreads = async () => { try { setThreads(await mobileApi.threads()); } catch {} };
  const loadMsgs = async (id: string) => { try { setMsgs(await mobileApi.thread(id)); } catch {} };

  useEffect(() => { loadThreads(); }, []);
  useEffect(() => { if (active) loadMsgs(active.id); }, [active?.id]);

  // Realtime threads (org-wide)
  useEffect(() => {
    let channel: any = null;
    let cancelled = false;
    (async () => {
      if (!mobile.accessToken) return;
      const orgId = mobile.organizationId;
      const filter = orgId ? `organization_id=eq.${orgId}` : undefined;
      const client = authedRealtime(mobile.accessToken);
      channel = client.channel('sms-threads-mobile')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pbx_sms_threads', ...(filter ? { filter } : {}) } as any,
          () => { if (!cancelled) loadThreads(); })
        .subscribe();
    })();
    return () => { cancelled = true; try { channel && authedRealtime(mobile.accessToken).removeChannel(channel); } catch {} };
  }, [mobile.accessToken, mobile.organizationId]);

  // Realtime messages for active thread
  useEffect(() => {
    if (!active) return;
    let channel: any = null;
    let cancelled = false;
    (async () => {
      if (!mobile.accessToken) return;
      const client = authedRealtime(mobile.accessToken);
      channel = client.channel(`sms-msgs-${active.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pbx_sms_messages', filter: `thread_id=eq.${active.id}` } as any,
          () => { if (!cancelled) loadMsgs(active.id); })
        .subscribe();
    })();
    return () => { cancelled = true; try { channel && authedRealtime(mobile.accessToken).removeChannel(channel); } catch {} };
  }, [active?.id, mobile.accessToken]);

  const send = async () => {
    if (!draft.trim() || !active) return;
    const m: SmsMessage = { id: 'm' + Date.now(), from: 'me', body: draft, at: 'now' };
    setMsgs((p) => [...p, m]);
    setDraft('');
    haptic(ImpactStyle.Light);
    await mobileApi.sendMessage(active.id, m.body);
    audit('sms.sent', active.id, { len: m.body.length });
  };

  const filteredThreads = useMemo(() => {
    if (!threads) return threads;
    const t = q.trim().toLowerCase();
    if (!t) return threads;
    return threads.filter((x) => (x.contact || '').toLowerCase().includes(t) || (x.number || '').includes(t) || (x.lastMessage || '').toLowerCase().includes(t));
  }, [threads, q]);

  const aiAction = async (action: 'rewrite' | 'professional' | 'shorten' | 'translate') => {
    if (!draft.trim()) return;
    setAiBusy(true);
    const r = await mobileApi.aiRewrite(draft, action);
    setDraft(r.text);
    setAiBusy(false);
  };

  if (active) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <header style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 14px', borderBottom: `1px solid ${colors.border}`,
          background: gradients.hero,
        }}>
          <button onClick={() => setActive(null)} style={{
            background: 'rgba(255,255,255,0.04)', border: `1px solid ${colors.border}`,
            borderRadius: 999, padding: '6px 10px', color: colors.textIce, fontSize: 12, cursor: 'pointer',
          }}>←</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: font.md, fontWeight: 700, color: colors.textIce }}>{active.contact}</div>
            <div style={{ fontSize: font.xs, color: colors.mutedSilver, fontFamily: 'JetBrains Mono, monospace' }}>{active.number}</div>
          </div>
          <Chip tone="cyan">SMS</Chip>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {msgs.map((m) => (
            <div key={m.id} style={{
              alignSelf: m.from === 'me' ? 'flex-end' : 'flex-start',
              maxWidth: '78%',
              padding: '10px 13px',
              borderRadius: 16,
              background: m.from === 'me' ? gradients.call : colors.graphite2,
              color: colors.textIce,
              fontSize: font.base, lineHeight: 1.5,
              borderBottomRightRadius: m.from === 'me' ? 4 : 16,
              borderBottomLeftRadius:  m.from === 'me' ? 16 : 4,
            }}>
              {m.body}
              <div style={{ fontSize: 9.5, color: m.from === 'me' ? 'rgba(255,255,255,0.65)' : colors.mutedSilver, marginTop: 4, textAlign: 'right' }}>{m.at}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: '10px 12px 14px', borderTop: `1px solid ${colors.border}`, background: colors.midnight2 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, overflowX: 'auto', paddingBottom: 4 }}>
            <AIBtn label="✨ Réécrire" tone="violet" onClick={() => aiAction('rewrite')} disabled={aiBusy} />
            <AIBtn label="Professionnel" tone="cyan" onClick={() => aiAction('professional')} disabled={aiBusy} />
            <AIBtn label="Raccourcir" tone="gold" onClick={() => aiAction('shorten')} disabled={aiBusy} />
            <AIBtn label="Traduire EN" tone="neutral" onClick={() => aiAction('translate')} disabled={aiBusy} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Message…"
              rows={2}
              style={{
                flex: 1, padding: 10, borderRadius: radius.md,
                background: colors.graphite, border: `1px solid ${colors.border}`,
                color: colors.textIce, fontSize: font.base, resize: 'none', outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <button onClick={send} disabled={!draft.trim()} style={{
              padding: '0 18px', height: 44, borderRadius: radius.md, border: 'none',
              background: draft.trim() ? gradients.call : 'rgba(255,255,255,0.06)',
              color: '#fff', fontSize: font.base, fontWeight: 700, cursor: draft.trim() ? 'pointer' : 'not-allowed',
            }}>Envoyer</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '14px 14px 20px' }}>
      <SectionTitle eyebrow="Boîte de réception" title="Messages" right={threads ? <Chip tone="gold">{threads.length}</Chip> : null} />
      <div data-search-bar="true" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: `1px solid ${colors.border}`, margin: '0 0 10px' }}>
        <Search size={14} color={colors.mutedSilver} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une conversation…"
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: colors.textIce }} />
      </div>
      {!threads && (
        <div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ padding: 14, marginBottom: 8, borderRadius: radius.lg, background: gradients.card, border: `1px solid ${colors.border}` }}>
              <Skeleton w="50%" h={13} />
              <div style={{ height: 6 }} />
              <Skeleton w="80%" h={10} />
            </div>
          ))}
        </div>
      )}
      {threads && threads.length === 0 && (
        <EmptyState icon="✉" title="Aucun message" hint="Les nouvelles conversations SMS apparaîtront ici. Utilisez les modèles AVA pour démarrer une discussion." />
      )}
      {filteredThreads?.map((t) => (
        <button key={t.id} onClick={() => { haptic(); setActive(t); }} style={{
          display: 'flex', alignItems: 'center', gap: 12, width: '100%',
          padding: '14px', marginBottom: 8, borderRadius: radius.lg,
          background: gradients.card, border: `1px solid ${colors.border}`,
          color: colors.textIce, textAlign: 'left', cursor: 'pointer',
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 14, display: 'grid', placeItems: 'center',
            background: gradients.call, color: '#fff', fontSize: 14, fontWeight: 800,
          }}>{t.contact.split(' ').map((s) => s[0]).slice(0, 2).join('')}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: font.base, fontWeight: 700, color: colors.textIce, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.contact}</span>
              <span style={{ fontSize: font.xs, color: colors.mutedSilver }}>{t.updatedAt}</span>
            </div>
            <div style={{ fontSize: font.sm, color: colors.mutedSilver, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{t.lastMessage}</div>
          </div>
          {t.unread > 0 && (
            <span style={{
              minWidth: 22, height: 22, borderRadius: 11, padding: '0 7px',
              background: colors.signalGold, color: colors.midnight,
              fontSize: 11, fontWeight: 800, display: 'grid', placeItems: 'center',
            }}>{t.unread}</span>
          )}
        </button>
      ))}
      <div style={{ height: 80 }} />
    </div>
  );
}

function AIBtn({ label, tone, onClick, disabled }: { label: string; tone: 'violet' | 'cyan' | 'gold' | 'neutral'; onClick: () => void; disabled?: boolean }) {
  const c = tone === 'violet' ? colors.avaViolet : tone === 'cyan' ? colors.avaCyan : tone === 'gold' ? colors.signalGold : colors.mutedSilver;
  return (
    <button onClick={onClick} disabled={disabled} style={{
      flexShrink: 0,
      padding: '6px 12px', borderRadius: 999,
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${c}55`,
      color: c, fontSize: 11, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap',
    }}>{label}</button>
  );
}
