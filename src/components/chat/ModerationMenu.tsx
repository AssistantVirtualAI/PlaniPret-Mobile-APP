import { useState } from "react";
import { MoreVertical, Flag, EyeOff, Eye, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useReportMessage, useBlockedUsers, useModerateMessage } from "@/hooks/useOrgChat";
import { toast } from "sonner";

export function ModerationMenu({
  messageId, senderId, isOwn, isAdmin, isHidden,
}: {
  messageId: string; senderId: string; isOwn: boolean; isAdmin: boolean; isHidden: boolean;
}) {
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState("");
  const report = useReportMessage();
  const { block, blockedIds, unblock } = useBlockedUsers();
  const { hide, unhide } = useModerateMessage();
  const isBlocked = blockedIds.has(senderId);

  const onReport = async () => {
    if (!reason.trim()) return;
    try { await report.mutateAsync({ message_id: messageId, reason: reason.trim() }); toast.success("Reported"); setReportOpen(false); setReason(""); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="h-6 w-6"><MoreVertical className="h-3 w-3" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {!isOwn && (
            <DropdownMenuItem onClick={() => setReportOpen(true)}>
              <Flag className="h-3.5 w-3.5 mr-2" /> Report message
            </DropdownMenuItem>
          )}
          {!isOwn && (
            isBlocked
              ? <DropdownMenuItem onClick={() => unblock.mutate(senderId)}><UserX className="h-3.5 w-3.5 mr-2" /> Unblock sender</DropdownMenuItem>
              : <DropdownMenuItem onClick={() => block.mutate(senderId)}><UserX className="h-3.5 w-3.5 mr-2" /> Block sender</DropdownMenuItem>
          )}
          {isAdmin && <DropdownMenuSeparator />}
          {isAdmin && (
            isHidden
              ? <DropdownMenuItem onClick={() => unhide.mutate(messageId)}><Eye className="h-3.5 w-3.5 mr-2" /> Unhide</DropdownMenuItem>
              : <DropdownMenuItem onClick={() => hide.mutate({ message_id: messageId, reason: "Hidden by moderator" })}><EyeOff className="h-3.5 w-3.5 mr-2" /> Hide for everyone</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Report message</DialogTitle></DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you reporting this message?" rows={4} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportOpen(false)}>Cancel</Button>
            <Button onClick={onReport} disabled={!reason.trim() || report.isPending}>Send report</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
