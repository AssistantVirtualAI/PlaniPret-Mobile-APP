import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LogIn, LogOut, Pause, Play, Search } from 'lucide-react';
import { colors, font, radius } from '../lib/theme';
import { QueueRow } from '../lib/mobileApi';
import { Card, Chip, EmptyState, SectionTitle, Skeleton } from '../components/ui/Primitives';
import { showMobileToast } from '../lib/mobileToast';
import { useMobileCredentials } from '../hooks/useMobileCredentials';
import { authedRealtime, edgeCall, restGet, SUPABASE_ANON, SUPABASE_URL } from '../lib/mobileSupabase';
import { useTr } from '../lib/i18n';


type AgentState = { id: string; queue_id: string; queue_name: string | null; paused: boolean; joined_at: string };

export default function QueuesScreen() {
  const { tr } = useTr();
  const mobile = useMobileCredentials();

  const [data, setData] = useState<QueueRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [states, setStates] = useState<Record<string, AgentState>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!mobile.accessToken || !mobile.organizationId) { setData([]); setLoading(false); return; }
    setLoading(true);
    try {
      const local = await restGet<any[]>(`/rest/v1/pbx_call_queues?select=id,pbx_uuid,name,extension,strategy&organization_id=eq.${mobile.organizationId}&order=name.asc`, mobile.accessToken).catch(() => []);
      let rows: QueueRow[] = (local || []).map((r) => ({ id: r.pbx_uuid || r.id, name: r.name || 'Queue', extension: r.extension || '', strategy: r.strategy || 'ring-all', waiting: 0, agentsOnline: 0, callsToday: 0, avgWaitSec: 0, slaPct: 0 }));
      if (rows.length === 0 && mobile.domainUuid) {
        const live = await edgeCall<any>('fusionpbx-proxy', mobile.accessToken, { action: 'list-queues', organization_id: mobile.organizationId, params: { domain_uuid: mobile.domainUuid } });
        rows = (live.data || []).map((x: any) => ({ id: x.call_center_queue_uuid || x.queue_uuid || x.queue_name || x.name, name: x.queue_name || x.name || 'Queue', extension: x.queue_extension || x.extension || '', strategy: x.queue_strategy || x.strategy || 'ring-all', waiting: Number(x.waiting || x.callers_waiting || 0), agentsOnline: Number(x.agents_available || x.agents_online || 0), callsToday: Number(x.calls_answered_today || x.calls_today || 0), avgWaitSec: Number(x.avg_wait || 0), slaPct: Number(x.service_level || 0) }));
      }
      setData(rows); setLastSyncedAt(Date.now()); setError(null);
    } catch (e: any) { setData([]); setError(e); }
    finally { setLoading(false); }
  }, [mobile.accessToken, mobile.organizationId, mobile.domainUuid]);

  const loadStates = useCallback(async () => {
    if (!mobile.accessToken || !mobile.userId) return;
    const rows = await restGet<AgentState[]>(`/rest/v1/pbx_queue_agent_state?select=id,queue_id,queue_name,paused,joined_at&user_id=eq.${mobile.userId}`, mobile.accessToken).catch(() => []);
    const map: Record<string, AgentState> = {};
    rows.forEach((s) => { map[s.queue_id] = s; });
    setStates(map);
  }, [mobile.accessToken, mobile.userId]);

  useEffect(() => { if (!mobile.loading) { refresh(); loadStates(); } }, [mobile.loading, refresh, loadStates]);

  useEffect(() => {
    if (!mobile.accessToken || !mobile.userId) return;
    const client = authedRealtime(mobile.accessToken);
    const channel = client.channel('queue-state-mobile')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pbx_queue_agent_state', filter: `user_id=eq.${mobile.userId}` } as any, () => loadStates())
      .subscribe();
    return () => { client.removeChannel(channel); };
  }, [mobile.accessToken, mobile.userId, loadStates]);

  const join = async (queue: QueueRow) => {
    if (!mobile.accessToken || !mobile.userId || !mobile.organizationId) { showMobileToast('Not signed in', 'error'); return; }
    setBusy(queue.id);
    try {
      await edgeCall('fusionpbx-proxy', mobile.accessToken, { action: 'queue-login', organization_id: mobile.organizationId, params: { domain_uuid: mobile.domainUuid, queue_id: queue.id, queue_name: queue.name, queue_extension: queue.extension, extension: mobile.extension } }).catch(() => null);
      const r = await fetch(`${SUPABASE_URL}/rest/v1/pbx_queue_agent_state`, { method: 'POST', headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${mobile.accessToken}`, 'Content-Type': 'application/json', Prefer: 'return=representation,resolution=merge-duplicates' }, body: JSON.stringify({ user_id: mobile.userId, organization_id: mobile.organizationId, queue_id: queue.id, queue_name: queue.name, paused: false, joined_at: new Date().toISOString() }) });
      if (!r.ok) throw new Error(await r.text());
      await loadStates(); showMobileToast(`Joined ${queue.name}`, 'success');
    } catch (e: any) { showMobileToast(`Join failed — ${e?.message?.slice(0, 80) || 'error'}`, 'error'); }
    finally { setBusy(null); }
  };

  const leave = async (queue: QueueRow) => {
    if (!mobile.accessToken || !mobile.userId || !mobile.organizationId) return;
    setBusy(queue.id);
    try {
      await edgeCall('fusionpbx-proxy', mobile.accessToken, { action: 'queue-logout', organization_id: mobile.organizationId, params: { domain_uuid: mobile.domainUuid, queue_id: queue.id, queue_name: queue.name, queue_extension: queue.extension, extension: mobile.extension } }).catch(() => null);
      const r = await fetch(`${SUPABASE_URL}/rest/v1/pbx_queue_agent_state?user_id=eq.${mobile.userId}&queue_id=eq.${encodeURIComponent(queue.id)}`, { method: 'DELETE', headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${mobile.accessToken}` } });
      if (!r.ok) throw new Error(await r.text());
      await loadStates(); showMobileToast(`Left ${queue.name}`, 'success');
    } catch (e: any) { showMobileToast(`Leave failed — ${e?.message?.slice(0, 80) || 'error'}`, 'error'); }
    finally { setBusy(null); }
  };

  const togglePause = async (queue: QueueRow) => {
    if (!mobile.accessToken || !mobile.organizationId) return;
    const cur = states[queue.id];
    if (!cur) return;
    setBusy(queue.id);
    try {
      await edgeCall('fusionpbx-proxy', mobile.accessToken, { action: 'queue-pause', organization_id: mobile.organizationId, params: { domain_uuid: mobile.domainUuid, queue_id: queue.id, queue_name: queue.name, queue_extension: queue.extension, extension: mobile.extension, paused: !cur.paused } }).catch(() => null);
      const r = await fetch(`${SUPABASE_URL}/rest/v1/pbx_queue_agent_state?id=eq.${cur.id}`, { method: 'PATCH', headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${mobile.accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ paused: !cur.paused }) });
      if (!r.ok) throw new Error(await r.text());
      await loadStates();
    } catch (e: any) { showMobileToast(`Update failed — ${e?.message?.slice(0, 80) || 'error'}`, 'error'); }
    finally { setBusy(null); }
  };

  const filtered = useMemo(() => {
    if (!data) return data;
    const t = q.trim().toLowerCase();
    if (!t) return data;
    return data.filter((x) => x.name.toLowerCase().includes(t) || x.extension?.includes(t));
  }, [data, q]);
  const joinedCount = Object.values(states).filter((s) => !s.paused).length;

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '14px 14px 20px' }}>
      <SectionTitle eyebrow={mobile.sipDomain || tr.queues.livePbx} title={tr.queues.title} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 2px 10px' }}><div data-search-bar="true" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: `1px solid ${colors.border}` }}><Search size={14} color={colors.mutedSilver} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr.queues.searchPlaceholder} style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: colors.textIce }} /></div><button onClick={refresh} disabled={loading} style={{ padding: '8px 12px', borderRadius: 999, border: `1px solid ${colors.border}`, background: 'rgba(255,255,255,0.06)', color: colors.lemtelBlue, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>{loading ? '…' : '↻'}</button></div>
      <div style={{ fontSize: font.xs, color: colors.mutedSilver, margin: '0 2px 10px' }}>{joinedCount} {tr.queues.active} · {Object.keys(states).length} {tr.queues.joined}</div>
      {error && <Card accent="gold" style={{ marginBottom: 10 }}><div style={{ fontSize: font.sm, color: colors.danger, fontWeight: 700 }}>{tr.queues.couldntLoad}</div><div style={{ fontSize: font.xs, color: colors.mutedSilver, marginTop: 4 }}>{error.message}</div></Card>}
      {!data && !error && [1, 2, 3].map((i) => <Card key={i} style={{ marginBottom: 8 }}><Skeleton w="60%" h={14} /><div style={{ height: 6 }} /><Skeleton w="40%" h={10} /></Card>)}
      {data && data.length === 0 && <EmptyState icon="⇉" title={tr.queues.empty} hint={tr.queues.emptyHint} />}
      {filtered && filtered.map((queue) => <QueueCard key={queue.id} q={queue} tr={tr} state={states[queue.id]} busy={busy === queue.id} onJoin={() => join(queue)} onLeave={() => leave(queue)} onTogglePause={() => togglePause(queue)} />)}
      <div style={{ height: 80 }} />
    </div>
  );
}


function QueueCard({ q, tr, state, busy, onJoin, onLeave, onTogglePause }: { q: QueueRow; tr: any; state?: AgentState; busy: boolean; onJoin: () => void; onLeave: () => void; onTogglePause: () => void }) {
  const slaTone = q.slaPct >= 85 ? colors.success : q.slaPct >= 70 ? colors.warning : colors.danger;
  const joined = !!state;
  const paused = !!state?.paused;
  return <Card style={{ marginBottom: 8 }} padded={true}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}><div style={{ flex: 1, minWidth: 0 }}><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ fontSize: font.md, fontWeight: 800, color: colors.textIce }}>{q.name}</div>{joined && <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.8, padding: '2px 6px', borderRadius: 999, background: paused ? 'rgba(245,158,11,0.18)' : 'rgba(34,211,154,0.18)', color: paused ? colors.warning : colors.success }}>{paused ? tr.queues.paused : tr.queues.activeBadge}</span>}</div><div style={{ fontSize: font.xs, color: colors.mutedSilver, marginTop: 2, fontFamily: 'JetBrains Mono, monospace' }}>Ext {q.extension || '—'} · {q.strategy || 'default'}</div></div><div style={{ textAlign: 'right' }}><div style={{ fontSize: 22, fontWeight: 800, color: slaTone, fontFamily: 'JetBrains Mono, monospace' }}>{q.slaPct}%</div><div style={{ fontSize: 9.5, color: colors.mutedSilver, letterSpacing: 1 }}>{tr.queues.slaToday}</div></div></div><div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}><Chip tone="cyan">{q.waiting} {tr.queues.waiting.replace('{n} ', '')}</Chip><Chip tone="gold">{q.agentsOnline} {tr.queues.agentsOnline.replace('{n} ', '')}</Chip><Chip tone="violet">{q.callsToday} {tr.queues.callsToday.replace('{n} ', '')}</Chip>{q.avgWaitSec > 0 && <Chip>{tr.queues.wait.replace('{n}', String(Math.round(q.avgWaitSec)))}</Chip>}</div><div style={{ display: 'flex', gap: 6, marginTop: 10 }}>{!joined ? <button onClick={onJoin} disabled={busy} style={pillBtn(colors.success, busy)}><LogIn size={12} /> {busy ? '…' : tr.queues.join}</button> : <><button onClick={onTogglePause} disabled={busy} style={pillBtn(paused ? colors.success : colors.warning, busy)}>{paused ? <Play size={12} /> : <Pause size={12} />} {paused ? tr.queues.resume : tr.queues.pause}</button><button onClick={onLeave} disabled={busy} style={pillBtn(colors.danger, busy)}><LogOut size={12} /> {tr.queues.leave}</button></>}</div></Card>;
}


function pillBtn(color: string, busy: boolean): React.CSSProperties { return { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 999, border: 'none', background: color, color: '#fff', fontSize: 11, fontWeight: 800, letterSpacing: 0.6, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }; }
