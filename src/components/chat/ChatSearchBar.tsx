import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search } from "lucide-react";
import { useChatSearch, type ChatMessage } from "@/hooks/useOrgChat";
import { format } from "date-fns";

export function ChatSearchBar({ onJump }: { onJump?: (m: ChatMessage) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const search = useChatSearch();
  const results = (search.data?.messages ?? []) as ChatMessage[];

  function run(v: string) {
    setQ(v);
    if (v.trim().length < 2) return;
    setOpen(true);
    search.mutate({ query: v.trim() });
  }

  return (
    <Popover open={open && results.length > 0} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative w-full">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => run(e.target.value)}
            placeholder="Search messages…"
            className="h-8 pl-7 text-xs"
          />
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[360px] p-0">
        <ScrollArea className="max-h-[320px]">
          <div className="p-1">
            {results.map((m) => (
              <button
                key={m.id}
                onClick={() => { onJump?.(m); setOpen(false); }}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-muted text-xs space-y-0.5"
              >
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>{m.sender_name}</span>
                  <span>{format(new Date(m.created_at), "MMM d, HH:mm")}</span>
                </div>
                <div className="line-clamp-2">{m.content}</div>
              </button>
            ))}
            {!search.isPending && results.length === 0 && q && (
              <div className="px-2 py-3 text-xs text-muted-foreground">No results</div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
