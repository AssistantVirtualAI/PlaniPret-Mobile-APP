import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, X, Minus, Plus, MessagesSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import MascotRobot from "./MascotRobot";
import { useMascotChat } from "./useMascotChat";

type Thread = { id: string; title: string; last_message_at: string };

function partsToText(parts: any[] | undefined): string {
  if (!parts) return "";
  return parts.map((p) => (p?.type === "text" ? p.text : "")).join("");
}

export default function MascotPanel({
  open, onClose, onMinimize,
}: { open: boolean; onClose: () => void; onMinimize: () => void }) {
  const navigate = useNavigate();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string>(() => crypto.randomUUID());
  const [input, setInput] = useState("");
  const [showThreads, setShowThreads] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const { messages, sendMessage, status, ready } = useMascotChat(activeId);

  // load threads
  const refreshThreads = async () => {
    const { data } = await supabase
      .from("mascot_threads")
      .select("id,title,last_message_at")
      .order("last_message_at", { ascending: false })
      .limit(50);
    setThreads(data || []);
  };
  useEffect(() => { if (open) refreshThreads(); }, [open]);

  // persist new threads on first user message + autoscroll + handle navigate tool
  useEffect(() => {
    if (!messages.length) return;
    const last = messages[messages.length - 1];
    // autoscroll
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 9e9, behavior: "smooth" }));
    // navigate tool
    for (const p of (last as any).parts || []) {
      if (p?.type?.startsWith("tool-") && p.toolName === "navigate" && p.output?.navigate_to) {
        navigate(p.output.navigate_to);
      }
    }
  }, [messages, navigate]);

  const persistOnFinish = async () => {
    const first = messages.find((m) => m.role === "user");
    if (!first) return;
    const title = partsToText((first as any).parts).slice(0, 60) || "New chat";
    await supabase.from("mascot_threads").upsert({
      id: activeId, title, last_message_at: new Date().toISOString(),
      user_id: (await supabase.auth.getUser()).data.user?.id,
    }, { onConflict: "id" });
    refreshThreads();
  };
  useEffect(() => {
    if (status === "ready" && messages.length > 1) persistOnFinish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const send = async () => {
    const text = input.trim();
    if (!text || !ready) return;
    setInput("");
    await sendMessage({ text });
    requestAnimationFrame(() => taRef.current?.focus());
  };

  const startNew = () => {
    setActiveId(crypto.randomUUID());
    setShowThreads(false);
    requestAnimationFrame(() => taRef.current?.focus());
  };

  const talking = status === "streaming";
  const listening = status === "submitted";

  if (!open) return null;
  return (
    <Card className="fixed top-36 right-4 z-[60] w-[380px] h-[560px] max-h-[80vh] flex flex-col overflow-hidden border-primary/30 shadow-2xl backdrop-blur-xl bg-background/95 animate-in fade-in slide-in-from-top-4">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-gradient-to-r from-primary/10 to-transparent">
        <div className="w-10 h-10 shrink-0">
          <MascotRobot talking={talking} listening={listening} compact />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold leading-tight">Lemtel</div>
          <div className="text-[11px] text-muted-foreground leading-tight">
            {talking ? "thinking…" : listening ? "listening…" : "your mascot assistant"}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowThreads((v) => !v)} title="History">
          <MessagesSquare className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={startNew} title="New chat">
          <Plus className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onMinimize} title="Minimize">
          <Minus className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} title="Close">
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Thread list overlay */}
      {showThreads && (
        <div className="absolute inset-x-0 top-[52px] bottom-0 bg-background/98 backdrop-blur-xl z-10 overflow-auto">
          <div className="p-2 text-xs uppercase text-muted-foreground tracking-wide">Recent chats</div>
          {threads.length === 0 ? (
            <div className="px-3 py-6 text-sm text-muted-foreground text-center">No history yet.</div>
          ) : threads.map((t) => (
            <button
              key={t.id}
              onClick={() => { setActiveId(t.id); setShowThreads(false); }}
              className={cn(
                "w-full text-left px-3 py-2 hover:bg-muted/50 border-b border-border/40 text-sm truncate",
                t.id === activeId && "bg-muted"
              )}
            >
              {t.title}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div ref={scrollRef as any} className="p-3 space-y-3">
          {messages.length === 0 && (
            <div className="text-sm text-muted-foreground space-y-2">
              <p>👋 Hi! I'm <b>Lemtel</b>. I can help you run the platform — create clients, agents, extensions, IVRs, queues, pull reports… just ask.</p>
              <p className="text-xs">Try: <i>"create a new client called Acme Corp"</i> or <i>"show me last week's call stats"</i>.</p>
            </div>
          )}
          {messages.map((m) => {
            const text = partsToText((m as any).parts);
            const toolParts = ((m as any).parts || []).filter((p: any) => p?.type?.startsWith("tool-"));
            return (
              <div key={m.id} className={cn("flex flex-col gap-1", m.role === "user" ? "items-end" : "items-start")}>
                <div className={cn(
                  "max-w-[88%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-muted text-foreground rounded-bl-sm"
                )}>
                  {text || (m.role === "assistant" && talking ? "…" : "")}
                </div>
                {toolParts.map((tp: any, i: number) => (
                  <div key={i} className="text-[11px] text-muted-foreground px-2 py-1 rounded border border-border/40 bg-card/50 max-w-[88%]">
                    <span className="font-mono">⚙ {tp.toolName}</span>
                    {tp.state === "output-available" && <span className="opacity-70"> · done</span>}
                    {tp.state === "input-available" && <span className="opacity-70"> · running…</span>}
                    {tp.state === "output-error" && <span className="text-destructive"> · error</span>}
                  </div>
                ))}
              </div>
            );
          })}
          {listening && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" /> Lemtel is thinking…
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Composer */}
      <div className="border-t p-2 flex gap-2 items-end">
        <Textarea
          ref={taRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          placeholder={ready ? "Ask Lemtel anything…" : "Connecting…"}
          disabled={!ready || talking}
          className="resize-none min-h-[40px] max-h-32"
        />
        <Button size="icon" onClick={send} disabled={!input.trim() || talking || !ready}>
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </Card>
  );
}
