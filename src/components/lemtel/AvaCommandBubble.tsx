import { useState } from "react";
import { ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Props {
  toolName: string;
  status: "input-streaming" | "input-available" | "output-available" | "output-error";
  input?: any;
  output?: any;
  error?: string;
}

export function AvaCommandBubble({ toolName, status, input, output, error }: Props) {
  const [open, setOpen] = useState(false);
  const variant =
    status === "output-error" ? "destructive" :
    status === "output-available" ? "default" : "secondary";

  return (
    <div className="glass-card rounded-lg p-3 my-2 border border-border/50">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-sm w-full text-left"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <Sparkles className="w-3 h-3 text-primary" />
        <span className="font-mono">{toolName}</span>
        <Badge variant={variant as any} className="ml-auto text-[10px]">
          {status.replace("-", " ")}
        </Badge>
      </button>
      {open && (
        <div className="mt-2 space-y-2 text-xs">
          {input && (
            <div>
              <div className="text-muted-foreground mb-1">Input</div>
              <pre className="bg-muted/40 p-2 rounded overflow-x-auto">{JSON.stringify(input, null, 2)}</pre>
            </div>
          )}
          {output && (
            <div>
              <div className="text-muted-foreground mb-1">Output</div>
              <pre className="bg-muted/40 p-2 rounded overflow-x-auto max-h-64">{JSON.stringify(output, null, 2)}</pre>
            </div>
          )}
          {error && <div className="text-destructive">{error}</div>}
        </div>
      )}
    </div>
  );
}
