import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ImpactStyle } from '@capacitor/haptics';
import { Search, RefreshCw, Voicemail as VmIcon } from 'lucide-react';
import { colors, font, radius, gradients } from '../lib/theme';
import { mobileApi, VoicemailEntry } from '../lib/mobileApi';
import { Card, Chip, EmptyState, GhostButton, AIPanel, Skeleton } from '../components/ui/Primitives';
import { audit } from '../lib/audit';
import { useMobileCredentials } from '../hooks/useMobileCredentials';
import { authedRealtime, edgeCall } from '../lib/mobileSupabase';
import { useTr } from '../lib/i18n';

export default function VoicemailScreen({ haptic }: { haptic?: (s?: ImpactStyle) => Promise<void> }) {
  const { tr } = useTr();

  const mobile = useMobileCredentials();
  const [items, setItems] = useState<VoicemailEntry[] | null>(null);
  const [q, setQ] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ id: string; cur: number; dur: number } | null>(null);
  const [transcripts, setTranscripts] = useState<Record<string, string>>({});
  const [analyses, setAnalyses] = useState<Record<string, { summary?: string; sentiment?: string; topics?: string[]; action_items?: string[] }>>({});
  const [transcribing, setTranscribing] = useState<string | null>(null);
  const [transcribeError, setTranscribeError] = useState<Record<string, string>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlCache = useRef<Map<string, string>>(new Map());
  const [voices, setVoices] = useState<{ id: string; name: string }[]>([]);
  const [greetingText, setGreetingText] = useState('');
  const [voiceId, setVoiceId] = useState('EXAVITQu4vr4xnSDxMaL');
  const [greetingBusy, setGreetingBusy] = useState(false);
  const [greetingMsg, setGreetingMsg] = useState<string | null>(null);
  const [greetingPreviewUrl, setGreetingPreviewUrl] = useState<string | null>(null);

  const reload = async () => {
    setRefreshing(true);
    try { setItems(await mobileApi.voicemails()); } catch {}
    setRefreshing(false);
  };

  useEffect(() => { reload(); }, []);
  useEffect(() => () => { audioRef.current?.pause(); audioRef.current = null; }, []);

  useEffect(() => {
    if (!mobile.accessToken) return;
    edgeCall<any>('user-voicemail-greeting', mobile.accessToken, { action: 'get_settings', payload: {} })
      .then((r) => {
        setVoices(r.voices || []);
        setGreetingText(r.settings?.greeting_tts_text || '');
        setVoiceId(r.settings?.greeting_voice_id || 'EXAVITQu4vr4xnSDxMaL');
        setGreetingPreviewUrl(r.settings?.greeting_audio_url || null);
      })
      .catch(() => {});
  }, [mobile.accessToken]);

  const saveGreeting = async () => {
    if (!mobile.accessToken || !greetingText.trim()) return;
    setGreetingBusy(true); setGreetingMsg(null);
    try {
      const created = await edgeCall<any>('user-voicemail-greeting', mobile.accessToken, {
        action: 'create_greeting',
        payload: { name: `Mobile greeting ${new Date().toLocaleDateString()}`, text: greetingText.trim(), voice_id: voiceId, extension: mobile.extension },
      });
      const id = created?.greeting?.id;
      const activated = id ? await edgeCall<any>('user-voicemail-greeting', mobile.accessToken, { action: 'activate_greeting', payload: { id } }) : null;
      const storagePath = created?.greeting?.storage_path || null;
      const audioUrl = activated?.audio_url || created?.greeting?.audio_url || null;
      await edgeCall<any>('user-voicemail-greeting', mobile.accessToken, {
        action: 'save_settings',
        payload: { greeting_type: 'tts', greeting_tts_text: greetingText.trim(), greeting_voice_id: voiceId, greeting_voice_name: voices.find((v) => v.id === voiceId)?.name || null, greeting_storage_path: storagePath, greeting_audio_url: audioUrl, transcription_enabled: true, ai_summary_enabled: true },
      });
      setGreetingPreviewUrl(audioUrl);
      setGreetingMsg('Greeting updated with ElevenLabs voice.');
    } catch (e: any) {
      setGreetingMsg(e?.message || 'Greeting update failed');
    } finally { setGreetingBusy(false); }
  };

  // Realtime: refresh list on any change to pbx_voicemails for this domain/extension.
  useEffect(() => {
    let channel: any = null;
    let cancelled = false;
    (async () => {
      if (!mobile.accessToken) return;
      const client = authedRealtime(mobile.accessToken);
      const domainUuid = mobile.domainUuid;
      const filter = domainUuid ? `domain_uuid=eq.${domainUuid}` : undefined;
      channel = client
        .channel('vm-mobile')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pbx_voicemails', ...(filter ? { filter } : {}) } as any,
          () => { if (!cancelled) reload(); })
        .subscribe();
    })();
    return () => { cancelled = true; try { channel && authedRealtime(mobile.accessToken).removeChannel(channel); } catch {} };
  }, [mobile.accessToken, mobile.domainUuid]);


  const fmt = (s: number) => {
    if (!Number.isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60); const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const transcribe = async (v: VoicemailEntry, force = false) => {
    if (!force && (transcripts[v.id] || transcribing === v.id)) return;
    setTranscribing(v.id);
    setTranscribeError((p) => { const n = { ...p }; delete n[v.id]; return n; });
    try {
      let txt: string | null = null;
      let analysis: any = null;
      try {
        const d: any = await mobileApi.analyzeCall(v.id);
        txt = d?.transcript || d?.transcript_text || null;
        analysis = d?.analysis || d?.summary ? { summary: d?.summary, sentiment: d?.sentiment, topics: d?.topics, action_items: d?.action_items, ...(d?.analysis || {}) } : null;
      } catch {}
      if (!txt) {
        setTranscribeError((p) => ({ ...p, [v.id]: 'No authenticated transcript is available for this voicemail yet.' }));
      }
      if (txt) setTranscripts((p) => ({ ...p, [v.id]: txt! }));
      else if (!transcribeError[v.id]) setTranscribeError((p) => ({ ...p, [v.id]: 'No transcript returned' }));
      if (analysis) setAnalyses((p) => ({ ...p, [v.id]: analysis }));
    } finally {
      setTranscribing(null);
    }
  };

  const fetchUrl = async (v: VoicemailEntry): Promise<string> => {
    const res = await mobileApi
      .voicemailAudio({
        xml_cdr_uuid: v.xml_cdr_uuid,
        record_path: v.record_path,
        record_name: v.record_name,
        domain_uuid: v.domain_uuid,
        domain_name: v.domain_name,
        organization_id: v.organization_id,
      })
      .catch(() => ({ url: '' } as any));
    return res?.url || '';
  };

  const togglePlay = async (v: VoicemailEntry) => {
    const id = v.id;
    setErrorId(null);
    if (playing === id) { audioRef.current?.pause(); setPlaying(null); return; }
    audioRef.current?.pause();

    let url = urlCache.current.get(id) || '';
    if (!url) {
      setLoadingId(id);
      url = await fetchUrl(v);
      setLoadingId(null);
      if (url) urlCache.current.set(id, url);
    }
    if (!url) { setErrorId(id); return; }

    const audio = new Audio(url);
    audio.ontimeupdate = () => setProgress({ id, cur: audio.currentTime, dur: audio.duration || v.durationSec });
    audio.onloadedmetadata = () => setProgress({ id, cur: 0, dur: audio.duration || v.durationSec });
    audio.onended = () => { setPlaying(null); transcribe(v); };
    audio.onerror = () => { setErrorId(id); setPlaying(null); };
    audioRef.current = audio;
    setPlaying(id);
    audit('voicemail.played', id, { duration: v.durationSec });
    audio.play().catch(() => { setErrorId(id); setPlaying(null); });
  };

  const retry = async (v: VoicemailEntry) => {
    urlCache.current.delete(v.id);
    setErrorId(null);
    await new Promise((r) => setTimeout(r, 3000));
    togglePlay(v);
  };

  const onSeek = (e: React.MouseEvent<HTMLDivElement>, v: VoicemailEntry) => {
    if (!audioRef.current || playing !== v.id) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const dur = audioRef.current.duration || v.durationSec;
    audioRef.current.currentTime = Math.max(0, Math.min(dur, pct * dur));
  };

  const filtered = useMemo(() => {
    if (!items) return null;
    const k = q.trim().toLowerCase();
    if (!k) return items;
    return items.filter((v) =>
      (v.customer || '').toLowerCase().includes(k) ||
      (v.from || '').toLowerCase().includes(k) ||
      (v.transcript || '').toLowerCase().includes(k) ||
      (v.summary || '').toLowerCase().includes(k)
    );
  }, [items, q]);

  const Header = (
    <div style={{ padding: '12px 14px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={15} color={colors.mutedSilver} style={{ position: 'absolute', top: '50%', left: 12, transform: 'translateY(-50%)' }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tr.voicemail.search}
            style={{
              width: '100%', height: 40, padding: '0 14px 0 34px', borderRadius: radius.lg,
              background: 'rgba(255,255,255,0.06)', border: `1px solid ${colors.border}`,
              color: colors.textIce, fontSize: 13, outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
        <button onClick={reload} disabled={refreshing} aria-label={tr.common.refresh} style={{
          width: 40, height: 40, borderRadius: radius.lg, border: `1px solid ${colors.border}`,
          background: 'rgba(255,255,255,0.05)', color: colors.lemtelBlue, cursor: 'pointer',
          display: 'grid', placeItems: 'center', opacity: refreshing ? 0.6 : 1,
        }}>
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>
      <div style={{ fontSize: 11, color: colors.mutedSilver, padding: '0 4px' }}>
        {items ? tr.voicemail.countLine.replace('{shown}', String(filtered?.length ?? 0)).replace('{total}', String(items.length)) : tr.common.loading}
      </div>
    </div>
  );


  const GreetingEditor = (
    <div style={{ padding: '0 14px 12px' }}>
      <Card accent="violet">
        <div style={{ fontSize: 11, color: colors.avaCyan, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>ElevenLabs greeting</div>
        <textarea value={greetingText} onChange={(e) => setGreetingText(e.target.value)} placeholder="Type your voicemail greeting…" rows={3} style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: radius.md, background: colors.graphite, border: `1px solid ${colors.border}`, color: colors.textIce, fontSize: font.sm, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)} style={{ flex: 1, padding: '8px 10px', borderRadius: radius.md, background: colors.graphite, border: `1px solid ${colors.border}`, color: colors.textIce, fontSize: font.sm }}>
            {(voices.length ? voices : [{ id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah' }]).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <button onClick={saveGreeting} disabled={greetingBusy || !greetingText.trim()} style={{ padding: '8px 12px', borderRadius: radius.md, border: 'none', background: greetingText.trim() ? gradients.call : 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12, fontWeight: 800, cursor: greetingBusy ? 'default' : 'pointer' }}>{greetingBusy ? '…' : 'Save'}</button>
        </div>
        {greetingPreviewUrl && <audio controls src={greetingPreviewUrl} style={{ width: '100%', marginTop: 10 }} />}
        {greetingMsg && <div style={{ marginTop: 8, fontSize: 11, color: greetingMsg.includes('failed') ? colors.danger : colors.success }}>{greetingMsg}</div>}
      </Card>
    </div>
  );

  if (!items) {
    return (
      <div>
        {Header}
        {GreetingEditor}
        <div style={{ padding: 14 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ padding: 14, marginBottom: 8, borderRadius: radius.lg, background: gradients.card, border: `1px solid ${colors.border}` }}>
              <Skeleton w="55%" h={12} /><div style={{ height: 6 }} /><Skeleton w="80%" h={10} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!filtered || filtered.length === 0) {
    return (
      <div>
        {Header}
        {GreetingEditor}
        <div style={{ padding: 14 }}>
          <EmptyState
            icon={<VmIcon size={28} />}
            title={q ? 'No matching voicemails' : 'No voicemails'}
            hint={q ? 'Try a different search term.' : 'When callers leave a message, AVA will transcribe and summarize it here.'}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      {Header}
      {GreetingEditor}
      <div style={{ padding: '0 14px 24px' }}>
      {filtered.map((v) => {
        const isOpen = openId === v.id;
        const isPlaying = playing === v.id;
        const p = progress?.id === v.id ? progress : null;
        const dur = p?.dur || v.durationSec;
        const cur = p?.cur || 0;
        const pct = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0;
        const liveTranscript = transcripts[v.id];
        return (
          <Card key={v.id} style={{ marginBottom: 10 }} accent={v.priority === 'high' ? 'gold' : undefined}>
            <button onClick={() => { haptic?.(); setOpenId(isOpen ? null : v.id); }} style={{
              all: 'unset', display: 'flex', alignItems: 'center', gap: 12, width: '100%', cursor: 'pointer', padding: 2,
            }}>
              <span style={{
                width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                background: v.isNew ? gradients.call : 'rgba(255,255,255,0.06)',
                border: `1px solid ${v.isNew ? colors.signalGold : colors.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, color: colors.textIce,
              }}>🎙</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: font.base, fontWeight: 700, color: colors.textIce }}>{v.customer || v.from}</span>
                  {v.isNew && <Chip tone="gold" size="xs">NEW</Chip>}
                  {v.priority === 'high' && <Chip tone="danger" size="xs">HIGH</Chip>}
                </div>
                <div style={{ fontSize: font.xs, color: colors.mutedSilver, marginTop: 2, fontFamily: 'JetBrains Mono, monospace' }}>
                  {v.from} · {fmt(v.durationSec)} · {new Date(v.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <span style={{ color: colors.mutedSilver, fontSize: 14 }}>{isOpen ? '▾' : '▸'}</span>
            </button>

            {isOpen && (
              <div style={{ marginTop: 12 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: 10, borderRadius: radius.md,
                  background: colors.midnight2, border: `1px solid ${colors.border}`,
                }}>
                  <button onClick={() => { haptic?.(ImpactStyle.Medium); togglePlay(v); }} disabled={loadingId === v.id} style={{
                    width: 38, height: 38, borderRadius: '50%', border: 'none',
                    background: gradients.call, color: '#fff', fontSize: 16, cursor: 'pointer',
                    opacity: loadingId === v.id ? 0.6 : 1,
                  }}>{loadingId === v.id ? '…' : isPlaying ? '⏸' : '▶'}</button>
                  <div onClick={(e) => onSeek(e, v)} style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', position: 'relative', overflow: 'hidden', cursor: 'pointer' }}>
                    <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: gradients.call, transition: 'width 0.15s linear' }} />
                  </div>
                  <span style={{ fontSize: 11, color: colors.mutedSilver, fontFamily: 'JetBrains Mono, monospace', minWidth: 78, textAlign: 'right' }}>
                    {fmt(cur)} / {fmt(dur)}
                  </span>
                </div>
                {errorId === v.id && (
                  <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: 'rgba(255,80,80,0.08)', border: `1px solid rgba(255,80,80,0.3)`, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, fontSize: 11, color: colors.danger }}>
                      Audio not available — recording may have been deleted from PBX.
                    </div>
                    <button onClick={() => retry(v)} style={{
                      padding: '6px 10px', borderRadius: 6, border: `1px solid ${colors.danger}`,
                      background: 'transparent', color: colors.danger, fontSize: 11, cursor: 'pointer', fontWeight: 700,
                    }}>Retry</button>
                  </div>
                )}

                <div style={{ marginTop: 10 }}>
                  <AIPanel title="AVA summary" accent={colors.avaViolet}>
                  <div style={{ fontSize: font.sm, color: colors.textIce, lineHeight: 1.5 }}>{analyses[v.id]?.summary || v.summary}</div>
                  {analyses[v.id]?.sentiment && (
                    <div style={{ marginTop: 6, fontSize: 11, color: colors.mutedSilver }}>Sentiment: <span style={{ color: colors.avaCyan }}>{analyses[v.id]!.sentiment}</span></div>
                  )}
                  {analyses[v.id]?.topics?.length ? (
                    <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {analyses[v.id]!.topics!.map((t, i) => <Chip key={i} tone="violet" size="xs">{t}</Chip>)}
                    </div>
                  ) : null}
                  {analyses[v.id]?.action_items?.length ? (
                    <div style={{ marginTop: 8, fontSize: 11, color: colors.textSub }}>
                      <div style={{ fontWeight: 700, color: colors.signalGold, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Action items</div>
                      {analyses[v.id]!.action_items!.map((a, i) => <div key={i}>• {a}</div>)}
                    </div>
                  ) : null}
                  <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: `1px solid ${colors.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <div style={{ fontSize: 10, color: colors.avaCyan, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                        Transcript {transcribing === v.id && '· transcribing…'}
                      </div>
                      {(transcribeError[v.id] || (!liveTranscript && !v.transcript)) && transcribing !== v.id && (
                        <button onClick={() => transcribe(v, true)} style={{
                          padding: '4px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                          background: 'transparent', border: `1px solid ${colors.avaCyan}`, color: colors.avaCyan,
                        }}>↻ Retry transcription</button>
                      )}
                    </div>
                    {transcribeError[v.id] && (
                      <div style={{ fontSize: 11, color: colors.danger, marginBottom: 6 }}>⚠ {transcribeError[v.id]}</div>
                    )}
                    <div style={{ fontSize: font.sm, color: colors.textSub, lineHeight: 1.5 }}>
                      {liveTranscript || v.transcript || (transcribing === v.id ? '…' : '(no transcript yet)')}
                    </div>
                  </div>
                  </AIPanel>
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <GhostButton tone="cyan" onClick={() => haptic?.(ImpactStyle.Medium)}>📞 Call back</GhostButton>
                  <GhostButton tone="violet" onClick={() => haptic?.()}>💬 SMS</GhostButton>
                  <GhostButton tone="gold" onClick={() => haptic?.()}>✓ Done</GhostButton>
                </div>
              </div>
            )}
          </Card>
        );
      })}
      </div>
    </div>
  );
}
