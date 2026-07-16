import { useEditHistory } from "@/hooks/useOrgChat";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";

export function EditHistoryPopover({ messageId, count }: { messageId: string; count: number }) {
  const { data } = useEditHistory(messageId, count > 0);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="ml-1 text-[10px] italic text-muted-foreground hover:text-foreground">(edited)</button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2 max-h-72 overflow-auto">
        <div className="text-xs font-medium mb-1.5">Edit history ({count})</div>
        {(data?.history ?? []).map((h) => (
          <div key={h.id} className="border-t pt-1.5 mt-1.5 first:border-t-0 first:pt-0 first:mt-0">
            <div className="text-[10px] text-muted-foreground">
              {h.editor_name || "Unknown"} • {format(new Date(h.edited_at), "PPp")}
            </div>
            <div className="text-xs line-through text-muted-foreground whitespace-pre-wrap break-words">{h.previous_content}</div>
            <div className="text-xs whitespace-pre-wrap break-words">{h.new_content}</div>
          </div>
        ))}
        {(!data?.history || data.history.length === 0) && (
          <div className="text-xs text-muted-foreground">No history available.</div>
        )}
      </PopoverContent>
    </Popover>
  );
}
