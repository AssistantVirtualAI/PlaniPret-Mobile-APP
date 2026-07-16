import { useState } from "react";
import { ConsolePageHeader } from "@/components/console/ConsolePageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Bot, Send, ShieldCheck, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LEMTEL_ORG } from "@/hooks/usePbxData";
import { useToast } from "@/hooks/use-toast";
import { logAdminAction } from "@/lib/pbx/auditLog";

type ChatResult = {
  answer: string;
  source?: { id?: string; resolved_domain?: string | null; tables?: string[] };
  proposal?: { label: string; action: string; body: Record<string, unknown>; risk?: string } | null;
};

const QUICK_ACTIONS: { label: string; prompt: string }[] = [
  { label: "How many extensions?", prompt: "How many extensions are currently synced for the Lemtel domain? Break the total down by enabled vs disabled." },
  { label: "Last sync time", prompt: "When were the extensions last synced? Show the most recent last_synced_at timestamp and how stale it is." },
  { label: "Missing sources", prompt: "Which extensions are missing a source/origin tag or have no last_synced_at value? List up to 10 by extension number." },
  { label: "Recently updated", prompt: "Show the 5 extensions with the most recent last_synced_at and their effective_caller_id_name." },
];

export default function ConsoleChatbot() {
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ChatResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [executing, setExecuting] = useState(false);
  const { toast } = useToast();

  const ask = async (overridePrompt?: string) => {
    const prompt = (overridePrompt ?? message).trim();
    if (!prompt) return;
    if (overridePrompt) setMessage(overridePrompt);
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("pbx-admin-chatbot", {
        body: { message: prompt, organization_id: LEMTEL_ORG },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult(data as ChatResult);
    } catch (e: any) {
      toast({ title: "Chatbot failed", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const confirmProposal = async () => {
    if (!result?.proposal) return;
    setExecuting(true);
    try {
      const { data, error } = await supabase.functions.invoke("fusionpbx-proxy", { body: result.proposal.body });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).message || (data as any).error);
      await logAdminAction({
        organizationId: LEMTEL_ORG,
        entityType: "pbx_sync",
        action: `chatbot.${result.proposal.action}`,
        source: "copilot",
        after: data,
        result: "ok",
        metadata: { prompt: message, proposal: result.proposal },
      });
      toast({ title: "Action completed", description: result.proposal.label });
      setResult({ ...result, proposal: null });
    } catch (e: any) {
      toast({ title: "Action failed", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div>
      <ConsolePageHeader title="PBX Chatbot" description="Natural-language PBX answers with confirmable admin actions." sourceId="extensions" hasData />
      <div className="p-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Bot className="h-4 w-4" /> Ask PBX</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Show me extension health, sync status, users, queues, IVRs…"
              className="min-h-32"
            />
            <div className="flex flex-wrap gap-2">
              {QUICK_ACTIONS.map((qa) => (
                <Button
                  key={qa.label}
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => ask(qa.prompt)}
                >
                  {qa.label}
                </Button>
              ))}
            </div>
            <Button onClick={() => ask()} disabled={busy || !message.trim()}>
              <Send className="h-4 w-4 mr-2" /> {busy ? "Asking…" : "Ask"}
            </Button>
            {result && (
              <div className="rounded-md border p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium"><Sparkles className="h-4 w-4" /> Answer</div>
                <p className="text-sm whitespace-pre-wrap">{result.answer}</p>
                {result.source && (
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{result.source.id ?? "source"}</Badge>
                    {result.source.resolved_domain && <Badge variant="outline">domain resolved</Badge>}
                    {(result.source.tables ?? []).map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Confirmation</CardTitle>
          </CardHeader>
          <CardContent>
            {result?.proposal ? (
              <div className="space-y-3">
                <div className="rounded-md border p-3">
                  <div className="font-medium text-sm">{result.proposal.label}</div>
                  <div className="text-xs text-muted-foreground mt-1">{result.proposal.action} · risk {result.proposal.risk ?? "low"}</div>
                </div>
                <Button onClick={confirmProposal} disabled={executing} className="w-full">
                  {executing ? "Running…" : "Confirm action"}
                </Button>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No pending action.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
