import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  PlayCircle, Wand2, Trash2, CheckCircle2, Library, Plus,
  RefreshCw, Loader2, AlertCircle, XCircle, Clock, Info, Ban,
} from "lucide-react";
import { useGreetingsLibrary, useGreetingAttempts, type LibraryGreeting } from "@/hooks/useGreetingsLibrary";
import { toast } from "sonner";
import { format } from "date-fns";

function StatusBadge({ g }: { g: LibraryGreeting }) {
  if (g.status === "generating")
    return <Badge variant="secondary" className="text-xs gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Generating</Badge>;
  if (g.status === "queued")
    return <Badge variant="secondary" className="text-xs gap-1"><Clock className="h-3 w-3" /> Queued</Badge>;
  if (g.status === "failed")
    return <Badge variant="destructive" className="text-xs gap-1"><AlertCircle className="h-3 w-3" /> Failed</Badge>;
  if (g.status === "canceled")
    return <Badge variant="outline" className="text-xs gap-1"><Ban className="h-3 w-3" /> Canceled</Badge>;
  return null;
}

function DetailsDrawer({ greetingId, open, onClose }: { greetingId: string | null; open: boolean; onClose: () => void }) {
  const { data, isLoading } = useGreetingAttempts(open ? greetingId : null);
  const attempts = data?.attempts ?? [];
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[500px] sm:max-w-[560px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Generation details</SheetTitle>
          <SheetDescription>Every ElevenLabs request made for this greeting, including request IDs and error payloads.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          {isLoading && <Skeleton className="h-24 w-full" />}
          {!isLoading && attempts.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">No attempts logged yet.</p>
          )}
          {attempts.map((a) => (
            <div key={a.id} className="rounded-lg border p-3 space-y-2 text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline">Attempt #{a.attempt_number}</Badge>
                {a.status === "succeeded" && <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3 mr-1" />Succeeded</Badge>}
                {a.status === "failed" && <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>}
                {a.status === "canceled" && <Badge variant="outline"><Ban className="h-3 w-3 mr-1" />Canceled</Badge>}
                {a.http_status && <Badge variant="outline" className="text-xs">HTTP {a.http_status}</Badge>}
                {a.duration_ms != null && <Badge variant="outline" className="text-xs">{a.duration_ms}ms</Badge>}
              </div>
              <div className="text-xs text-muted-foreground space-y-0.5">
                <div>Started: {format(new Date(a.started_at), "PPpp")}</div>
                {a.finished_at && <div>Finished: {format(new Date(a.finished_at), "PPpp")}</div>}
                {a.request_id && (
                  <div className="font-mono break-all">request_id: {a.request_id}</div>
                )}
                {a.voice_id && <div className="font-mono break-all">voice_id: {a.voice_id}</div>}
              </div>
              {a.error_message && (
                <div className="rounded border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive break-words">
                  {a.error_message}
                </div>
              )}
              {a.error_payload && (
                <pre className="rounded bg-muted p-2 text-[11px] overflow-auto max-h-64">
                  {JSON.stringify(a.error_payload, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function MyGreetings() {
  const { query, create, remove, activate, retry, regenerate, cancel } = useGreetingsLibrary();
  const greetings = query.data?.greetings ?? [];
  const extensions = query.data?.extensions ?? [];
  const voices = query.data?.voices ?? [];
  const throttle = query.data?.throttle;

  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [voiceId, setVoiceId] = useState("EXAVITQu4vr4xnSDxMaL");
  const [extension, setExtension] = useState<string>("__all__");
  const [detailsId, setDetailsId] = useState<string | null>(null);

  const handleCreate = () => {
    if (!text.trim()) return toast.error("Enter greeting text");
    create.mutate(
      {
        name: name.trim() || `Greeting ${greetings.length + 1}`,
        text: text.trim(),
        voice_id: voiceId,
        extension: extension === "__all__" ? null : extension,
      },
      {
        onSuccess: (res: any) => {
          if (res?.queued) toast.info("Queued — will start when a slot frees up");
          else toast.success("Greeting generated");
          setName(""); setText("");
        },
        onError: (e: any) => toast.error(e?.message ?? "Failed"),
      },
    );
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center gap-3">
        <Library className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Voicemail Greetings</h1>
          <p className="text-sm text-muted-foreground">
            Generate, preview, and switch between ElevenLabs greetings for your extensions.
          </p>
        </div>
      </div>

      {throttle && (throttle.generating > 0 || throttle.queued > 0) && (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm flex items-center gap-2">
          <Info className="h-4 w-4 text-primary" />
          <span>
            {throttle.generating} of {throttle.max_concurrent} generation slots in use
            {throttle.queued > 0 && <> · <b>{throttle.queued}</b> queued — will start automatically</>}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4" /> New AI greeting
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Business hours, After hours…" />
            </div>
            <div>
              <Label>Apply to extension</Label>
              <Select value={extension} onValueChange={setExtension}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All my lines</SelectItem>
                  {extensions.map((e) => (
                    <SelectItem key={e.extension} value={e.extension}>
                      Ext {e.extension}{e.display_name ? ` — ${e.display_name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Voice</Label>
              <Select value={voiceId} onValueChange={setVoiceId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {voices.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Script</Label>
              <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)}
                placeholder="Hi, you've reached… please leave a message after the tone." />
            </div>
            <Button onClick={handleCreate} disabled={create.isPending} className="w-full">
              <Wand2 className="h-4 w-4 mr-2" />
              {create.isPending ? "Submitting…" : "Generate & Save"}
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PlayCircle className="h-4 w-4" />
              My greetings
              <Badge variant="secondary" className="ml-2">{greetings.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {query.isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
            {!query.isLoading && greetings.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">No greetings yet. Generate your first one.</p>
            )}
            {greetings.map((g) => {
              const inFlight = g.status === "generating" || g.status === "queued";
              const cardClass = g.is_active
                ? "border-primary bg-primary/5"
                : g.status === "failed"
                  ? "border-destructive/40 bg-destructive/5"
                  : g.status === "canceled"
                    ? "border-muted-foreground/30 bg-muted/30"
                    : "";
              return (
                <div key={g.id} className={`rounded-lg border p-3 space-y-2 ${cardClass}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{g.name}</span>
                        {g.is_active && <Badge className="bg-primary/15 text-primary">Active</Badge>}
                        <StatusBadge g={g} />
                        <Badge variant="outline" className="text-xs">
                          {g.extension ? `Ext ${g.extension}` : "All lines"}
                        </Badge>
                        {g.voice_name && <Badge variant="outline" className="text-xs">{g.voice_name}</Badge>}
                        {g.attempts > 1 && (
                          <Badge variant="outline" className="text-xs">Attempt {g.attempts}</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(g.created_at), "PPp")}
                      </div>
                      {g.text_script && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{g.text_script}</p>
                      )}
                      {g.status === "failed" && g.error_message && (
                        <div className="mt-2 rounded border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                          <div className="font-medium mb-0.5">ElevenLabs error</div>
                          <div className="break-words">{g.error_message}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Inline audio preview — only when ready & audio loaded */}
                  {g.status === "ready" && g.audio_url && (
                    <audio controls preload="none" src={g.audio_url} className="w-full h-9" />
                  )}

                  <div className="flex gap-2 flex-wrap">
                    {g.status === "ready" && !g.is_active && (
                      <Button size="sm" onClick={() => activate.mutate(g.id, {
                        onSuccess: () => toast.success("Activated"),
                        onError: (e: any) => toast.error(e?.message),
                      })}>
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Set active
                      </Button>
                    )}

                    {inFlight && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={cancel.isPending}
                        onClick={() => cancel.mutate(g.id, {
                          onSuccess: () => toast.success("Canceled"),
                          onError: (e: any) => toast.error(e?.message ?? "Cancel failed"),
                        })}
                      >
                        <Ban className="h-3 w-3 mr-1" /> Cancel
                      </Button>
                    )}

                    {(g.status === "failed" || g.status === "canceled") && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={regenerate.isPending}
                        onClick={() => regenerate.mutate(g.id, {
                          onSuccess: (res: any) => toast.success(res?.queued ? "Queued for regeneration" : "Regenerated"),
                          onError: (e: any) => toast.error(e?.message ?? "Regenerate failed"),
                        })}
                      >
                        <RefreshCw className="h-3 w-3 mr-1" /> Regenerate
                      </Button>
                    )}

                    {g.status === "failed" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={retry.isPending}
                        onClick={() => retry.mutate(g.id, {
                          onSuccess: () => toast.success("Retrying…"),
                          onError: (e: any) => toast.error(e?.message),
                        })}
                      >
                        <RefreshCw className="h-3 w-3 mr-1" /> Retry
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDetailsId(g.id)}
                    >
                      <Info className="h-3 w-3 mr-1" /> Details
                    </Button>

                    <Button size="sm" variant="destructive" onClick={() => {
                      if (confirm("Delete this greeting?")) remove.mutate(g.id, {
                        onSuccess: () => toast.success("Deleted"),
                      });
                    }}>
                      <Trash2 className="h-3 w-3 mr-1" /> Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <DetailsDrawer
        greetingId={detailsId}
        open={!!detailsId}
        onClose={() => setDetailsId(null)}
      />
    </div>
  );
}
