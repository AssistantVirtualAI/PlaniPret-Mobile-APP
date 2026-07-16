import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Hash, Lock, Plus, Send, Paperclip, Smile, Trash2, MessageSquare, Users as UsersIcon, Phone, Pin, PinOff, AtSign, UserPlus, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ThreadPanel } from "@/components/chat/ThreadPanel";
import { GlobalChatSearch } from "@/components/chat/GlobalChatSearch";
import { MessageReceipts } from "@/components/chat/MessageReceipts";
import { EditHistoryPopover } from "@/components/chat/EditHistoryPopover";
import { ModerationMenu } from "@/components/chat/ModerationMenu";
import { ReportsPanel } from "@/components/chat/ReportsPanel";
import { Textarea } from "@/components/ui/textarea";
import { useChannels, useChatMessages, useDirectory, useEnsureDmChannel, useChatHeartbeat, useUnreadCounts, useMarkRead, useTyping, useGroupChat, usePins, useChatCall, useBlockedUsers, useMarkMessagesRead, type Channel, type DirectoryMember } from "@/hooks/useOrgChat";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format } from "date-fns";
import { Pencil, EyeOff } from "lucide-react";

const EMOJIS = ["👍", "❤️", "😂", "🎉", "🚀", "👀"];

export default function OrgChat() {
  const { language } = useLanguage();
  const lang: "en" | "fr" = language === "fr" ? "fr" : "en";
  const t = (en: string, fr: string) => (lang === "fr" ? fr : en);
  const { user } = useAuth();
  useChatHeartbeat();

  const { query: channelsQ, create } = useChannels();
  const channels = channelsQ.data?.channels ?? [];
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = channels.find((c) => c.id === activeId) || null;

  const directoryQ = useDirectory();
  const ensureDm = useEnsureDmChannel();
  const unreadQ = useUnreadCounts();
  const unreadMap: Record<string, number> = {};
  (unreadQ.data?.counts ?? []).forEach((c) => { unreadMap[c.channel_id] = Number(c.unread_count); });
  const group = useGroupChat();

  useEffect(() => {
    if (!activeId && channels.length) setActiveId(channels[0].id);
  }, [channels, activeId]);

  const [unlinked, setUnlinked] = useState<DirectoryMember | null>(null);

  const openDm = async (m: DirectoryMember) => {
    if (!m.user_id || String(m.user_id).startsWith("ext:")) {
      setUnlinked(m);
      return;
    }
    try {
      const r: any = await ensureDm.mutateAsync(m.user_id);
      if (r?.channel?.id) {
        await channelsQ.refetch();
        setActiveId(r.channel.id);
      } else if (r?.error) {
        toast.error(["not_in_org", "not_in_domain"].includes(r.error) ? "Teammate is not linked to your PBX domain." : String(r.error));
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to open DM");
    }
  };

  const createGroup = async (name: string, ids: string[]) => {
    try {
      const r: any = await group.mutateAsync({ name, member_ids: ids });
      if (r?.channel?.id) { await channelsQ.refetch(); setActiveId(r.channel.id); toast.success(t("Group created", "Groupe créé")); }
    } catch (e: any) { toast.error(e?.message); }
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex">
      <Sidebar
        channels={channels}
        activeId={activeId}
        onSelect={setActiveId}
        loading={channelsQ.isLoading}
        unread={unreadMap}
        directory={directoryQ.data?.members ?? []}
        onCreateChannel={async (name, type) => {
          const r = await create.mutateAsync({ name, channel_type: type });
          if (r?.channel?.id) { setActiveId(r.channel.id); toast.success(t("Channel created", "Canal créé")); }
        }}
        onCreateGroup={createGroup}
        t={t}
      />
      <div className="flex-1 flex flex-col bg-background min-w-0">
        {active ? (
          <ChannelView channel={active} userId={user?.id ?? ""} userName={user?.email ?? null} directory={directoryQ.data?.members ?? []} t={t} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            {channelsQ.isLoading ? <Skeleton className="h-6 w-32" /> : t("Select a channel or a teammate", "Sélectionnez un canal ou un coéquipier")}
          </div>
        )}
      </div>
      <DirectoryPanel members={directoryQ.data?.members ?? []} loading={directoryQ.isLoading} onOpenDm={openDm} t={t} />

      <Dialog open={!!unlinked} onOpenChange={(o) => !o && setUnlinked(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              {t("Teammate not on portal yet", "Coéquipier pas encore sur le portail")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-md border bg-muted/40 p-3">
              <div className="text-sm font-medium">{unlinked?.full_name || (unlinked?.extension ? `Ext ${unlinked.extension}` : "—")}</div>
              {unlinked?.extension && (
                <div className="text-xs text-muted-foreground font-mono mt-0.5">Ext {unlinked.extension}</div>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {t(
                "This extension exists in the PBX but the user hasn't activated their portal account, so direct messages are unavailable. You can still reach them by phone, or invite them to join.",
                "Cette extension existe dans le PBX mais l'utilisateur n'a pas activé son compte portail, la messagerie directe est donc indisponible. Vous pouvez l'appeler ou l'inviter à rejoindre.",
              )}
            </p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {unlinked?.extension && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("lemtel:start-call", { detail: { to: unlinked.extension } }));
                  toast.success(t("Calling extension", "Appel de l'extension") + ` ${unlinked.extension}`);
                  setUnlinked(null);
                }}
              >
                <Phone className="h-4 w-4" /> {t("Call extension", "Appeler l'extension")}
              </Button>
            )}
            <Button asChild className="gap-2" onClick={() => setUnlinked(null)}>
              <Link to="/telephony/team">
                <Mail className="h-4 w-4" /> {t("Invite to portal", "Inviter au portail")}
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function statusColor(s: string) {
  switch (s) {
    case "available": return "bg-emerald-500";
    case "busy": return "bg-red-500";
    case "in_meeting": return "bg-amber-500";
    case "on_call": return "bg-blue-500";
    case "away": return "bg-yellow-500";
    default: return "bg-muted-foreground/40";
  }
}

function statusLabel(s: string, t: (en: string, fr: string) => string) {
  switch (s) {
    case "available": return t("Available", "Disponible");
    case "busy": return t("Busy", "Occupé");
    case "in_meeting": return t("In a meeting", "En réunion");
    case "on_call": return t("On a call", "En appel");
    case "away": return t("Away", "Absent");
    case "offline": return t("Offline", "Hors ligne");
    default: return s;
  }
}

function DirectoryPanel({ members, loading, onOpenDm, t }: {
  members: DirectoryMember[];
  loading: boolean;
  onOpenDm: (m: DirectoryMember) => void;
  t: (en: string, fr: string) => string;
}) {
  const [q, setQ] = useState("");
  const filtered = members.filter((m) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return (
      (m.full_name || "").toLowerCase().includes(s) ||
      (m.email || "").toLowerCase().includes(s) ||
      (m.extension || "").toLowerCase().includes(s)
    );
  });
  return (
    <aside className="hidden md:flex w-64 border-l bg-muted/20 flex-col">
      <div className="p-3 border-b flex items-center gap-2">
        <UsersIcon className="h-4 w-4" />
        <h3 className="text-sm font-semibold">{t("People", "Personnes")}</h3>
        <Badge variant="outline" className="ml-auto text-[10px]">{members.length}</Badge>
      </div>
      <div className="p-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search…", "Rechercher…")} className="h-8 text-xs" />
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {loading && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          {!loading && filtered.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-6">{t("No teammates yet", "Aucun coéquipier")}</div>
          )}
          {filtered.map((m) => {
            const initials = (m.full_name || m.email || "?").split(/\s|@/).filter(Boolean).map((x) => x[0]).join("").slice(0, 2).toUpperCase();
            return (
              <button
                key={m.user_id}
                onClick={() => !m.is_self && onOpenDm(m)}
                disabled={m.is_self}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent text-left disabled:opacity-60 disabled:cursor-default"
                title={statusLabel(m.status, t)}
              >
                <div className="relative">
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={m.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                  </Avatar>
                  <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background ${statusColor(m.status)}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{m.full_name || m.email}{m.is_self && <span className="text-muted-foreground"> ({t("you", "vous")})</span>}</div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {m.extension ? `Ext ${m.extension} · ` : ""}{statusLabel(m.status, t)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </aside>
  );
}

function Sidebar({
  channels, activeId, onSelect, loading, unread, directory, onCreateChannel, onCreateGroup, t,
}: {
  channels: Channel[]; activeId: string | null; onSelect: (id: string) => void;
  loading: boolean;
  unread: Record<string, number>;
  directory: DirectoryMember[];
  onCreateChannel: (name: string, type: "public" | "private") => Promise<void>;
  onCreateGroup: (name: string, ids: string[]) => Promise<void>;
  t: (en: string, fr: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"public" | "private">("public");
  const [groupSel, setGroupSel] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState("");

  const dmChannels = channels.filter((c) => c.channel_type === "dm");
  const groupChannels = channels.filter((c) => c.channel_type === "private" && c.members?.length > 2);
  const named = channels.filter((c) => c.channel_type === "public" || (c.channel_type === "private" && (c.members?.length ?? 0) <= 2));

  const dmLabel = (c: Channel) => {
    const other = (c.members || []).find((id) => id !== (directory.find((d) => d.is_self)?.user_id));
    return directory.find((d) => d.user_id === other)?.full_name || directory.find((d) => d.user_id === other)?.email || "Direct";
  };

  const Row = ({ c, label, icon }: { c: Channel; label: string; icon: React.ReactNode }) => (
    <button
      key={c.id}
      onClick={() => onSelect(c.id)}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent text-left ${c.id === activeId ? "bg-accent font-medium" : ""}`}
    >
      {icon}
      <span className="truncate flex-1">{label}</span>
      {unread[c.id] > 0 && c.id !== activeId && (
        <Badge className="h-4 px-1.5 text-[10px]" variant="default">{unread[c.id]}</Badge>
      )}
    </button>
  );

  return (
    <aside className="w-60 border-r bg-muted/30 flex flex-col">
      <div className="p-3 border-b flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t("Team chat", "Discussion équipe")}</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7"><Plus className="h-4 w-4" /></Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{t("New conversation", "Nouvelle conversation")}</DialogTitle></DialogHeader>
            <Tabs defaultValue="channel">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="channel">{t("Channel", "Canal")}</TabsTrigger>
                <TabsTrigger value="group">{t("Group", "Groupe")}</TabsTrigger>
              </TabsList>
              <TabsContent value="channel" className="space-y-3 pt-3">
                <div>
                  <Label>{t("Name", "Nom")}</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="general" />
                </div>
                <div>
                  <Label>{t("Type", "Type")}</Label>
                  <Select value={type} onValueChange={(v: any) => setType(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">{t("Public", "Public")}</SelectItem>
                      <SelectItem value="private">{t("Private", "Privé")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button onClick={async () => { await onCreateChannel(name, type); setOpen(false); setName(""); }} disabled={!name.trim()}>
                    {t("Create", "Créer")}
                  </Button>
                </DialogFooter>
              </TabsContent>
              <TabsContent value="group" className="space-y-3 pt-3">
                <div>
                  <Label>{t("Group name", "Nom du groupe")}</Label>
                  <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder={t("Marketing crew", "Équipe marketing")} />
                </div>
                <div>
                  <Label>{t("Members", "Membres")}</Label>
                  <ScrollArea className="h-56 border rounded mt-1">
                    <div className="p-2 space-y-1">
                      {directory.filter((d) => !d.is_self).map((m) => (
                        <label key={m.user_id} className="flex items-center gap-2 p-1 rounded hover:bg-accent cursor-pointer">
                          <Checkbox checked={groupSel.has(m.user_id)} onCheckedChange={(v) => {
                            const n = new Set(groupSel); v ? n.add(m.user_id) : n.delete(m.user_id); setGroupSel(n);
                          }} />
                          <span className="text-sm flex-1 truncate">{m.full_name || m.email}</span>
                          {m.extension && <span className="text-[10px] text-muted-foreground">Ext {m.extension}</span>}
                        </label>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
                <DialogFooter>
                  <Button
                    onClick={async () => {
                      await onCreateGroup(groupName, Array.from(groupSel));
                      setOpen(false); setGroupName(""); setGroupSel(new Set());
                    }}
                    disabled={!groupName.trim() || groupSel.size === 0}
                  >{t("Create group", "Créer le groupe")}</Button>
                </DialogFooter>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-3">
          {loading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}

          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 mb-1">{t("Channels", "Canaux")}</div>
            <div className="space-y-0.5">
              {named.map((c) => <Row key={c.id} c={c} label={c.name} icon={c.channel_type === "private" ? <Lock className="h-3.5 w-3.5" /> : <Hash className="h-3.5 w-3.5" />} />)}
            </div>
          </div>

          {groupChannels.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 mb-1">{t("Groups", "Groupes")}</div>
              <div className="space-y-0.5">
                {groupChannels.map((c) => <Row key={c.id} c={c} label={c.name} icon={<UsersIcon className="h-3.5 w-3.5" />} />)}
              </div>
            </div>
          )}

          {dmChannels.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 mb-1">{t("Direct messages", "Messages directs")}</div>
              <div className="space-y-0.5">
                {dmChannels.map((c) => <Row key={c.id} c={c} label={dmLabel(c)} icon={<AtSign className="h-3.5 w-3.5" />} />)}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}

function ChannelView({ channel, userId, userName, directory, t }: { channel: Channel; userId: string; userName: string | null; directory: DirectoryMember[]; t: (en: string, fr: string) => string }) {
  const { messages, send, edit, remove, react, uploadAttachment, getSignedUrl, query } = useChatMessages(channel.id);
  const [draft, setDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [threadParent, setThreadParent] = useState<any | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const markRead = useMarkRead();
  const markReceipts = useMarkMessagesRead();
  const { typingUsers, sendTyping } = useTyping(channel.id, userName);
  const { query: pinsQ, pin, unpin } = usePins(channel.id);
  const call = useChatCall();
  const { blockedIds } = useBlockedUsers();
  // simplistic admin flag: any message hide/unhide is server-enforced; show actions to allow attempt
  const isAdmin = true;

  const isDm = channel.channel_type === "dm";
  const isGroup = channel.channel_type === "private" && (channel.members?.length ?? 0) > 2;
  const otherDmUserId = isDm ? (channel.members || []).find((id) => id !== userId) : null;
  const otherDm = otherDmUserId ? directory.find((d) => d.user_id === otherDmUserId) : null;

  const headerTitle = isDm
    ? (otherDm?.full_name || otherDm?.email || "Direct message")
    : channel.name;
  const headerIcon = isDm ? <AtSign className="h-4 w-4" />
    : isGroup ? <UsersIcon className="h-4 w-4" />
    : channel.channel_type === "private" ? <Lock className="h-4 w-4" /> : <Hash className="h-4 w-4" />;

  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  }, [messages.length]);

  useEffect(() => {
    if (messages.length) {
      markRead.mutate(channel.id);
      markReceipts.mutate(channel.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id, messages.length]);

  const handleSend = async () => {
    const content = draft.trim();
    if (!content) return;
    setDraft("");
    try { await send.mutateAsync({ content }); }
    catch (e: any) { toast.error(e?.message); }
  };

  const handleFile = async (file: File) => {
    if (file.size > 25 * 1024 * 1024) return toast.error(t("Max 25MB", "Max 25 Mo"));
    setUploading(true);
    try {
      const att = await uploadAttachment(file);
      await send.mutateAsync({ content: "", attachments: [att] });
    } catch (e: any) { toast.error(e?.message); }
    finally { setUploading(false); }
  };

  const handleCall = () => {
    if (isDm && otherDm?.extension) { call(otherDm.extension); return; }
    if (isGroup) {
      const exts = (channel.members || [])
        .filter((id) => id !== userId)
        .map((id) => directory.find((d) => d.user_id === id)?.extension)
        .filter(Boolean) as string[];
      if (exts.length === 0) return toast.error(t("No extensions for group members", "Aucune extension pour les membres"));
      call(exts, { conferenceId: `chat-${channel.id}` });
      send.mutate({ content: `📞 ${userName || "Someone"} ${t("started a group call. Join: ", "a démarré un appel de groupe. Rejoindre: ")} conf-${channel.id.slice(0,6)}` });
    }
  };

  const canCall = (isDm && !!otherDm?.extension) || isGroup;
  const pinnedMsgs = pinsQ.data?.messages ?? [];

  return (
    <>
      <div className="border-b px-4 py-2 flex items-center gap-2">
        {headerIcon}
        <h2 className="font-semibold">{headerTitle}</h2>
        {channel.description && !isDm && <span className="text-sm text-muted-foreground hidden md:inline">— {channel.description}</span>}
        <div className="ml-auto flex items-center gap-2">
          <div className="w-72 hidden lg:block">
            <GlobalChatSearch
              onPickMessage={(m) => { /* TODO: jump to message */ toast.message(`Found in channel ${m.channel_id.slice(0,6)}`); }}
              onPickUser={() => toast.message("Open DM from sidebar")}
            />
          </div>
          <ReportsPanel />
          {!isDm && <Badge variant="outline" className="text-xs">{channel.members?.length ?? 0} {t("members", "membres")}</Badge>}
          {canCall && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={handleCall}>
              <Phone className="h-3.5 w-3.5" /> {isGroup ? t("Call group", "Appeler le groupe") : t("Call", "Appeler")}
            </Button>
          )}
        </div>
      </div>

      {pinnedMsgs.length > 0 && (
        <div className="border-b bg-muted/30 px-4 py-1.5 text-xs flex items-center gap-2 overflow-x-auto">
          <Pin className="h-3 w-3 shrink-0" />
          {pinnedMsgs.slice(0, 3).map((m: any) => (
            <span key={m.id} className="truncate max-w-[240px] text-muted-foreground">
              <strong className="text-foreground">{m.sender_name}:</strong> {m.content}
            </span>
          ))}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {query.isLoading && <Skeleton className="h-20 w-full" />}
        {!query.isLoading && messages.length === 0 && (
          <div className="text-center text-muted-foreground text-sm py-12">
            {t("No messages yet. Say hi 👋", "Aucun message. Lance la discussion 👋")}
          </div>
        )}
        {messages.filter((m: any) => !m.parent_message_id && !blockedIds.has(m.sender_id)).map((m) => {
          const isPinned = pinnedMsgs.some((p: any) => p.id === m.id);
          return (
            <MessageBubble
              key={m.id}
              msg={m}
              isOwn={m.sender_id === userId}
              currentUserId={userId}
              isPinned={isPinned}
              isAdmin={isAdmin}
              onDelete={() => remove.mutate(m.id)}
              onEdit={(content) => edit.mutate({ id: m.id, content })}
              onReact={(emoji) => react.mutate({ id: m.id, emoji })}
              onOpenThread={() => setThreadParent(m)}
              onTogglePin={() => isPinned ? unpin.mutate(m.id) : pin.mutate(m.id)}
              getSignedUrl={getSignedUrl}
              t={t}
            />
          );
        })}
      </div>

      {typingUsers.length > 0 && (
        <div className="px-4 py-1 text-xs text-muted-foreground italic">
          {typingUsers.map((u) => u.name).join(", ")} {t("is typing…", "est en train d'écrire…")}
        </div>
      )}

      <ThreadPanel parent={threadParent} channelId={channel.id} onClose={() => setThreadParent(null)} />

      <div className="border-t p-3 flex items-end gap-2">
        <Button size="icon" variant="ghost" disabled={uploading} onClick={() => fileRef.current?.click()}>
          <Paperclip className="h-4 w-4" />
        </Button>
        <input ref={fileRef} type="file" className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        <Input
          value={draft}
          onChange={(e) => { setDraft(e.target.value); if (e.target.value) sendTyping(userId); }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={t(`Message ${isDm ? "@" + headerTitle : "#" + channel.name}`, `Message ${isDm ? "@" + headerTitle : "#" + channel.name}`)}
        />
        <Button onClick={handleSend} disabled={!draft.trim() || send.isPending}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </>
  );
}

function MessageBubble({
  msg, isOwn, currentUserId, isPinned, isAdmin, onDelete, onEdit, onReact, onOpenThread, onTogglePin, getSignedUrl, t,
}: {
  msg: any; isOwn: boolean; currentUserId: string; isPinned?: boolean; isAdmin?: boolean;
  onDelete: () => void;
  onEdit: (content: string) => void;
  onReact: (emoji: string) => void;
  onOpenThread?: () => void; onTogglePin?: () => void;
  getSignedUrl: (p: string) => Promise<string>;
  t: (en: string, fr: string) => string;
}) {
  const [showEmoji, setShowEmoji] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(msg.content ?? "");
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    (msg.attachments ?? []).forEach(async (a: any) => {
      if (!urls[a.path]) {
        try { const u = await getSignedUrl(a.path); setUrls((p) => ({ ...p, [a.path]: u })); } catch {}
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msg.id]);

  if (msg.message_type === "deleted") {
    return <div className="text-xs italic text-muted-foreground">— {t("message deleted", "message supprimé")}</div>;
  }

  const hidden = msg.is_hidden && !revealed;

  return (
    <div className={`group flex gap-3 ${isPinned ? "bg-amber-500/5 -mx-2 px-2 py-1 rounded" : ""}`}>
      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold shrink-0">
        {(msg.sender_name ?? "?").slice(0, 1).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-medium text-sm">{msg.sender_name}</span>
          <span className="text-[11px] text-muted-foreground">
            {format(new Date(msg.created_at), "p")}
          </span>
          {msg.edited_at && (msg.edit_count ?? 0) > 0 && (
            <EditHistoryPopover messageId={msg.id} count={msg.edit_count ?? 1} />
          )}
          {isPinned && <Pin className="h-3 w-3 text-amber-500" />}
          <div className="ml-auto opacity-0 group-hover:opacity-100 flex items-center gap-1">
            {onOpenThread && (
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onOpenThread} title={t("Reply in thread", "Répondre en fil")}>
                <MessageSquare className="h-3 w-3" />
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setShowEmoji((s) => !s)}>
              <Smile className="h-3 w-3" />
            </Button>
            {onTogglePin && (
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onTogglePin} title={isPinned ? t("Unpin", "Détacher") : t("Pin", "Épingler")}>
                {isPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
              </Button>
            )}
            {isOwn && !hidden && (
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setEditDraft(msg.content ?? ""); setEditing(true); }} title={t("Edit", "Modifier")}>
                <Pencil className="h-3 w-3" />
              </Button>
            )}
            {isOwn && (
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onDelete}>
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
            <ModerationMenu messageId={msg.id} senderId={msg.sender_id} isOwn={isOwn} isAdmin={!!isAdmin} isHidden={!!msg.is_hidden} />
          </div>
        </div>
        {hidden ? (
          <div className="text-xs italic text-muted-foreground flex items-center gap-2 bg-muted/40 rounded px-2 py-1">
            <EyeOff className="h-3 w-3" />
            {t("Message hidden", "Message masqué")} {msg.hidden_reason ? `— ${msg.hidden_reason}` : ""}
            <button className="ml-auto underline" onClick={() => setRevealed(true)}>{t("Show", "Afficher")}</button>
          </div>
        ) : editing ? (
          <div className="space-y-1">
            <Textarea value={editDraft} onChange={(e) => setEditDraft(e.target.value)} rows={2} className="text-sm" />
            <div className="flex gap-1">
              <Button size="sm" onClick={() => { onEdit(editDraft); setEditing(false); }} disabled={!editDraft.trim()}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          msg.content && <div className="text-sm whitespace-pre-wrap break-words">{msg.content}</div>
        )}
        {msg.reply_count > 0 && onOpenThread && (
          <button onClick={onOpenThread} className="mt-1 text-xs text-primary hover:underline flex items-center gap-1">
            <MessageSquare className="h-3 w-3" /> {msg.reply_count} {t("replies", "réponses")}
          </button>
        )}
        {msg.reply_count > 0 && onOpenThread && (
          <button onClick={onOpenThread} className="mt-1 text-xs text-primary hover:underline flex items-center gap-1">
            <MessageSquare className="h-3 w-3" /> {msg.reply_count} {t("replies", "réponses")}
          </button>
        )}
        {(msg.attachments ?? []).map((a: any) => (
          <div key={a.path} className="mt-1">
            {a.mime?.startsWith("image/") && urls[a.path] ? (
              <img src={urls[a.path]} alt={a.name} className="max-h-64 rounded border" />
            ) : (
              <a href={urls[a.path]} target="_blank" rel="noreferrer" className="text-xs underline text-primary">
                📎 {a.name}
              </a>
            )}
          </div>
        ))}
        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {Object.entries(msg.reactions as Record<string, string[]>).map(([e, users]) => (
              <button
                key={e}
                onClick={() => onReact(e)}
                className="text-xs bg-accent rounded-full px-2 py-0.5 hover:bg-accent/80"
              >
                {e} {users.length}
              </button>
            ))}
          </div>
        )}
        {showEmoji && (
          <div className="flex gap-1 mt-1">
            {EMOJIS.map((e) => (
              <button key={e} className="hover:scale-110 transition" onClick={() => { onReact(e); setShowEmoji(false); }}>
                {e}
              </button>
            ))}
          </div>
        )}
        {isOwn && !hidden && (
          <div className="mt-1">
            <MessageReceipts messageId={msg.id} ownerId={msg.sender_id} currentUserId={currentUserId} />
          </div>
        )}
      </div>
    </div>
  );
}
