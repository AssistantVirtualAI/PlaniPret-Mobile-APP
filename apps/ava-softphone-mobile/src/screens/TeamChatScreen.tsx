import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Circle, MessageCircle, Plus, Search, Send, Users } from 'lucide-react';
import { colors, radius } from '../lib/theme';
import { useMobileCredentials } from '../hooks/useMobileCredentials';
import { authedRealtime, edgeCall, restGet } from '../lib/mobileSupabase';

type Channel = { id: string; name: string; channel_type: string; members: string[] | null };
type Message = { id: string; channel_id: string; sender_id: string; sender_name: string | null; content: string; created_at: string };
type Member = { user_id: string; full_name: string | null; email: string | null; extension: string | null; status: string; is_self?: boolean };



const STATUS_COLOR: Record<string, string> = { online: '#22d39a', available: '#22d39a', busy: '#ff5a5f', dnd: '#ff5a5f', on_call: '#ff8a3d', away: '#f4c248', offline: '#6b7280', meeting: '#a855f7', lunch: '#eab308', break: '#f97316' };

export default function TeamChatScreen(props: { accessToken?: string | null; userId?: string; channelUnread?: Record<string, number> }) {
  const channelUnread = props.channelUnread || {};
  const mobile = useMobileCredentials();
  const token = mobile.accessToken;
  const userId = mobile.userId;
  const [view, setView] = useState<'channels' | 'members' | 'chat'>('channels');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [msgQuery, setMsgQuery] = useState('');
  const [showMsgSearch, setShowMsgSearch] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupPicks, setGroupPicks] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const chatCall = useCallback((action: string, payload: Record<string, unknown> = {}) => {
    if (!token) throw new Error('Not authenticated');
    return edgeCall<any>('org-chat', token, { action, payload });
  }, [token]);

  const loadMembers = useCallback(async () => {
    if (!token || (!mobile.domainUuid && !mobile.organizationId)) return [] as Member[];
    // Pull every softphone row for the user's domain AND/OR org (fallback for rows missing domain_uuid).
    const domainFilter = mobile.domainUuid ? `domain_uuid=eq.${encodeURIComponent(mobile.domainUuid)}` : null;
    const orgFilter = mobile.organizationId ? `organization_id=eq.${encodeURIComponent(mobile.organizationId)}` : null;
    const [domainRows, orgRows, extensionRows, directory] = await Promise.all([
      domainFilter ? restGet<any[]>(`/rest/v1/pbx_softphone_users_safe?select=id,portal_user_id,extension,display_name,status,last_seen_at&${domainFilter}&order=extension.asc`, token).catch(() => []) : Promise.resolve([]),
      orgFilter ? restGet<any[]>(`/rest/v1/pbx_softphone_users_safe?select=id,portal_user_id,extension,display_name,status,last_seen_at&${orgFilter}&order=extension.asc`, token).catch(() => []) : Promise.resolve([]),
      // ALL extensions in the domain (covers users without the mobile app)
      restGet<any[]>(`/rest/v1/pbx_extensions_directory?select=id,portal_user_id,extension,display_name&${domainFilter || orgFilter}&enabled=eq.true&order=extension.asc`, token).catch(() => []),
      chatCall('list_directory', {}).catch(() => ({ members: [] })),
    ]);
    const byKey = new Map<string, any>();
    for (const r of [...(domainRows || []), ...(orgRows || [])]) {
      const key = r.portal_user_id || `ext:${r.extension}`;
      byKey.set(key, { ...byKey.get(key), key, portal_user_id: r.portal_user_id || null, extension: r.extension, display_name: r.display_name, status: r.status, last_seen_at: r.last_seen_at });
    }
    for (const r of (extensionRows || [])) {
      const key = r.portal_user_id || `ext:${r.extension}`;
      if (byKey.has(key)) continue;
      byKey.set(key, { key, portal_user_id: r.portal_user_id || null, extension: r.extension, display_name: r.display_name, status: null, last_seen_at: null });
    }
    (directory.members || []).forEach((m: any) => {
      if (!m.user_id) return;
      byKey.set(m.user_id, { ...byKey.get(m.user_id), key: m.user_id, portal_user_id: m.user_id, extension: m.extension || byKey.get(m.user_id)?.extension, display_name: m.full_name || m.email || byKey.get(m.user_id)?.display_name, status: m.status, last_seen_at: m.last_seen_at });
    });
    const rows = Array.from(byKey.values());
    const ids = rows.map((r) => r.portal_user_id).filter(Boolean);
    const pres = ids.length ? await restGet<any[]>(`/rest/v1/user_presence?select=user_id,status,call_state,last_seen_at&user_id=in.(${ids.map((id: string) => `"${id}"`).join(',')})`, token).catch(() => []) : [];
    const pmap = new Map((pres || []).map((p: any) => [p.user_id, p]));
    const list = rows.map((r) => {
      const p: any = r.portal_user_id ? pmap.get(r.portal_user_id) : null;
      const stale = !p?.last_seen_at || Date.now() - new Date(p.last_seen_at).getTime() > 5 * 60 * 1000;
      const status = p?.call_state && p.call_state !== 'idle' ? 'on_call' : stale ? (p?.status === 'available' ? 'away' : p?.status || r.status || 'offline') : (p?.status || r.status || 'available');
      return { user_id: r.portal_user_id || `ext:${r.extension}`, full_name: r.display_name || (r.extension ? `Ext ${r.extension}` : null), email: null, extension: r.extension, status, is_self: r.portal_user_id === userId } as Member;
    });
    setMembers(list);
    return list;
  }, [chatCall, mobile.domainUuid, mobile.organizationId, token, userId]);

  const loadChannels = useCallback(async () => {
    if (!token) return;
    const r = await chatCall('list_channels', {});
    setChannels(r.channels || []);
  }, [chatCall, token]);

  useEffect(() => {
    if (mobile.loading) return;
    if (!token || (!mobile.domainUuid && !mobile.organizationId)) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        setError(null);
        // Load channels first — that's the default view. Unblock UI ASAP.
        await loadChannels();
        if (!cancelled) setLoading(false);
        // Load members + heartbeat in the background (members view will render as soon as ready).
        loadMembers().catch(() => {});
        chatCall('heartbeat', { status: 'available', platform: 'mobile', call_state: 'idle' }).catch(() => {});
      } catch (e: any) {
        if (!cancelled) { setError(e?.message || 'Failed to load team chat'); setLoading(false); }
      }
    })();
    // Heartbeat sent once on screen open only — periodic 30s interval removed
    // to reduce server load and BLF registration issues.
    return () => { cancelled = true; };
  }, [chatCall, loadChannels, loadMembers, mobile.loading, mobile.domainUuid, mobile.organizationId, token]);

  useEffect(() => {
    if (!token || !mobile.organizationId) return;
    const client = authedRealtime(token);
    const channel = client.channel(`team-presence-${mobile.organizationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_presence', filter: `organization_id=eq.${mobile.organizationId}` } as any, () => loadMembers().catch(() => {}))
      .subscribe();
    return () => { client.removeChannel(channel); };
  }, [loadMembers, mobile.organizationId, token]);

  useEffect(() => {
    if (!token || !mobile.organizationId) return;
    const client = authedRealtime(token);
    const channel = client.channel(`team-channels-${mobile.organizationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'org_chat_channels', filter: `organization_id=eq.${mobile.organizationId}` } as any, () => loadChannels().catch(() => {}))
      .subscribe();
    return () => { client.removeChannel(channel); };
  }, [loadChannels, mobile.organizationId, token]);

  const loadMessages = useCallback(async (channelId: string) => {
    const r = await chatCall('list_messages', { channel_id: channelId, limit: 80 });
    setMessages(r.messages || []);
    await chatCall('mark_read', { channel_id: channelId }).catch(() => {});
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }));
  }, [chatCall]);

  useEffect(() => {
    if (!activeChannel || !token) return;
    let cancelled = false;
    loadMessages(activeChannel.id).catch(() => {});
    const client = authedRealtime(token);
    const channel = client.channel(`chat-${activeChannel.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'org_chat_messages', filter: `channel_id=eq.${activeChannel.id}` } as any, () => { if (!cancelled) loadMessages(activeChannel.id).catch(() => {}); })
      .subscribe();
    return () => { cancelled = true; client.removeChannel(channel); };
  }, [activeChannel?.id, loadMessages, token]);

  const openDm = async (m: Member) => {
    if (!m.user_id || String(m.user_id).startsWith('ext:')) {
      setError("This teammate hasn't activated their portal yet — DM unavailable.");
      return;
    }
    try {
      const r = await chatCall('ensure_dm_channel', { user_id: m.user_id });
      if (r?.error) { setError(r.error === 'not_in_org' ? 'Teammate is not in your workspace.' : String(r.error)); return; }
      if (r.channel) { setActiveChannel(r.channel); setView('chat'); await loadChannels(); }
    } catch (e: any) { setError(e?.message || 'DM failed'); }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || !activeChannel) return;
    setInput('');
    try {
      const r = await chatCall('send_message', { channel_id: activeChannel.id, content: text });
      if (r.message) {
        setMessages((prev) => prev.some((m) => m.id === r.message.id) ? prev : [...prev, r.message]);
        requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }));
      }
    } catch (e: any) { setError(e?.message || 'Send failed'); }
  };

  const createGroup = async () => {
    try {
      const r = await chatCall('create_group', { name: groupName || 'group', member_ids: Array.from(groupPicks) });
      setGroupOpen(false); setGroupName(''); setGroupPicks(new Set()); await loadChannels();
      if (r.channel) { setActiveChannel(r.channel); setView('chat'); }
    } catch (e: any) { setError(e?.message || 'Group failed'); }
  };

  const channelDisplay = useCallback((ch: Channel) => {
    if (ch.channel_type === 'dm' || ch.name.startsWith('dm:')) {
      const other = (ch.members || []).find((m) => m !== userId);
      const mem = members.find((m) => m.user_id === other);
      return mem ? (mem.full_name || `Ext ${mem.extension || ''}`) : 'Direct message';
    }
    return ch.name.toLowerCase() === 'general' ? '# General' : `# ${ch.name}`;
  }, [members, userId]);

  const visibleMessages = useMemo(() => msgQuery.trim() ? messages.filter((m) => m.content.toLowerCase().includes(msgQuery.trim().toLowerCase()) || (m.sender_name || '').toLowerCase().includes(msgQuery.trim().toLowerCase())) : messages, [messages, msgQuery]);

  if (view === 'chat' && activeChannel) return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={() => { setView('channels'); setActiveChannel(null); setShowMsgSearch(false); setMsgQuery(''); }} style={{ background: 'none', border: 'none', color: colors.textIce, cursor: 'pointer' }}><ArrowLeft size={20} /></button>
        {showMsgSearch ? <input autoFocus value={msgQuery} onChange={(e) => setMsgQuery(e.target.value)} placeholder="Search messages…" style={{ flex: 1, padding: '6px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: colors.textIce, fontSize: 13, outline: 'none' }} /> : <div style={{ flex: 1, fontWeight: 800, color: colors.textIce, fontSize: 15 }}>{channelDisplay(activeChannel)}</div>}
        <button onClick={() => { setShowMsgSearch((v) => !v); if (showMsgSearch) setMsgQuery(''); }} style={{ background: 'none', border: 'none', color: showMsgSearch ? '#21d4fd' : colors.mutedSilver, cursor: 'pointer' }}><Search size={18} /></button>
      </header>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visibleMessages.map((m) => <Bubble key={m.id} m={m} mine={m.sender_id === userId} />)}
        {messages.length === 0 && <div style={{ textAlign: 'center', color: colors.mutedSilver, fontSize: 12, padding: 32 }}>No messages yet.</div>}
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }} placeholder="Message…" style={{ flex: 1, padding: '10px 14px', borderRadius: 20, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: colors.textIce, fontSize: 14, outline: 'none' }} />
        <button onClick={sendMessage} disabled={!input.trim()} style={{ width: 40, height: 40, borderRadius: 20, border: 'none', background: input.trim() ? 'linear-gradient(135deg, #0023e6, #21d4fd)' : 'rgba(255,255,255,0.08)', color: '#fff', cursor: input.trim() ? 'pointer' : 'not-allowed', display: 'grid', placeItems: 'center' }}><Send size={16} /></button>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header style={{ padding: '14px 16px 8px' }}><div style={{ fontSize: 11, color: colors.mutedSilver, textTransform: 'uppercase', letterSpacing: 1.6, fontWeight: 700 }}>{mobile.sipDomain || 'Team'}</div><div style={{ fontSize: 22, fontWeight: 800, color: colors.textIce, marginTop: 2 }}>Chat</div></header>
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 10px' }}>{(['channels', 'members'] as const).map((v) => <button key={v} onClick={() => setView(v)} style={{ flex: 1, padding: '8px', borderRadius: radius.md, background: view === v ? 'rgba(0,35,230,0.25)' : 'rgba(255,255,255,0.04)', border: `1px solid ${view === v ? '#0023e6' : 'rgba(255,255,255,0.06)'}`, color: view === v ? colors.textIce : colors.mutedSilver, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>{v === 'channels' ? <MessageCircle size={14} /> : <Users size={14} />}{v === 'channels' ? 'Channels' : `Team (${members.length})`}</button>)}</div>
      {error && <div style={{ padding: '0 14px 8px', color: '#ff8a3d', fontSize: 12 }}>{error}</div>}
      {loading && <div style={{ padding: 24, textAlign: 'center', color: colors.mutedSilver, fontSize: 13 }}>Loading…</div>}
      <div style={{ padding: '0 14px 8px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}><Search size={14} color={colors.mutedSilver} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={view === 'channels' ? 'Search channels…' : 'Search teammates…'} style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: colors.textIce }} /></div></div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 16px' }}>
        {view === 'channels' && <><button onClick={() => setGroupOpen(true)} style={rowStyle(true)}><Plus size={16} /> New group chat</button>{channels.filter((ch) => !query.trim() || channelDisplay(ch).toLowerCase().includes(query.trim().toLowerCase())).map((ch) => { const n = channelUnread[ch.id] || 0; return <button key={ch.id} onClick={() => { setActiveChannel(ch); setView('chat'); }} style={rowStyle()}><MessageCircle size={16} style={{ color: colors.mutedSilver }} /><span style={{ flex: 1, fontSize: 14, fontWeight: n > 0 ? 800 : 600 }}>{channelDisplay(ch)}</span>{n > 0 && <UnreadBadge n={n} />}</button>; })}{channels.length === 0 && !loading && <EmptyText text="No channels yet." />}</>}
        {view === 'members' && <>{members.filter((m) => !m.is_self && (!query.trim() || `${m.full_name || ''} ${m.extension || ''}`.toLowerCase().includes(query.trim().toLowerCase()))).map((m) => { const dm = channels.find((ch) => (ch.channel_type === 'dm' || ch.name.startsWith('dm:')) && (ch.members || []).includes(m.user_id) && (ch.members || []).includes(userId || '')); const n = dm ? (channelUnread[dm.id] || 0) : 0; return <button key={m.user_id} onClick={() => openDm(m)} style={rowStyle()}><Avatar m={m} /><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: n > 0 ? 800 : 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.full_name || `Ext ${m.extension}`}</div><div style={{ fontSize: 11, color: colors.mutedSilver, display: 'flex', alignItems: 'center', gap: 6 }}><Circle size={6} fill={STATUS_COLOR[m.status]} color={STATUS_COLOR[m.status]} />{m.status}{m.extension ? ` · Ext ${m.extension}` : ''}</div></div>{n > 0 && <UnreadBadge n={n} />}</button>; })}{members.filter((m) => !m.is_self).length === 0 && !loading && <EmptyText text="No teammates found in your domain yet." />}</>}
      </div>
      {groupOpen && <GroupSheet members={members} groupName={groupName} setGroupName={setGroupName} groupPicks={groupPicks} setGroupPicks={setGroupPicks} onClose={() => setGroupOpen(false)} onCreate={createGroup} />}
    </div>
  );
}

function Bubble({ m, mine }: { m: Message; mine: boolean }) {
  return <div style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>{!mine && <div style={{ fontSize: 10, color: colors.mutedSilver, marginBottom: 2, paddingLeft: 6 }}>{m.sender_name || '—'}</div>}<div data-bubble={mine ? 'me' : 'them'} style={{ padding: '8px 12px', borderRadius: 14, background: mine ? 'linear-gradient(135deg, #0023e6, #21d4fd)' : 'rgba(255,255,255,0.06)', color: colors.textIce, fontSize: 14, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content}</div></div>;
}

function Avatar({ m }: { m: Member }) {
  const dot = STATUS_COLOR[m.status] || STATUS_COLOR.offline;
  return <div style={{ position: 'relative', width: 36, height: 36, borderRadius: 18, background: 'rgba(0,35,230,0.20)', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800, color: colors.textIce }}>{(m.full_name || m.extension || '?').slice(0, 2).toUpperCase()}<span style={{ position: 'absolute', right: -2, bottom: -2, width: 11, height: 11, borderRadius: 6, background: dot, border: '2px solid #0d1426' }} /></div>;
}

function rowStyle(accent = false): React.CSSProperties { return { width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', marginBottom: 6, borderRadius: radius.md, background: accent ? 'rgba(0,35,230,0.10)' : 'rgba(255,255,255,0.04)', border: `1px solid ${accent ? 'rgba(0,35,230,0.30)' : 'rgba(255,255,255,0.06)'}`, color: colors.textIce, cursor: 'pointer', textAlign: 'left' }; }
function EmptyText({ text }: { text: string }) { return <div style={{ padding: 24, textAlign: 'center', color: colors.mutedSilver, fontSize: 12 }}>{text}</div>; }
function UnreadBadge({ n }: { n: number }) {
  return <span style={{ minWidth: 20, height: 20, padding: '0 6px', borderRadius: 10, background: '#ff3b30', color: '#fff', fontSize: 11, fontWeight: 800, display: 'grid', placeItems: 'center', boxShadow: '0 2px 6px rgba(255,59,48,0.45)', lineHeight: 1 }}>{n > 99 ? '99+' : n}</span>;
}

function GroupSheet({ members, groupName, setGroupName, groupPicks, setGroupPicks, onClose, onCreate }: any) {
  return <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }} onClick={onClose}><div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxHeight: '80vh', background: '#0d1426', borderRadius: '20px 20px 0 0', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}><div style={{ fontSize: 16, fontWeight: 800, color: colors.textIce }}>New group chat</div><input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Group name" style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: colors.textIce, fontSize: 14, outline: 'none' }} /><div style={{ fontSize: 11, color: colors.mutedSilver, textTransform: 'uppercase', letterSpacing: 1 }}>Add members ({groupPicks.size})</div><div style={{ flex: 1, overflowY: 'auto', maxHeight: '40vh' }}>{members.filter((m: Member) => !m.is_self).map((m: Member) => { const picked = groupPicks.has(m.user_id); return <button key={m.user_id} onClick={() => { const next = new Set(groupPicks); picked ? next.delete(m.user_id) : next.add(m.user_id); setGroupPicks(next); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', marginBottom: 4, borderRadius: 10, background: picked ? 'rgba(0,35,230,0.20)' : 'rgba(255,255,255,0.04)', border: `1px solid ${picked ? '#0023e6' : 'rgba(255,255,255,0.06)'}`, color: colors.textIce, cursor: 'pointer', textAlign: 'left', fontSize: 13 }}><span style={{ flex: 1 }}>{m.full_name || `Ext ${m.extension}`}</span>{picked && <span style={{ fontSize: 11, color: '#21d4fd' }}>✓</span>}</button>; })}</div><div style={{ display: 'flex', gap: 8 }}><button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: 'none', color: colors.textIce, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Cancel</button><button onClick={onCreate} disabled={groupPicks.size === 0} style={{ flex: 1, padding: '10px', borderRadius: 10, background: 'linear-gradient(135deg, #0023e6, #21d4fd)', border: 'none', color: '#fff', cursor: groupPicks.size ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 700, opacity: groupPicks.size ? 1 : 0.5 }}>Create</button></div></div></div>;
}
