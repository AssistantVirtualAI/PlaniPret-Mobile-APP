import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Send, Loader2, X, MessageCircle, Trash2, Zap, ZapOff, FileText, ShieldAlert, Phone, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Attachment = { kind: string; title?: string; filename?: string; url: string };
type ToolResult = { name: string; output: any };
type Msg = { role: "user" | "assistant"; content: string; attachments?: Attachment[]; toolResults?: ToolResult[] };
type PageContext = {
  path: string;
  page: "voicemail" | "calls" | "recordings" | "other";
  voicemail_id?: string;
  call_id?: string;
  recording_id?: string;
};

function usePageContext(): PageContext {
  const loc = useLocation();
  return useMemo(() => {
    const params = new URLSearchParams(loc.search);
    const path = loc.pathname;
    let page: PageContext["page"] = "other";
    if (path.includes("/voicemail")) page = "voicemail";
    else if (path.includes("/calls")) page = "calls";
    else if (path.includes("/recordings")) page = "recordings";
    return {
      path,
      page,
      voicemail_id: params.get("vm") ?? undefined,
      call_id: params.get("call") ?? undefined,
      recording_id: params.get("rec") ?? undefined,
    };
  }, [loc.pathname, loc.search]);
}

const AUTO_ANSWER_KEY = "ava.autoAnswerOnDetail";

export function useAutoAnswerSetting(): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(AUTO_ANSWER_KEY) === "1";
  });
  const update = (v: boolean) => {
    setOn(v);
    try { window.localStorage.setItem(AUTO_ANSWER_KEY, v ? "1" : "0"); } catch {}
  };
  return [on, update];
}

function autoPromptFor(ctx: PageContext): string | null {
  if (ctx.voicemail_id) return "Auto-brief me on this voicemail: caller, key points, urgency, and suggested reply.";
  if (ctx.call_id) return "Auto-brief me on this call: summary, sentiment, and action items.";
  if (ctx.recording_id) return "Auto-brief me on this recording: summary and key topics.";
  return null;
}



const SUGGESTIONS = [
  "Summarize my calls today",
  "Show my unread voicemails",
  "Generate a voicemail greeting saying: Hi, you've reached me, please leave a message",
  "Analyze my recent call sentiment",
];

export function MyAIChat({
  embedded = false,
  onClose,
  initialPrompt,
  onPromptConsumed,
}: {
  embedded?: boolean;
  onClose?: () => void;
  initialPrompt?: string | null;
  onPromptConsumed?: () => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageContext = usePageContext();
  const [autoAnswer, setAutoAnswer] = useAutoAnswerSetting();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const contextSuggestions = useMemo(() => {
    if (pageContext.page === "voicemail" && pageContext.voicemail_id) {
      return [
        "Summarize this voicemail",
        "Transcribe this voicemail",
        "What does the caller want?",
        "Draft a reply for this voicemail",
      ];
    }
    if (pageContext.page === "calls" && pageContext.call_id) {
      return ["Summarize this call", "What was the sentiment?", "List action items from this call"];
    }
    if (pageContext.page === "recordings" && pageContext.recording_id) {
      return ["Summarize this recording", "Transcribe this recording", "Key topics in this recording"];
    }
    return SUGGESTIONS;
  }, [pageContext]);

  const [pendingConfirm, setPendingConfirm] = useState<{ name: string; preview: any } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [rDays, setRDays] = useState<"7" | "30">("7");
  const [rGroup, setRGroup] = useState<"day" | "extension">("day");
  const [rExt, setRExt] = useState("");

  const send = useCallback(async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || loading) return;
    setInput("");
    const newMsgs: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(newMsgs);
    setLoading(true);
    try {
      // Unified ava-assistant: full PBX tool catalog across mobile / desktop / web.
      const { data, error } = await supabase.functions.invoke("ava-assistant", {
        body: { messages: newMsgs.map(({ role, content }) => ({ role, content })), pageContext },
      });
      if (error) throw error;
      if (data?.error === "rate_limited") { toast.error("Rate limit reached. Try again in a moment."); return; }
      if (data?.error === "ai_credits_exhausted") { toast.error("AI credits exhausted — please add credits."); return; }
      if (data?.error) { toast.error(data.error); return; }
      const toolResults: ToolResult[] = data?.toolResults ?? [];
      setMessages([...newMsgs, {
        role: "assistant",
        content: data?.answer ?? data?.message ?? "(no response)",
        attachments: data?.attachments,
        toolResults,
      }]);
      // Detect a pending confirmation request from any mutating tool
      const confirmTr = toolResults.find((t) => t?.output?.requires_confirmation);
      if (confirmTr) {
        setPendingConfirm({ name: confirmTr.name, preview: confirmTr.output.preview });
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to reach assistant");
    } finally { setLoading(false); }
  }, [input, loading, messages, pageContext]);

  const submitReport = useCallback(() => {
    const ext = rExt.trim();
    const prompt = `Generate a downloadable PDF call report for the last ${rDays} days, grouped by ${rGroup}${ext ? `, for extension ${ext}` : ""}. Use the generate_report_pdf tool and return the download link.`;
    setReportOpen(false);
    send(prompt);
  }, [rDays, rGroup, rExt, send]);

  const confirmAction = useCallback(() => {
    const c = pendingConfirm;
    setPendingConfirm(null);
    if (!c) return;
    send(`Yes, confirm. Re-call ${c.name} with confirm:true and the exact same parameters now.`);
  }, [pendingConfirm, send]);

  const cancelAction = useCallback(() => {
    const c = pendingConfirm;
    setPendingConfirm(null);
    if (!c) return;
    send(`Cancel — do not execute ${c.name}. Acknowledge in one sentence.`);
  }, [pendingConfirm, send]);

  // Auto-send a one-shot prompt requested by the launcher (e.g. on auto-answer open)
  const consumedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialPrompt) return;
    if (consumedRef.current === initialPrompt) return;
    consumedRef.current = initialPrompt;
    send(initialPrompt);
    onPromptConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  return (
    <Card className={cn("flex flex-col bg-background/95 backdrop-blur", embedded ? "h-[600px]" : "h-full")}>
      <header className="flex items-center justify-between px-4 py-2.5 border-b">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">AVA Assistant</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => {
              setAutoAnswer(!autoAnswer);
              toast.success(autoAnswer ? "Auto-answer off" : "Auto-answer on — I'll brief detail pages automatically");
            }}
            title={autoAnswer ? "Auto-answer on (click to disable)" : "Auto-answer off (click to enable)"}
          >
            {autoAnswer ? <Zap className="h-3.5 w-3.5 text-primary" /> : <ZapOff className="h-3.5 w-3.5" />}
          </Button>
          {messages.length > 0 && (
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setMessages([])} title="Clear">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
          {onClose && (
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </header>

      {(pageContext.voicemail_id || pageContext.call_id || pageContext.recording_id) && (
        <div className="px-4 py-1.5 text-[11px] text-primary bg-primary/5 border-b flex items-center gap-1.5">
          <Sparkles className="h-3 w-3" />
          Context: {pageContext.page}
          {pageContext.voicemail_id && ` · vm ${pageContext.voicemail_id.slice(0, 8)}`}
          {pageContext.call_id && ` · call ${pageContext.call_id.slice(0, 8)}`}
          {pageContext.recording_id && ` · rec ${pageContext.recording_id.slice(0, 8)}`}
        </div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Hi! I can summarize your calls, manage your voicemail greeting, and analyze recent activity. Try:
            </p>
            <div className="flex flex-col gap-1.5">
              {contextSuggestions.map((s) => (
                <button key={s} onClick={() => send(s)}
                  className="text-left text-xs p-2 rounded border hover:border-primary/50 hover:bg-accent transition">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => {
          const denials = (m.toolResults ?? []).filter((t) => t?.output?.error);
          return (
            <div key={i} className={cn("flex flex-col gap-1", m.role === "user" ? "items-end" : "items-start")}>
              <div className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
              )}>
                {m.role === "assistant"
                  ? <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_h3]:my-1"><ReactMarkdown>{m.content}</ReactMarkdown></div>
                  : <span className="whitespace-pre-wrap">{m.content}</span>}
                {m.attachments && m.attachments.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1">
                    {m.attachments.map((a, j) => (
                      <a key={j} href={a.url} target="_blank" rel="noopener noreferrer" download={a.filename}
                         className="text-xs inline-flex items-center gap-1.5 px-2 py-1 rounded border bg-background hover:bg-accent">
                        📄 {a.title || a.filename || "Download"}
                      </a>
                    ))}
                  </div>
                )}
              </div>
              {denials.map((d, j) => (
                <div key={j} className="max-w-[85%] text-[11px] flex items-start gap-1.5 px-2 py-1.5 rounded border border-destructive/30 bg-destructive/5 text-destructive">
                  <ShieldAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span><b>{d.name}</b> blocked: {friendlyDenial(d.output)}</span>
                </div>
              ))}
            </div>
          );
        })}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg px-3 py-2 text-sm flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
            </div>
          </div>
        )}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(); }}
        className="flex items-center gap-2 p-3 border-t">
        <Popover open={reportOpen} onOpenChange={setReportOpen}>
          <PopoverTrigger asChild>
            <Button type="button" size="icon" variant="ghost" title="Generate PDF report" disabled={loading}>
              <FileText className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 space-y-2">
            <div className="text-xs font-semibold">Generate PDF report</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-muted-foreground">Range</label>
                <Select value={rDays} onValueChange={(v) => setRDays(v as "7" | "30")}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="30">Last 30 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Group by</label>
                <Select value={rGroup} onValueChange={(v) => setRGroup(v as "day" | "extension")}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Day</SelectItem>
                    <SelectItem value="extension">Extension</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Extension (optional)</label>
              <Input value={rExt} onChange={(e) => setRExt(e.target.value)} className="h-8 text-xs" placeholder="e.g. 1001" />
            </div>
            <Button type="button" size="sm" className="w-full" onClick={submitReport}>
              <FileText className="h-3.5 w-3.5 mr-1.5" /> Generate report
            </Button>
          </PopoverContent>
        </Popover>
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask AVA…" disabled={loading} />
        <Button type="submit" size="icon" disabled={loading || !input.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>

      <Dialog open={!!pendingConfirm} onOpenChange={(o) => !o && cancelAction()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {pendingConfirm?.name === "click_to_call" ? <Phone className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
              Confirm {pendingConfirm?.name === "click_to_call" ? "outbound call" : "SMS send"}
            </DialogTitle>
            <DialogDescription>
              AVA needs your explicit approval before this action runs on the PBX.
            </DialogDescription>
          </DialogHeader>
          {pendingConfirm && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
              {Object.entries(pendingConfirm.preview ?? {}).map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-xs font-medium text-muted-foreground w-28 shrink-0">{k}</span>
                  <span className="text-xs break-all">{String(v)}</span>
                </div>
              ))}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={cancelAction}>Cancel</Button>
            <Button onClick={confirmAction}>Confirm & execute</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

const DENIAL_MESSAGES: Record<string, string> = {
  no_pbx_domain: "Your account is not linked to a PBX domain.",
  no_extension_linked: "This action needs a linked extension on your softphone profile.",
  forbidden: "This item is outside your PBX domain.",
  forbidden_cross_domain: "This item belongs to a different organization.",
  not_found: "The target item could not be found in your domain.",
  no_recording: "No recording is available for this call.",
};

function friendlyDenial(output: any): string {
  const code = String(output?.reason || output?.error || "");
  return DENIAL_MESSAGES[code] || code || "Unknown reason.";
}

export function MyAIChatLauncher() {
  const [open, setOpen] = useState(false);
  const [initialPrompt, setInitialPrompt] = useState<string | null>(null);
  const [autoAnswer] = useAutoAnswerSetting();
  const pageContext = usePageContext();
  const lastHandledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!autoAnswer) return;
    const id = pageContext.voicemail_id || pageContext.call_id || pageContext.recording_id;
    if (!id) return;
    const key = `${pageContext.page}:${id}`;
    if (lastHandledRef.current === key) return;
    const prompt = autoPromptFor(pageContext);
    if (!prompt) return;
    lastHandledRef.current = key;
    setInitialPrompt(prompt);
    setOpen(true);
  }, [autoAnswer, pageContext]);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="lg"
        className="fixed bottom-5 right-5 z-40 rounded-full h-14 w-14 shadow-2xl shadow-primary/30 p-0"
        aria-label="Open AVA assistant"
      >
        <Sparkles className="h-6 w-6" />
        {autoAnswer && <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-500 border-2 border-background" />}
      </Button>
      {open && (
        <div className="fixed bottom-24 right-5 z-50 w-[380px] max-w-[calc(100vw-2.5rem)] h-[560px] max-h-[calc(100vh-8rem)] shadow-2xl rounded-lg overflow-hidden">
          <MyAIChat
            onClose={() => setOpen(false)}
            initialPrompt={initialPrompt}
            onPromptConsumed={() => setInitialPrompt(null)}
          />
        </div>
      )}
    </>
  );
}
