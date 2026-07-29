// VoiceSettingsSheet — pick the ElevenLabs voice used by the AVA voice bot.
// Reads/writes through pp-ava-voice-settings so the admin portal and the
// mobile app always share the same stored voice for a broker.
import { useCallback, useEffect, useRef, useState } from "react";
import { X, Check, Play, Square, Loader2, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

interface Props { userId?: string; brokerProfileId?: string; onClose: () => void; onSaved?: (voiceId: string) => void; }

interface Voice { voice_id: string; name: string; preview_url?: string | null; labels?: Record<string, string>; }

export default function VoiceSettingsSheet({ brokerProfileId, onClose, onSaved }: Props) {
  const { lang } = useMplanipretLang();
  const L = (fr: string, en: string) => (lang === "en" ? en : fr);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState<string>("");
  const [stability, setStability] = useState(0.6);
  const [similarity, setSimilarity] = useState(0.8);
  const [style, setStyle] = useState(0.3);
  const [speed, setSpeed] = useState(1);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("pp-ava-voice-settings", {
      body: { action: "get", broker_profile_id: brokerProfileId },
    });
    setLoading(false);
    if (error || !(data as any)?.success) {
      toast.error(L("Impossible de charger les voix", "Could not load voices"));
      return;
    }
    const d = data as any;
    setVoices(d.voices ?? []);
    const s = d.settings ?? {};
    setVoiceId(s.voice_id ?? d.voices?.[0]?.voice_id ?? "");
    setStability(Number(s.stability ?? 0.6));
    setSimilarity(Number(s.similarity_boost ?? 0.8));
    setStyle(Number(s.style ?? 0.3));
    setSpeed(Number(s.speed ?? 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brokerProfileId, lang]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => () => { try { audioRef.current?.pause(); } catch { /* */ } }, []);

  const preview = async (v: Voice) => {
    if (previewing === v.voice_id) {
      try { audioRef.current?.pause(); } catch { /* */ }
      setPreviewing(null);
      return;
    }
    setPreviewing(v.voice_id);
    try {
      const { data, error } = await supabase.functions.invoke("pp-ava-voice-settings", {
        body: {
          action: "preview", voice_id: v.voice_id, language: lang,
          stability, similarity_boost: similarity, style, speed,
        },
      });
      let src = v.preview_url ?? "";
      if (!error && (data as any)?.audio_base64) src = `data:audio/mpeg;base64,${(data as any).audio_base64}`;
      if (!src) throw new Error("no_audio");
      try { audioRef.current?.pause(); } catch { /* */ }
      const audio = new Audio(src);
      audioRef.current = audio;
      audio.onended = () => setPreviewing(null);
      await audio.play();
    } catch {
      setPreviewing(null);
      toast.error(L("Aperçu audio indisponible", "Audio preview unavailable"));
    }
  };

  const save = async () => {
    if (!voiceId) return;
    setSaving(true);
    const chosen = voices.find((v) => v.voice_id === voiceId);
    const { data, error } = await supabase.functions.invoke("pp-ava-voice-settings", {
      body: {
        action: "save", broker_profile_id: brokerProfileId,
        voice_id: voiceId, voice_name: chosen?.name ?? null,
        stability, similarity_boost: similarity, style, speed,
        language: lang,
      },
    });
    setSaving(false);
    if (error || !(data as any)?.success) {
      toast.error(L("Échec de l'enregistrement", "Could not save"));
      return;
    }
    toast.success(L("Voix AVA mise à jour", "AVA voice updated"));
    onSaved?.(voiceId);
    onClose();
  };

  const Slider = ({ label, value, set, min, max, step: st }: { label: string; value: number; set: (n: number) => void; min: number; max: number; step: number }) => (
    <div className="mb-3">
      <div className="flex items-center justify-between text-[11px] mb-1" style={{ color: "#8FA9C4" }}>
        <span>{label}</span><span>{value.toFixed(2)}</span>
      </div>
      <input type="range" min={min} max={max} step={st} value={value}
        onChange={(e) => set(Number(e.target.value))} className="w-full accent-[#2E9BDC]" />
    </div>
  );

  return (
    <div className="absolute inset-0 z-[80] flex items-end" style={{ background: "rgba(0,0,0,0.55)" }} onClick={onClose}>
      <div
        className="w-full rounded-t-2xl px-5 pt-4 flex flex-col"
        style={{
          background: "var(--pp-bg-surface, #0A1628)",
          borderTop: "1px solid var(--pp-bg-border, #0E2A45)",
          maxHeight: "85dvh",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[15px] font-semibold text-white flex items-center gap-2">
            <Volume2 className="w-4 h-4" style={{ color: "#2E9BDC" }} />
            {L("Voix d'AVA", "AVA voice")}
          </h3>
          <button onClick={onClose} aria-label={L("Fermer", "Close")}
            className="w-8 h-8 rounded-full bg-white/5 text-white/70 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[12px] mb-3" style={{ color: "#8FA9C4" }}>
          {L(
            "La voix choisie est synchronisée automatiquement entre le portail admin et l'application mobile.",
            "The selected voice syncs automatically between the admin portal and the mobile app.",
          )}
        </p>

        {loading ? (
          <div className="py-10 flex items-center justify-center text-white/60">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
              {voices.map((v) => (
                <div key={v.voice_id}
                  className="flex items-center gap-2 p-3 rounded-xl mb-2 cursor-pointer"
                  onClick={() => setVoiceId(v.voice_id)}
                  style={{
                    background: voiceId === v.voice_id ? "rgba(46,155,220,0.15)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${voiceId === v.voice_id ? "#2E9BDC" : "#0E2A45"}`,
                  }}>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-white font-medium truncate">{v.name}</div>
                    <div className="text-[11px] truncate" style={{ color: "#4A7FA5" }}>
                      {[v.labels?.gender, v.labels?.accent, v.labels?.description].filter(Boolean).join(" · ") || v.voice_id.slice(0, 12)}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); preview(v); }}
                    aria-label={L("Écouter un aperçu", "Play preview")}
                    className="w-9 h-9 rounded-full flex items-center justify-center"
                    style={{ background: "rgba(255,255,255,0.07)", color: "#E8EDF5" }}>
                    {previewing === v.voice_id ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </button>
                  {voiceId === v.voice_id && <Check className="w-4 h-4" style={{ color: "#2E9BDC" }} />}
                </div>
              ))}
            </div>

            <div className="pt-3 mt-2" style={{ borderTop: "1px solid #0E2A45" }}>
              <Slider label={L("Stabilité", "Stability")} value={stability} set={setStability} min={0} max={1} step={0.05} />
              <Slider label={L("Similarité", "Similarity")} value={similarity} set={setSimilarity} min={0} max={1} step={0.05} />
              <Slider label={L("Style", "Style")} value={style} set={setStyle} min={0} max={1} step={0.05} />
              <Slider label={L("Vitesse", "Speed")} value={speed} set={setSpeed} min={0.7} max={1.2} step={0.05} />

              <button onClick={save} disabled={saving || !voiceId}
                className="w-full h-11 rounded-xl text-white font-medium flex items-center justify-center gap-2 disabled:opacity-60"
                style={{ background: "linear-gradient(135deg,#2E9BDC,#6C3CE1)" }}>
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {L("Enregistrer la voix", "Save voice")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
