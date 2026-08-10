import { useEffect, useRef, useState } from "react";
import { ensureAiConsent } from "@/components/planipret/mobile/AiConsentHost";
import { Headphones, Loader2, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * ElevenLabs playback for the AVA brief / reports.
 * Generates the audio once per text, then toggles play/pause.
 */
export default function BriefListenButton({
  text,
  language = "fr",
  label,
}: {
  text: string;
  language?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const srcTextRef = useRef<string>("");

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setPlaying(false);
  };

  // Reset audio when the brief text changes.
  useEffect(() => {
    if (srcTextRef.current && srcTextRef.current !== text) stop();
  }, [text]);
  useEffect(() => () => stop(), []);

  const onClick = async () => {
    if (!text?.trim()) return;
    if (audioRef.current && srcTextRef.current === text) {
      if (playing) {
        audioRef.current.pause();
        setPlaying(false);
      } else {
        try {
          await audioRef.current.play();
          setPlaying(true);
        } catch { /* ignore */ }
      }
      return;
    }
    setBusy(true);
    try {
      const clean = text.replace(/[#*_`>]/g, "").replace(/\s+\n/g, "\n").slice(0, 3800);
      if (!(await ensureAiConsent())) { setBusy(false); return; }
      const { data, error } = await supabase.functions.invoke("pp-ava-tts", {
        body: { text: clean, language: language === "en" ? "en" : "fr" },
      });
      if (error) throw error;
      const b64 = (data as any)?.audioContent;
      if (!b64) throw new Error((data as any)?.error || (language === "en" ? "No audio returned" : "Aucun audio reçu"));
      const audio = new Audio(`data:audio/mpeg;base64,${b64}`);
      audioRef.current = audio;
      srcTextRef.current = text;
      audio.onended = () => { setPlaying(false); };
      audio.onerror = () => { setPlaying(false); };
      audio.onpause = () => setPlaying(false);
      audio.onplay = () => setPlaying(true);
      await audio.play();
      setPlaying(true);
    } catch (e: any) {
      toast.error(e?.message ?? (language === "en" ? "Voice unavailable" : "Voix indisponible"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={busy || !text?.trim()}
      className="mt-3 w-full py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60 active:scale-[0.99] transition"
      style={{
        background: "rgba(108,92,231,0.10)",
        border: "1px solid rgba(108,92,231,0.30)",
        color: "var(--pp-agent)",
        fontFamily: "Urbanist,sans-serif",
      }}
    >
      {busy ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : playing ? (
        <Pause className="w-3.5 h-3.5" />
      ) : audioRef.current ? (
        <Play className="w-3.5 h-3.5" />
      ) : (
        <Headphones className="w-3.5 h-3.5" />
      )}
      {busy
        ? (language === "en" ? "Generating…" : "Génération…")
        : playing
          ? (language === "en" ? "Pause" : "Pause")
          : (label ?? (language === "en" ? "Listen to the brief" : "Écouter le brief"))}
    </button>
  );
}
