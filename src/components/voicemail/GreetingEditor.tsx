import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Mic, Square, Wand2, Save, PlayCircle } from "lucide-react";
import { useMyGreeting, type GreetingSettings } from "@/hooks/useMyVoicemail";
import { toast } from "sonner";

export default function GreetingEditor({ lang }: { lang: "en" | "fr" }) {
  const t = (en: string, fr: string) => (lang === "fr" ? fr : en);
  const { query, save, generateTts, getGreetingUrl } = useMyGreeting();
  const settings = query.data?.settings;
  const voices = query.data?.voices ?? [];

  const [mode, setMode] = useState<"default" | "recorded" | "tts">("default");
  const [text, setText] = useState("");
  const [voiceId, setVoiceId] = useState<string>("EXAVITQu4vr4xnSDxMaL");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [transcription, setTranscription] = useState(true);
  const [aiSummary, setAiSummary] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [attachAudio, setAttachAudio] = useState(false);

  // recording
  const [recording, setRecording] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!settings) return;
    setMode((settings.greeting_type as any) || "default");
    setText(settings.greeting_tts_text || "");
    setVoiceId(settings.greeting_voice_id || "EXAVITQu4vr4xnSDxMaL");
    setStoragePath(settings.greeting_storage_path || null);
    setTranscription(settings.transcription_enabled ?? true);
    setAiSummary(settings.ai_summary_enabled ?? true);
    setNotifyEmail(settings.notify_email ?? true);
    setAttachAudio(settings.attach_audio_email ?? false);
    if (settings.greeting_storage_path) {
      getGreetingUrl(settings.greeting_storage_path).then((r) => setPreviewUrl(r.url)).catch(() => {});
    }
  }, [settings]);

  const handleGenerate = async () => {
    if (!text.trim()) return toast.error(t("Enter text first", "Saisissez du texte d'abord"));
    try {
      const r: any = await generateTts.mutateAsync({ text, voice_id: voiceId });
      setPreviewUrl(r.url);
      setStoragePath(r.storage_path);
      toast.success(t("Generated", "Généré"));
    } catch (e: any) {
      toast.error(e?.message ?? "tts_failed");
    }
  };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setPreviewUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
        toast.info(t("Recording ready. Saving recorded greeting requires admin upload (coming soon).", "Enregistrement prêt. La sauvegarde d'un greeting enregistré sera bientôt disponible."));
      };
      mediaRef.current = mr;
      mr.start();
      setRecording(true);
    } catch (e: any) {
      toast.error(e?.message ?? "mic_error");
    }
  };
  const stopRec = () => {
    mediaRef.current?.stop();
    setRecording(false);
  };

  const handleSave = () => {
    const voiceName = voices.find((v) => v.id === voiceId)?.name;
    const payload: GreetingSettings = {
      greeting_type: mode,
      greeting_tts_text: mode === "tts" ? text : null,
      greeting_voice_id: mode === "tts" ? voiceId : null,
      greeting_voice_name: mode === "tts" ? voiceName : null,
      greeting_storage_path: mode === "tts" ? storagePath : null,
      transcription_enabled: transcription,
      ai_summary_enabled: aiSummary,
      notify_email: notifyEmail,
      attach_audio_email: attachAudio,
    };
    save.mutate(payload, {
      onSuccess: () => toast.success(t("Saved", "Enregistré")),
      onError: (e: any) => toast.error(e?.message ?? "save_failed"),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PlayCircle className="h-4 w-4" />
          {t("Voicemail Greeting", "Message d'accueil")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
          <TabsList>
            <TabsTrigger value="default">{t("Default (org)", "Par défaut (org)")}</TabsTrigger>
            <TabsTrigger value="recorded">{t("Recorded", "Enregistré")}</TabsTrigger>
            <TabsTrigger value="tts">{t("AI Voice", "Voix IA")}</TabsTrigger>
          </TabsList>

          <TabsContent value="default" className="text-sm text-muted-foreground pt-2">
            {t("Uses the organization default greeting.", "Utilise le message par défaut de l'organisation.")}
          </TabsContent>

          <TabsContent value="recorded" className="space-y-3 pt-2">
            <div className="flex gap-2">
              {!recording ? (
                <Button onClick={startRec} variant="outline">
                  <Mic className="h-4 w-4 mr-2" /> {t("Record", "Enregistrer")}
                </Button>
              ) : (
                <Button onClick={stopRec} variant="destructive">
                  <Square className="h-4 w-4 mr-2" /> {t("Stop", "Arrêter")}
                </Button>
              )}
            </div>
            {previewUrl && <audio controls src={previewUrl} className="w-full" />}
          </TabsContent>

          <TabsContent value="tts" className="space-y-3 pt-2">
            <div>
              <Label>{t("Voice", "Voix")}</Label>
              <Select value={voiceId} onValueChange={setVoiceId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {voices.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("Greeting text", "Texte du message")}</Label>
              <Textarea
                rows={4}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t("Hi, you've reached…", "Bonjour, vous avez joint…")}
              />
            </div>
            <Button onClick={handleGenerate} disabled={generateTts.isPending} variant="outline">
              <Wand2 className="h-4 w-4 mr-2" />
              {generateTts.isPending ? t("Generating…", "Génération…") : t("Generate preview", "Générer un aperçu")}
            </Button>
            {previewUrl && <audio controls src={previewUrl} className="w-full" />}
          </TabsContent>
        </Tabs>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
          <div className="flex items-center justify-between">
            <Label className="text-sm">{t("Auto-transcribe", "Transcription auto")}</Label>
            <Switch checked={transcription} onCheckedChange={setTranscription} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">{t("AI summary", "Résumé IA")}</Label>
            <Switch checked={aiSummary} onCheckedChange={setAiSummary} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">{t("Email notifications", "Notifications email")}</Label>
            <Switch checked={notifyEmail} onCheckedChange={setNotifyEmail} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">{t("Attach audio to email", "Joindre l'audio à l'email")}</Label>
            <Switch checked={attachAudio} onCheckedChange={setAttachAudio} />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={save.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {save.isPending ? t("Saving…", "Enregistrement…") : t("Save settings", "Enregistrer")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
