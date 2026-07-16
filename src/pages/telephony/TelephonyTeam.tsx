import { useState, useMemo, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Send, Phone, MessageSquare, Users, Plus, Hash, Lock } from 'lucide-react';
import { useTeamPresence, type TeamMember } from '@/hooks/useTeamPresence';
import { useOrgChat } from '@/hooks/useOrgChat';
import { usePresence } from '@/hooks/usePresence';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

const LEMTEL_ORG = '71755d33-ed64-4ad5-a828-61c9d2029eb7';

const statusColors: Record<string, string> = {
  available: 'bg-green-500',
  busy: 'bg-amber-500',
  away: 'bg-slate-400',
  dnd: 'bg-red-500',
  out_of_office: 'bg-purple-500',
  offline: 'bg-muted-foreground/40',
};

function PresenceDot({ status }: { status: string }) {
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full ${statusColors[status] || statusColors.offline}`} />
  );
}

function MemberRow({ m }: { m: TeamMember }) {
  const initials = (m.display_name || m.email || '?').slice(0, 2).toUpperCase();
  return (
    <div className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition">
      <div className="relative">
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold">
          {initials}
        </div>
        <span className="absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-background">
          <PresenceDot status={m.status} />
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{m.display_name || m.email || 'Unknown'}</div>
        <div className="text-xs text-muted-foreground truncate">
          {m.status_emoji ? `${m.status_emoji} ` : ''}{m.status_message || `${m.status}${m.call_state !== 'idle' ? ` · ${m.call_state}` : ''}`}
        </div>
      </div>
      {m.extension && (
        <a href={`tel:${m.extension}`} className="inline-flex">
          <Button variant="ghost" size="icon" className="h-8 w-8"><Phone className="w-3.5 h-3.5" /></Button>
        </a>
      )}
    </div>
  );
}

function PresenceList() {
  const { members, loading } = useTeamPresence(LEMTEL_ORG);
  const [filter, setFilter] = useState<'all' | 'online' | 'busy'>('all');
  const [q, setQ] = useState('');

  const sorted = useMemo(() => {
    const list = members
      .filter((m) => {
        if (filter === 'online') return m.status === 'available';
        if (filter === 'busy') return ['busy', 'dnd'].includes(m.status) || m.call_state !== 'idle';
        return true;
      })
      .filter((m) => {
        if (!q) return true;
        const s = q.toLowerCase();
        return (
          (m.display_name || '').toLowerCase().includes(s) ||
          (m.email || '').toLowerCase().includes(s) ||
          (m.extension || '').includes(s)
        );
      });
    return list.sort((a, b) => {
      const rank: Record<string, number> = { available: 0, busy: 1, dnd: 2, away: 3, out_of_office: 4, offline: 5 };
      return (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
    });
  }, [members, filter, q]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center">
        <Input placeholder="Search team…" value={q} onChange={(e) => setQ(e.target.value)} className="flex-1" />
        <div className="flex gap-1">
          {(['all', 'online', 'busy'] as const).map((f) => (
            <Button key={f} variant={filter === f ? 'default' : 'outline'} size="sm" onClick={() => setFilter(f)}>
              {f}
            </Button>
          ))}
        </div>
      </div>
      <Card>
        <CardContent className="p-2">
          {loading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading team…</div>
          ) : sorted.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No teammates match
            </div>
          ) : (
            <ScrollArea className="h-[60vh]">
              <div className="space-y-1">
                {sorted.map((m) => <MemberRow key={m.user_id} m={m} />)}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ChatPane() {
  const { user } = useAuth();
  const { channels, activeChannelId, setActiveChannelId, messages, loading, sendMessage, createChannel } = useOrgChat(LEMTEL_ORG);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!activeChannelId && channels[0]) setActiveChannelId(channels[0].id);
  }, [channels, activeChannelId, setActiveChannelId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    await sendMessage(text);
  };

  const handleCreateChannel = async () => {
    const name = window.prompt('Channel name (e.g. general)')?.trim();
    if (!name) return;
    const ch = await createChannel(name.replace(/^#/, ''), 'public');
    if (ch?.id) { setActiveChannelId(ch.id); toast.success(`#${name} created`); }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3 h-[65vh]">
      <Card>
        <CardContent className="p-2">
          <div className="flex items-center justify-between px-1 mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Channels</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCreateChannel}>
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
          <ScrollArea className="h-[58vh]">
            <div className="space-y-0.5">
              {channels.length === 0 && (
                <div className="text-xs text-muted-foreground px-2 py-4">
                  No channels yet. Create one to get started.
                </div>
              )}
              {channels.map((c) => {
                const Icon = c.channel_type === 'private' ? Lock : Hash;
                return (
                  <button
                    key={c.id}
                    onClick={() => setActiveChannelId(c.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left hover:bg-muted/60 ${
                      activeChannelId === c.id ? 'bg-muted font-medium' : ''
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 opacity-70" />
                    <span className="truncate">{c.name}</span>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="flex flex-col">
        <CardContent className="flex-1 flex flex-col p-0">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {!activeChannelId ? (
              <div className="text-center text-sm text-muted-foreground py-20">
                <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-30" />
                Select or create a channel to start chatting
              </div>
            ) : loading ? (
              <div className="text-sm text-muted-foreground">Loading messages…</div>
            ) : messages.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-10">No messages yet — say hello 👋</div>
            ) : (
              messages.map((m) => {
                const mine = m.sender_id === user?.id;
                return (
                  <div key={m.id} className={`flex gap-2 ${mine ? 'justify-end' : ''}`}>
                    {!mine && (
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-semibold shrink-0">
                        {(m.sender_name || '?').slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className={`max-w-[70%] ${mine ? 'items-end' : ''}`}>
                      {!mine && (
                        <div className="text-[11px] text-muted-foreground mb-0.5">
                          {m.sender_name || 'Unknown'} · {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                        </div>
                      )}
                      <div className={`rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                        mine ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted rounded-bl-sm'
                      }`}>
                        {m.content}
                      </div>
                      {mine && (
                        <div className="text-[10px] text-muted-foreground mt-0.5 text-right">
                          {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {activeChannelId && (
            <div className="border-t p-2 flex gap-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Type a message…"
                className="flex-1"
              />
              <Button onClick={handleSend} disabled={!draft.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function TelephonyTeam() {
  // Push own presence while page is open
  usePresence({ status: 'available' });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Users className="w-7 h-7" /> Team
        </h1>
        <p className="text-muted-foreground text-sm">See who's online and chat with your team in real-time</p>
      </div>

      <Tabs defaultValue="presence">
        <TabsList>
          <TabsTrigger value="presence"><Users className="w-4 h-4 mr-1.5" /> Presence</TabsTrigger>
          <TabsTrigger value="chat"><MessageSquare className="w-4 h-4 mr-1.5" /> Chat</TabsTrigger>
        </TabsList>
        <TabsContent value="presence" className="mt-4"><PresenceList /></TabsContent>
        <TabsContent value="chat" className="mt-4"><ChatPane /></TabsContent>
      </Tabs>
    </div>
  );
}
