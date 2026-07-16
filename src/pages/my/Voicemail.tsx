import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Voicemail as VmIcon, Play, Sparkles, FileText, Trash2, CheckCircle2, Inbox, PhoneCall, RefreshCw } from "lucide-react";
import { useMyVoicemails, type Voicemail } from "@/hooks/useMyVoicemail";
import { useLanguage } from "@/context/LanguageContext";
import { toast } from "sonner";
import GreetingEditor from "@/components/voicemail/GreetingEditor";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export default function MyVoicemail() {
  const { language } = useLanguage();
  const lang: "en" | "fr" = language === "fr" ? "fr" : "en";
  const { list, markRead, remove, getAudioUrl, transcribe, summarize } = useMyVoicemails();
  const [selected, setSelected] = useState<Voicemail | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [syncing, setSyncing] = useState(false);
  const qc = useQueryClient();

  const t = (en: string, fr: string) => (lang === "fr" ? fr : en);

  const runSync = async (silent = false) => {
    setSyncing(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data: spu } = await (supabase as any)
        .from("pbx_softphone_users")
        .select("organization_id, extension")
        .eq("portal_user_id", auth.user.id)
        .maybeSingle();
      if (!spu?.organization_id) {
        if (!silent) toast.error(t("No extension linked to your account.", "Aucune extension liée à votre compte."));
        return;
      }
      await Promise.allSettled([
        supabase.functions.invoke("voicemail-sync", {
          body: { organization_id: spu.organization_id, extension: spu.extension },
        }),
        supabase.functions.invoke("fusionpbx-proxy", {
          body: { action: "sync-cdrs", organization_id: spu.organization_id },
        }),
      ]);
      await qc.invalidateQueries({ queryKey: ["my-voicemails"] });
      if (!silent) toast.success(t("Synced from PBX", "Synchronisé depuis le PBX"));
    } catch (e: any) {
      if (!silent) toast.error(e?.message ?? "sync_error");
    } finally {
      setSyncing(false);
    }
  };

  // Auto-sync when page opens so users always see fresh data from the PBX.
  useEffect(() => {
    runSync(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const handlePlay = async (vm: Voicemail) => {
    setSelected(vm);
    setAudioUrl(null);
    setSearchParams((p) => { p.set("vm", vm.id); return p; }, { replace: true });
    if (!vm.read_at) markRead.mutate(vm.id);
    try {
      const { url } = await getAudioUrl(vm.id);
      setAudioUrl(url);
    } catch (e: any) {
      toast.error(e?.message ?? "audio_error");
    }
  };

  const vms = list.data?.voicemails ?? [];

  // Auto-select from ?vm= when arriving via direct link or AI deep-link
  useEffect(() => {
    const id = searchParams.get("vm");
    if (id && vms.length && (!selected || selected.id !== id)) {
      const found = vms.find((v) => v.id === id);
      if (found) handlePlay(found);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, vms.length]);


  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center gap-3">
        <VmIcon className="h-6 w-6 text-primary" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{t("Voicemail", "Messagerie vocale")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("Listen, transcribe and summarize your voicemails.", "Écoutez, transcrivez et résumez vos messages vocaux.")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => runSync(false)} disabled={syncing}>
          <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} />
          {t("Sync now", "Synchroniser")}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Inbox className="h-4 w-4" />
              {t("Inbox", "Boîte de réception")}
              <Badge variant="secondary" className="ml-2">{vms.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {list.isLoading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            {!list.isLoading && vms.length === 0 && (
              <div className="text-center text-muted-foreground py-12">
                <VmIcon className="h-10 w-10 mx-auto mb-2 opacity-40" />
                {t("No voicemails yet.", "Aucun message vocal.")}
              </div>
            )}
            {vms.map((vm) => (
              <button
                key={vm.id}
                onClick={() => handlePlay(vm)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition hover:bg-accent ${
                  selected?.id === vm.id ? "bg-accent border-primary" : ""
                } ${!vm.read_at ? "border-l-4 border-l-primary" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">
                      {vm.caller_name || vm.caller_number || t("Unknown", "Inconnu")}
                    </span>
                    {!vm.read_at && <Badge className="bg-primary/15 text-primary">{t("New", "Nouveau")}</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(vm.received_at), "PPp")} · {vm.duration_seconds ?? 0}s
                  </div>
                  {vm.ai_summary && (
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-1">{vm.ai_summary}</div>
                  )}
                </div>
                <Play className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("Details", "Détails")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!selected && (
              <p className="text-sm text-muted-foreground">{t("Select a voicemail.", "Sélectionnez un message.")}</p>
            )}
            {selected && (
              <>
                <div className="text-sm">
                  <div className="font-medium">{selected.caller_name || selected.caller_number}</div>
                  <div className="text-xs text-muted-foreground">{format(new Date(selected.received_at), "PPp")}</div>
                </div>
                {audioUrl ? (
                  <audio controls src={audioUrl} className="w-full" />
                ) : (
                  <Skeleton className="h-10 w-full" />
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={transcribe.isPending}
                    onClick={() =>
                      transcribe.mutate(selected.id, {
                        onSuccess: (d: any) => {
                          toast.success(t("Transcribed", "Transcrit"));
                          setSelected({ ...selected, transcript: d.transcript });
                        },
                        onError: (e: any) => toast.error(e?.message),
                      })
                    }
                  >
                    <FileText className="h-3 w-3 mr-1" />
                    {t("Transcribe", "Transcrire")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={summarize.isPending || !selected.transcript}
                    onClick={() =>
                      summarize.mutate(selected.id, {
                        onSuccess: (d: any) => {
                          toast.success(t("Summarized", "Résumé généré"));
                          setSelected({ ...selected, ai_summary: d.summary, ai_tags: d.tags });
                        },
                        onError: (e: any) => toast.error(e?.message),
                      })
                    }
                  >
                    <Sparkles className="h-3 w-3 mr-1" />
                    {t("AI Summary", "Résumé IA")}
                  </Button>
                  {selected.caller_number && (
                    <Button
                      size="sm"
                      onClick={() => { window.location.href = `tel:${selected.caller_number}`; }}
                    >
                      <PhoneCall className="h-3 w-3 mr-1" />
                      {t("Call back", "Rappeler")}
                    </Button>
                  )}
                  {!selected.read_at && (
                    <Button size="sm" variant="outline" onClick={() => markRead.mutate(selected.id)}>
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      {t("Mark read", "Marquer lu")}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() =>
                      remove.mutate(selected.id, {
                        onSuccess: () => {
                          toast.success(t("Deleted", "Supprimé"));
                          setSelected(null);
                          setAudioUrl(null);
                        },
                      })
                    }
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    {t("Delete", "Supprimer")}
                  </Button>
                </div>
                {selected.transcript && (
                  <div className="rounded-md bg-muted p-3 text-sm">
                    <div className="font-medium text-xs text-muted-foreground mb-1">{t("Transcript", "Transcription")}</div>
                    {selected.transcript}
                  </div>
                )}
                {selected.ai_summary && (
                  <div className="rounded-md bg-primary/5 p-3 text-sm border border-primary/20">
                    <div className="font-medium text-xs text-primary mb-1">{t("AI Summary", "Résumé IA")}</div>
                    {selected.ai_summary}
                    {selected.ai_tags && selected.ai_tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {selected.ai_tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <GreetingEditor lang={lang} />
    </div>
  );
}
