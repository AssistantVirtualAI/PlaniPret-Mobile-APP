import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send } from "lucide-react";
import { useThread, type ChatMessage } from "@/hooks/useOrgChat";
import { format } from "date-fns";
import { toast } from "sonner";

export function ThreadPanel({
  parent,
  channelId,
  onClose,
}: {
  parent: ChatMessage | null;
  channelId: string | null;
  onClose: () => void;
}) {
  const open = !!parent;
  const { messages, reply } = useThread(parent?.id ?? null);
  const [text, setText] = useState("");

  async function send() {
    const c = text.trim();
    if (!c || !parent || !channelId) return;
    try {
      await reply.mutateAsync({ channel_id: channelId, content: c });
      setText("");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="p-4 border-b">
          <SheetTitle>Thread</SheetTitle>
        </SheetHeader>
        {parent && (
          <div className="px-4 py-3 border-b bg-muted/30">
            <div className="text-xs font-semibold text-muted-foreground">{parent.sender_name}</div>
            <div className="text-sm whitespace-pre-wrap">{parent.content}</div>
          </div>
        )}
        <ScrollArea className="flex-1 px-4 py-3">
          <div className="space-y-3">
            {messages.map((m) => (
              <div key={m.id} className="text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold">{m.sender_name}</span>
                  <span className="text-[10px] text-muted-foreground">{format(new Date(m.created_at), "HH:mm")}</span>
                </div>
                <div className="whitespace-pre-wrap">{m.content}</div>
              </div>
            ))}
            {messages.length === 0 && <div className="text-xs text-muted-foreground">No replies yet.</div>}
          </div>
        </ScrollArea>
        <div className="p-3 border-t flex gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Reply…"
            className="min-h-[60px]"
          />
          <Button size="icon" onClick={send} disabled={reply.isPending}><Send className="h-4 w-4" /></Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
