import { useEffect, useState, useCallback, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Channel = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  channel_type: "public" | "private" | "dm" | "announcement";
  members: string[];
  created_at: string;
};

export type ChatMessage = {
  id: string;
  channel_id: string;
  sender_id: string;
  sender_name: string | null;
  content: string;
  attachments: Array<{ path: string; name: string; mime: string; size: number }> | null;
  reactions: Record<string, string[]> | null;
  message_type: string;
  edited_at: string | null;
  created_at: string;
  parent_message_id?: string | null;
  reply_count?: number;
  last_reply_at?: string | null;
};

async function invoke(action: string, payload?: any) {
  const { data, error } = await supabase.functions.invoke("org-chat", { body: { action, payload } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export function useChannels() {
  const qc = useQueryClient();
  const query = useQuery<{ channels: Channel[] }>({
    queryKey: ["org-chat-channels"],
    queryFn: () => invoke("list_channels"),
  });
  const create = useMutation({
    mutationFn: (p: { name: string; channel_type: "public" | "private"; description?: string; members?: string[] }) =>
      invoke("create_channel", p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org-chat-channels"] }),
  });
  return { query, create };
}

export function useChatMessages(channelId: string | null) {
  const qc = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const query = useQuery<{ messages: ChatMessage[] }>({
    queryKey: ["org-chat-messages", channelId],
    queryFn: () => invoke("list_messages", { channel_id: channelId }),
    enabled: !!channelId,
  });

  useEffect(() => {
    if (query.data?.messages) setMessages(query.data.messages);
  }, [query.data]);

  useEffect(() => {
    if (!channelId) return;
    const ch = supabase
      .channel(`org-chat-${channelId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "org_chat_messages", filter: `channel_id=eq.${channelId}` }, (p: any) => {
        setMessages((prev) => (prev.some((m) => m.id === p.new.id) ? prev : [...prev, p.new]));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "org_chat_messages", filter: `channel_id=eq.${channelId}` }, (p: any) => {
        setMessages((prev) => prev.map((m) => (m.id === p.new.id ? p.new : m)));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [channelId]);

  const send = useMutation({
    mutationFn: (p: { content: string; attachments?: any[]; parent_message_id?: string | null }) =>
      invoke("send_message", { channel_id: channelId, ...p }),
  });
  const edit = useMutation({
    mutationFn: (p: { id: string; content: string }) => invoke("edit_message", p),
  });
  const remove = useMutation({
    mutationFn: (id: string) => invoke("delete_message", { id }),
  });
  const react = useMutation({
    mutationFn: (p: { id: string; emoji: string }) => invoke("toggle_reaction", p),
  });

  const uploadAttachment = useCallback(async (file: File) => {
    const up: any = await invoke("upload_url", { filename: file.name });
    const r = await fetch(up.signedUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
    if (!r.ok) throw new Error("upload_failed");
    return { path: up.path, name: file.name, mime: file.type, size: file.size };
  }, []);

  const getSignedUrl = useCallback(async (path: string) => {
    const r: any = await invoke("signed_url", { path });
    return r.url as string;
  }, []);

  return { query, messages, send, edit, remove, react, uploadAttachment, getSignedUrl };
}

// --- Legacy compat for TelephonyTeam (Phase < 4) ---
export function useOrgChat(_orgId?: string) {
  const { query: channelsQuery, create } = useChannels();
  const channels = channelsQuery.data?.channels ?? [];
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const { messages, send } = useChatMessages(activeChannelId);

  return {
    channels,
    activeChannelId,
    setActiveChannelId,
    messages,
    loading: channelsQuery.isLoading,
    sendMessage: async (content: string) => {
      if (!activeChannelId) return;
      await send.mutateAsync({ content });
    },
    createChannel: async (name: string, channel_type: "public" | "private" = "public") => {
      return await create.mutateAsync({ name, channel_type });
    },
  };
}

export function useThread(parentId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const query = useQuery<{ messages: ChatMessage[] }>({
    queryKey: ["org-chat-thread", parentId],
    queryFn: () => invoke("list_thread", { parent_message_id: parentId }),
    enabled: !!parentId,
  });
  useEffect(() => { if (query.data?.messages) setMessages(query.data.messages); }, [query.data]);
  useEffect(() => {
    if (!parentId) return;
    const ch = supabase
      .channel(`org-chat-thread-${parentId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "org_chat_messages", filter: `parent_message_id=eq.${parentId}` }, (p: any) => {
        setMessages((prev) => (prev.some((m) => m.id === p.new.id) ? prev : [...prev, p.new]));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [parentId]);
  const reply = useMutation({
    mutationFn: (p: { channel_id: string; content: string; attachments?: any[] }) =>
      invoke("send_message", { ...p, parent_message_id: parentId }),
  });
  return { query, messages, reply };
}

export function useChatSearch() {
  return useMutation({
    mutationFn: (p: { query: string; channel_id?: string }) => invoke("search_messages", p),
  });
}

/** Global search across messages + users */
export function useGlobalChatSearch() {
  return useMutation({
    mutationFn: (query: string) => invoke("search_all", { query }),
  });
}

/** Read receipts for a single message */
export function useMessageReceipts(messageId: string | null, enabled = true) {
  return useQuery<{ receipts: Array<{ user_id: string; full_name: string | null; avatar_url: string | null; read_at: string }> }>({
    queryKey: ["chat-receipts", messageId],
    queryFn: () => invoke("get_receipts", { message_id: messageId }),
    enabled: !!messageId && enabled,
    staleTime: 10_000,
  });
}

export function useMarkMessagesRead() {
  return useMutation({
    mutationFn: (channelId: string) => invoke("mark_messages_read", { channel_id: channelId }),
  });
}

/** Edit history for a single message */
export function useEditHistory(messageId: string | null, enabled = true) {
  return useQuery<{ history: Array<{ id: string; edited_by: string; editor_name: string | null; previous_content: string; new_content: string; edited_at: string }> }>({
    queryKey: ["chat-edit-history", messageId],
    queryFn: () => invoke("get_edit_history", { message_id: messageId }),
    enabled: !!messageId && enabled,
  });
}

/** Blocked users */
export function useBlockedUsers() {
  const qc = useQueryClient();
  const query = useQuery<{ blocks: Array<{ blocked_user_id: string; created_at: string }> }>({
    queryKey: ["chat-blocks"],
    queryFn: () => invoke("list_blocks"),
  });
  const block = useMutation({
    mutationFn: (user_id: string) => invoke("block_user", { user_id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat-blocks"] }),
  });
  const unblock = useMutation({
    mutationFn: (user_id: string) => invoke("unblock_user", { user_id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat-blocks"] }),
  });
  const blockedIds = new Set((query.data?.blocks ?? []).map((b) => b.blocked_user_id));
  return { query, block, unblock, blockedIds };
}

/** Report a message */
export function useReportMessage() {
  return useMutation({
    mutationFn: (p: { message_id: string; reason: string }) => invoke("report_message", p),
  });
}

/** Admin: hide / unhide */
export function useModerateMessage() {
  const hide = useMutation({ mutationFn: (p: { message_id: string; reason?: string }) => invoke("hide_message", p) });
  const unhide = useMutation({ mutationFn: (message_id: string) => invoke("unhide_message", { message_id }) });
  return { hide, unhide };
}

/** Admin: list + resolve reports */
export function useReports() {
  const qc = useQueryClient();
  const query = useQuery<{ reports: any[] }>({
    queryKey: ["chat-reports"],
    queryFn: () => invoke("list_reports"),
    refetchInterval: 30_000,
  });
  const resolve = useMutation({
    mutationFn: (p: { id: string; resolution?: string }) => invoke("resolve_report", p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat-reports"] }),
  });
  return { query, resolve };
}

export type DirectoryMember = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  extension: string | null;
  status: "available" | "busy" | "in_meeting" | "on_call" | "away" | "offline" | string;
  status_message: string | null;
  is_self: boolean;
};

export function useDirectory() {
  return useQuery<{ members: DirectoryMember[] }>({
    queryKey: ["org-chat-directory"],
    queryFn: () => invoke("list_directory"),
    refetchInterval: 30_000,
  });
}

export function useEnsureDmChannel() {
  return useMutation({
    mutationFn: (user_id: string) => invoke("ensure_dm_channel", { user_id }),
  });
}

export function useChatHeartbeat() {
  useEffect(() => {
    let mounted = true;
    const beat = () => {
      if (!mounted) return;
      invoke("heartbeat", { status: "available", platform: "web" }).catch(() => {});
    };
    beat();
    const id = setInterval(beat, 30_000);
    const onVis = () => { if (document.visibilityState === "visible") beat(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { mounted = false; clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, []);
}

// ===== New: unread, typing, pins, group, calling =====

export function useUnreadCounts() {
  const qc = useQueryClient();
  const query = useQuery<{ counts: Array<{ channel_id: string; unread_count: number; last_message_at: string }> }>({
    queryKey: ["org-chat-unread"],
    queryFn: () => invoke("unread_counts"),
    refetchInterval: 20_000,
  });
  useEffect(() => {
    const ch = supabase.channel("org-chat-unread-watch")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "org_chat_messages" }, () => {
        qc.invalidateQueries({ queryKey: ["org-chat-unread"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);
  return query;
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channel_id: string) => invoke("mark_read", { channel_id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org-chat-unread"] }),
  });
}

export function useTyping(channelId: string | null, myName: string | null) {
  const [typing, setTyping] = useState<Record<string, { name: string; at: number }>>({});
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!channelId) return;
    const ch = supabase.channel(`chat-typing-${channelId}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "typing" }, ({ payload }: any) => {
        if (!payload?.user_id) return;
        setTyping((p) => ({ ...p, [payload.user_id]: { name: payload.name || "Someone", at: Date.now() } }));
      })
      .subscribe();
    channelRef.current = ch;
    const sweep = setInterval(() => {
      setTyping((p) => {
        const now = Date.now();
        const next: typeof p = {};
        for (const k of Object.keys(p)) if (now - p[k].at < 4000) next[k] = p[k];
        return next;
      });
    }, 1500);
    return () => { clearInterval(sweep); supabase.removeChannel(ch); channelRef.current = null; };
  }, [channelId]);

  const lastSentRef = useRef(0);
  const sendTyping = useCallback((userId: string) => {
    const now = Date.now();
    if (now - lastSentRef.current < 1500) return;
    lastSentRef.current = now;
    channelRef.current?.send({ type: "broadcast", event: "typing", payload: { user_id: userId, name: myName } });
  }, [myName]);

  return { typingUsers: Object.values(typing), sendTyping };
}

export function useGroupChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { name: string; member_ids: string[] }) => invoke("create_group", p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org-chat-channels"] }),
  });
}

export function usePins(channelId: string | null) {
  const qc = useQueryClient();
  const query = useQuery<{ pins: any[]; messages: any[] }>({
    queryKey: ["org-chat-pins", channelId],
    queryFn: () => invoke("list_pins", { channel_id: channelId }),
    enabled: !!channelId,
  });
  useEffect(() => {
    if (!channelId) return;
    const ch = supabase.channel(`chat-pins-${channelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "org_chat_message_pins", filter: `channel_id=eq.${channelId}` },
        () => qc.invalidateQueries({ queryKey: ["org-chat-pins", channelId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [channelId, qc]);
  const pin = useMutation({ mutationFn: (id: string) => invoke("pin_message", { id }) });
  const unpin = useMutation({ mutationFn: (id: string) => invoke("unpin_message", { id }) });
  return { query, pin, unpin };
}

/** Start a call via the softphone bridge (desktop emits the same event). */
export function useChatCall() {
  return useCallback((to: string | string[], opts?: { conferenceId?: string }) => {
    const detail = { to, conferenceId: opts?.conferenceId };
    window.dispatchEvent(new CustomEvent("lemtel:start-call", { detail }));
    // also post to a softphone iframe if present
    document.querySelectorAll('iframe[data-softphone="true"]').forEach((f: any) => {
      try { f.contentWindow?.postMessage({ type: "lemtel:start-call", ...detail }, "*"); } catch {}
    });
  }, []);
}

