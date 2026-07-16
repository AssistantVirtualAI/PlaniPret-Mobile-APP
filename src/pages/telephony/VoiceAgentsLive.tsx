import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Bot, Play } from "lucide-react";
import { toast } from "sonner";
import { LEMTEL_ORG } from "@/hooks/usePbxData";

type Conv = {
  id: string;
  conversation_id: string;
  elevenlabs_agent_id: string | null;
  status: string | null;
  caller_number: string | null;
  callee_number: string | null;
  duration_seconds: number | null;
  has_audio: boolean;
  audio_url: string | null;
  started_at: string | null;
};
type Tx = { id: string; conversation_id: string; speaker: string; message: string; sequence: number };

export default function VoiceAgentsLive() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);

  const conversations = useQuery({
    queryKey: ["va-conv", LEMTEL_ORG],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("voice_agent_conversations" as any)
        .select("*")
        .eq("organization_id", LEMTEL_ORG)
        .order("started_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as unknown as Conv[];
    },
  });

  const transcripts = useQuery({
    queryKey: ["va-tx", selected],
    enabled: !!selected,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("voice_agent_transcripts" as any)
        .select("*")
        .eq("conversation_id", selected!)
        .order("sequence", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as Tx[];
    },
  });

  const sync = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("elevenlabs-sync", {
        body: { organization_id: LEMTEL_ORG, limit: 50 },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => {
      toast.success(`Synced ${d?.conversations_upserted ?? 0} conversations, ${d?.transcripts_upserted ?? 0} transcript lines`);
      qc.invalidateQueries({ queryKey: ["va-conv"] });
    },
    onError: (e: any) => toast.error(`Sync failed: ${e?.message || e}`),
  });

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Bot className="w-5 h-5" />Voice Agents — Live</h1>
          <p className="text-sm text-muted-foreground">
            Real ElevenLabs agents, conversations, transcripts, and audio (SIP via sip.rtc.elevenlabs.io).
          </p>
        </div>
        <Button onClick={() => sync.mutate()} disabled={sync.isPending} className="gap-2">
          {sync.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Sync from ElevenLabs
        </Button>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent conversations ({conversations.data?.length ?? 0})</CardTitle>
            <CardDescription>voice_agent_conversations · click a row to load transcript</CardDescription>
          </CardHeader>
          <CardContent>
            {conversations.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
            <div className="space-y-1 max-h-[60vh] overflow-y-auto">
              {(conversations.data || []).map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelected(c.id)}
                  className={`w-full text-left p-2 rounded border text-xs hover:bg-accent transition ${selected === c.id ? "bg-accent border-primary" : ""}`}
                >
                  <div className="flex justify-between items-center gap-2">
                    <span className="font-mono truncate">{c.caller_number || c.callee_number || c.conversation_id.slice(0, 12)}</span>
                    <Badge variant="outline" className="text-[10px]">{c.status || "—"}</Badge>
                  </div>
                  <div className="text-muted-foreground flex justify-between mt-1">
                    <span>{c.started_at ? new Date(c.started_at).toLocaleString() : "—"}</span>
                    <span>{c.duration_seconds != null ? `${c.duration_seconds}s` : ""}</span>
                  </div>
                </button>
              ))}
              {!conversations.isLoading && (conversations.data?.length || 0) === 0 && (
                <div className="text-sm text-muted-foreground p-4 text-center">No conversations yet. Click “Sync from ElevenLabs”.</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Transcript</CardTitle>
            <CardDescription>{selected ? `Conversation ${selected.slice(0, 8)}…` : "Select a conversation"}</CardDescription>
          </CardHeader>
          <CardContent>
            {selected && (
              <div className="mb-3">
                {(() => {
                  const c = conversations.data?.find((x) => x.id === selected);
                  if (!c?.has_audio) return <div className="text-xs text-muted-foreground">No audio available.</div>;
                  return (
                    <div className="flex items-center gap-2 text-xs">
                      <Play className="w-3 h-3" />
                      <a className="underline" href={c.audio_url || "#"} target="_blank" rel="noreferrer">
                        Open audio (requires ElevenLabs auth header)
                      </a>
                    </div>
                  );
                })()}
              </div>
            )}
            <div className="space-y-2 max-h-[60vh] overflow-y-auto text-sm">
              {(transcripts.data || []).map((t) => (
                <div key={t.id} className="flex gap-2">
                  <Badge variant={t.speaker === "agent" ? "default" : "outline"} className="h-fit">{t.speaker}</Badge>
                  <div>{t.message}</div>
                </div>
              ))}
              {selected && !transcripts.isLoading && (transcripts.data?.length || 0) === 0 && (
                <div className="text-muted-foreground text-xs">No transcript captured.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
