import { Eye } from "lucide-react";
import { useMessageReceipts } from "@/hooks/useOrgChat";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format } from "date-fns";

export function MessageReceipts({ messageId, ownerId, currentUserId }: { messageId: string; ownerId: string; currentUserId: string }) {
  const isOwn = ownerId === currentUserId;
  const { data } = useMessageReceipts(messageId, isOwn);
  if (!isOwn) return null;
  const receipts = (data?.receipts ?? []).filter((r) => r.user_id !== ownerId);
  if (receipts.length === 0) {
    return <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Eye className="h-2.5 w-2.5" /></span>;
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
          <Eye className="h-2.5 w-2.5" />
          {receipts.length}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <div className="text-xs font-medium mb-1.5">Read by</div>
        <div className="space-y-1 max-h-48 overflow-auto">
          {receipts.map((r) => (
            <div key={r.user_id} className="flex items-center gap-2">
              <Avatar className="h-5 w-5">
                <AvatarImage src={r.avatar_url ?? undefined} />
                <AvatarFallback className="text-[9px]">{(r.full_name || "?").slice(0, 1)}</AvatarFallback>
              </Avatar>
              <span className="text-xs flex-1 truncate">{r.full_name || r.user_id.slice(0, 6)}</span>
              <span className="text-[10px] text-muted-foreground">{format(new Date(r.read_at), "p")}</span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
