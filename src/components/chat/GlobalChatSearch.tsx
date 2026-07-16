import { useState } from "react";
import { Search, Hash, AtSign, Users as UsersIcon } from "lucide-react";
import DOMPurify from "dompurify";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useGlobalChatSearch } from "@/hooks/useOrgChat";
import { ScrollArea } from "@/components/ui/scroll-area";

export function GlobalChatSearch({
  onPickMessage,
  onPickUser,
}: {
  onPickMessage: (m: { id: string; channel_id: string }) => void;
  onPickUser: (u: { user_id: string }) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const search = useGlobalChatSearch();

  const run = async (val: string) => {
    setQ(val);
    if (val.trim().length < 2) return;
    setOpen(true);
    try { await search.mutateAsync(val); } catch {}
  };

  const data: any = search.data ?? { messages: [], users: [] };

  return (
    <Popover open={open && q.length >= 2} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative w-full">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => run(e.target.value)}
            onFocus={() => q.length >= 2 && setOpen(true)}
            placeholder="Search messages and people…"
            className="h-8 text-xs pl-7"
          />
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[360px] p-0">
        <ScrollArea className="max-h-96">
          {search.isPending && <div className="p-3 text-xs text-muted-foreground">Searching…</div>}
          {!search.isPending && data.users?.length === 0 && data.messages?.length === 0 && (
            <div className="p-3 text-xs text-muted-foreground">No results</div>
          )}
          {data.users?.length > 0 && (
            <div className="p-2">
              <div className="text-[10px] uppercase text-muted-foreground px-1 mb-1">People</div>
              {data.users.map((u: any) => (
                <button key={u.user_id} onClick={() => { onPickUser(u); setOpen(false); setQ(""); }}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-accent text-xs flex items-center gap-2">
                  <AtSign className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium">{u.full_name || u.email}</span>
                  {u.extension && <span className="ml-auto text-muted-foreground text-[10px]">Ext {u.extension}</span>}
                </button>
              ))}
            </div>
          )}
          {data.messages?.length > 0 && (
            <div className="p-2 border-t">
              <div className="text-[10px] uppercase text-muted-foreground px-1 mb-1">Messages</div>
              {data.messages.map((m: any) => (
                <button key={m.id} onClick={() => { onPickMessage(m); setOpen(false); setQ(""); }}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-accent text-xs">
                  <div className="flex items-center gap-1 text-muted-foreground text-[10px]">
                    {m.channel_type === "dm" ? <AtSign className="h-2.5 w-2.5" /> : m.channel_type === "private" ? <UsersIcon className="h-2.5 w-2.5" /> : <Hash className="h-2.5 w-2.5" />}
                    {m.channel_name} • {m.sender_name}
                  </div>
                  <div className="text-xs" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(m.snippet || m.content || "", { ALLOWED_TAGS: ["mark", "b", "strong", "em", "i"], ALLOWED_ATTR: [] }) }} />
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
