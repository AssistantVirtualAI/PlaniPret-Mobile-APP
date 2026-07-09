import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "sonner";
import { Send, Plus, Menu, Loader2, Sparkles, Mic, Square, Volume2, VolumeX } from "lucide-react";

type Msg = { id: string; role: "user" | "assistant"; message: string; created_at: string };
type Session = { id: string; title: string; last_message_at: string };

export default function MAvaChat() {
  const [userId, setUserId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speakReplies, setSpeakReplies] = useState<boolean>(() => localStorage.getItem("ava_tts_on") === "1");
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      setUserId(data.user.id);
      const { data: s } = await supabase
        .from("planipret_ava_chat_sessions")
        .select("id,title,last_message_at")
        .order("last_message_at", { ascending: false })
        .limit(50);
      setSessions((s ?? []) as Session[]);
      if (s?.[0]) setSessionId(s[0].id);
    })();
  }, []);

  useEffect(() => {
    if (!sessionId) { setMessages([]); return; }
    (async () => {
      const { data } = await supabase
        .from("planipret_ava_conversations")
        .select("id,role,message,created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });
      setMessages((data ?? []) as Msg[]);
    })();
  }, [sessionId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const startNew = () => { setSessionId(null); setMessages([]); };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true); setInput("");
    const optimistic: Msg = { id: `tmp-${Date.now()}`, role: "user", message: text, created_at: new Date().toISOString() };
    setMessages((m) => [...m, optimistic]);
    try {
      const history = messages.slice(-8).map((m) => ({ role: m.role, content: m.message }));
      const { data, error } = await supabase.functions.invoke("pp-ava-chat", {
        body: { mode: "chat", user_message: text, session_id: sessionId, history },
      });
      if (error) throw error;
      const d = data as any;
      const newSid = d.session_id ?? sessionId;
      if (newSid && newSid !== sessionId) {
        setSessionId(newSid);
        const { data: srow } = await supabase.from("planipret_ava_chat_sessions").select("id,title,last_message_at").eq("id", newSid).maybeSingle();
        if (srow) setSessions((s) => [srow as Session, ...s.filter((x) => x.id !== newSid)]);
      }
      const replyText = String(d.reply ?? "…");
      const replyId = `a-${Date.now()}`;
      setMessages((m) => [...m, { id: replyId, role: "assistant", message: replyText, created_at: new Date().toISOString() }]);
      if (speakReplies) speak(replyId, replyText);
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur AVA");
    } finally { setBusy(false); }
  };

  const speak = async (id: string, text: string) => {
    try {
      audioRef.current?.pause();
      setSpeakingId(id);
      const { data, error } = await supabase.functions.invoke("pp-ava-tts", { body: { text, language: "fr" } });
      if (error) throw error;
      const d = data as any;
      if (!d?.audioContent) throw new Error("no_audio");
      const audio = new Audio(`data:audio/mpeg;base64,${d.audioContent}`);
      audioRef.current = audio;
      audio.onended = () => setSpeakingId(null);
      audio.onerror = () => setSpeakingId(null);
      await audio.play();
    } catch (e: any) {
      setSpeakingId(null);
      toast.error("Lecture vocale indisponible");
    }
  };

  const toggleTts = () => {
    const next = !speakReplies;
    setSpeakReplies(next);
    localStorage.setItem("ava_tts_on", next ? "1" : "0");
    if (!next) { audioRef.current?.pause(); setSpeakingId(null); }
  };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const mr = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mime });
        setTranscribing(true);
        try {
          const buf = await blob.arrayBuffer();
          let bin = ""; const bytes = new Uint8Array(buf);
          for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
          const b64 = btoa(bin);
          const { data, error } = await supabase.functions.invoke("pp-ava-stt", { body: { audio: b64, mime } });
          if (error) throw error;
          const text = String((data as any)?.text ?? "").trim();
          if (text) setInput((v) => (v ? `${v} ${text}` : text));
          else toast.info("Rien détecté");
        } catch (e: any) {
          toast.error("Transcription indisponible");
        } finally { setTranscribing(false); }
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
    } catch {
      toast.error("Micro non autorisé");
    }
  };

  const stopRec = () => {
    mediaRef.current?.stop();
    mediaRef.current = null;
    setRecording(false);
  };

  const currentTitle = useMemo(() => sessions.find((s) => s.id === sessionId)?.title ?? "AVA", [sessions, sessionId]);

  return (
    <div className="flex flex-col h-[calc(100dvh-8rem)]">
      <div className="flex items-center gap-2 p-3 border-b">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon"><Menu className="w-5 h-5" /></Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-80">
            <SheetHeader><SheetTitle>Conversations AVA</SheetTitle></SheetHeader>
            <div className="mt-4 space-y-2">
              <Button size="sm" variant="secondary" className="w-full" onClick={startNew}>
                <Plus className="w-4 h-4 mr-1" /> Nouvelle conversation
              </Button>
              {sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSessionId(s.id)}
                  className={`w-full text-left rounded-md px-3 py-2 text-sm truncate ${s.id === sessionId ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                >{s.title || "Sans titre"}</button>
              ))}
            </div>
          </SheetContent>
        </Sheet>
        <Sparkles className="w-5 h-5 text-primary" />
        <div className="font-medium truncate flex-1">{currentTitle}</div>
        <Button size="icon" variant="ghost" onClick={toggleTts} title={speakReplies ? "Voix activée" : "Voix désactivée"}>
          {speakReplies ? <Volume2 className="w-5 h-5 text-primary" /> : <VolumeX className="w-5 h-5" />}
        </Button>
        <Button size="icon" variant="ghost" onClick={startNew}><Plus className="w-5 h-5" /></Button>
      </div>

      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-10">
              Pose ta question à AVA. Elle a accès à tes leads, appels et courriels.
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
              }`}>
                {m.message}
                {m.role === "assistant" && (
                  <button
                    onClick={() => (speakingId === m.id ? (audioRef.current?.pause(), setSpeakingId(null)) : speak(m.id, m.message))}
                    className="ml-2 inline-flex items-center align-middle text-muted-foreground hover:text-primary"
                    title="Écouter"
                  >
                    {speakingId === m.id ? <Square className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                  </button>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="rounded-2xl px-4 py-2 bg-muted text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" /> AVA réfléchit…
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-3 border-t flex gap-2">
        <Button
          onClick={recording ? stopRec : startRec}
          disabled={busy || transcribing || !userId}
          size="icon"
          variant={recording ? "destructive" : "outline"}
          title={recording ? "Arrêter" : "Dicter"}
        >
          {transcribing ? <Loader2 className="w-4 h-4 animate-spin" /> : recording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </Button>
        <Input
          placeholder={recording ? "Enregistrement…" : "Message à AVA…"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          disabled={busy || !userId || recording}
        />
        <Button onClick={send} disabled={busy || !input.trim()} size="icon">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}
