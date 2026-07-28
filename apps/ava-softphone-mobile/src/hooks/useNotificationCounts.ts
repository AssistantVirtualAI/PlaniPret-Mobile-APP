/**
 * Aggregates unread/notification counts for the bottom navigation:
 *   - messages: unread team-chat messages (sum across channels)
 *   - missedCalls: missed calls since the user last viewed the Calls tab
 *   - voicemails: voicemails flagged isNew by the backend
 *
 * Also exposes per-channel unread counts so the Team Chat screen can render
 * a dot next to each conversation / teammate row.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { authedRealtime, edgeCall } from '../lib/mobileSupabase';
import { mobileApi } from '../lib/mobileApi';

const LAST_SEEN_CALLS_KEY = 'lemtel-last-seen-calls';
const LAST_SEEN_VM_KEY = 'lemtel-last-seen-voicemail';

type ChannelUnread = { channel_id: string; unread_count: number; last_message_at: string };

export type NotificationCounts = {
  messages: number;
  missedCalls: number;
  voicemails: number;
  channelUnread: Record<string, number>;
  refresh: () => void;
  markSeen: (kind: 'messages' | 'calls' | 'voicemail') => void;
};

export function useNotificationCounts(opts: {
  accessToken: string | null | undefined;
  organizationId: string | null | undefined;
  userId: string | undefined;
}): NotificationCounts {
  const { accessToken, organizationId, userId } = opts;
  const [messages, setMessages] = useState(0);
  const [missedCalls, setMissedCalls] = useState(0);
  const [voicemails, setVoicemails] = useState(0);
  const [channelUnread, setChannelUnread] = useState<Record<string, number>>({});
  const tick = useRef(0);

  const loadChat = useCallback(async () => {
    if (!accessToken) return;
    try {
      const r = await edgeCall<{ counts: ChannelUnread[] }>(
        'org-chat', accessToken, { action: 'unread_counts', payload: {} },
      );
      const map: Record<string, number> = {};
      let total = 0;
      for (const c of r.counts || []) {
        map[c.channel_id] = Number(c.unread_count) || 0;
        total += Number(c.unread_count) || 0;
      }
      setChannelUnread(map);
      setMessages(total);
    } catch {}
  }, [accessToken]);

  const loadCalls = useCallback(async () => {
    if (!accessToken) return;
    try {
      const lastSeen = Number(localStorage.getItem(LAST_SEEN_CALLS_KEY) || 0);
      const calls = await mobileApi.calls({ rangeDays: 7 });
      const missed = (calls || []).filter((c: any) => {
        if (c.status !== 'missed') return false;
        const t = new Date(c.startedAt).getTime();
        return t > lastSeen;
      }).length;
      setMissedCalls(missed);
    } catch {}
  }, [accessToken]);

  const loadVm = useCallback(async () => {
    if (!accessToken) return;
    try {
      const list = await mobileApi.voicemails();
      const lastSeen = Number(localStorage.getItem(LAST_SEEN_VM_KEY) || 0);
      const newCount = (list || []).filter((v: any) => {
        if (v.isNew) return true;
        const t = new Date(v.receivedAt).getTime();
        return t > lastSeen;
      }).length;
      setVoicemails(newCount);
    } catch {}
  }, [accessToken]);

  const refresh = useCallback(() => {
    tick.current += 1;
    loadChat(); loadCalls(); loadVm();
  }, [loadChat, loadCalls, loadVm]);

  // Initial load only — realtime subscriptions below handle live updates.
  // Periodic polling removed to reduce server load and BLF registration issues.
  // Users can manually refresh via the SyncIndicator button.
  useEffect(() => {
    if (!accessToken) return;
    refresh();
    // Refresh on app focus (coming back from background)
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [accessToken, refresh]);

  // Realtime: any new chat message → reload counts
  useEffect(() => {
    if (!accessToken || !organizationId) return;
    const client = authedRealtime(accessToken);
    const ch = client.channel(`notif-chat-${organizationId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'org_chat_messages', filter: `organization_id=eq.${organizationId}` } as any,
        () => { loadChat(); })
      .subscribe();
    return () => { client.removeChannel(ch); };
  }, [accessToken, organizationId, loadChat]);

  // Realtime: any new call record → reload missed counts
  useEffect(() => {
    if (!accessToken || !organizationId) return;
    const client = authedRealtime(accessToken);
    const ch = client.channel(`notif-cdr-${organizationId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'pbx_call_records', filter: `organization_id=eq.${organizationId}` } as any,
        () => { loadCalls(); loadVm(); })
      .subscribe();
    return () => { client.removeChannel(ch); };
  }, [accessToken, organizationId, loadCalls, loadVm]);

  const markSeen = useCallback((kind: 'messages' | 'calls' | 'voicemail') => {
    if (kind === 'calls') {
      localStorage.setItem(LAST_SEEN_CALLS_KEY, String(Date.now()));
      setMissedCalls(0);
    } else if (kind === 'voicemail') {
      localStorage.setItem(LAST_SEEN_VM_KEY, String(Date.now()));
      setVoicemails(0);
    }
    // chat unread is cleared per-channel via mark_read in TeamChatScreen
  }, []);

  // Suppress unused
  void userId;

  return { messages, missedCalls, voicemails, channelUnread, refresh, markSeen };
}
