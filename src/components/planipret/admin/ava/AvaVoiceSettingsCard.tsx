// Admin-side AVA voice picker. Reads/writes the SAME broker profile row as the
// mobile VoiceSettingsSheet through pp-ava-voice-settings, so a change on either
// surface is immediately reflected on the other (FR and EN).
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Play, Square, Check, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

interface Voice { voice_id: string; name: string; preview_url?: string | null; labels?: Record<string, string> }
interface Broker { id: string; full_name: string | null; email?: string | null; ava_voice_name?: string | null }

export default function AvaVoiceSettingsCard() {
  const { lang } = useMplanipretLang();
  const L = (fr: string, en: string) => (lang === "en" ? en : fr);

  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [brokerId, setBrokerId] = useState<string>("");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState<string>("");
  const [stability, setStability] = useState(0.6);
  const [similarity, setSimilarity] = useState(0.8);
  const [style, setStyle] = useState(0.3);
  const [speed, setSpeed] = useState(1);
  const [savedLang, setSavedLang] = useState<string>("fr");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("planipret_profiles")
        .select("id, full_name, email, ava_voice_name")
        .order("full_name", { ascending: true });
      const list = (data ?? []) as Broker[];
      setBrokers(list);
      setBrokerId((prev) => prev || list[0]?.id || "");
    })();
  }, []);

  const load = useCallback(async () => {
    if (!brokerId) return;
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("pp-ava-voice-settings", {
      body: { action: "get", broker_profile_id: brokerId },
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
    setSavedLang(s.language ?? "fr");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brokerId]);

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
        body: { action: "preview", voice_id: v.voice_id, language: lang, stability, similarity_boost: similarity, style, speed },
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
    if (!brokerId || !voiceId) return;
    setSaving(true);
    const chosen = voices.find((v) => v.voice_id === voiceId);
    const { data, error } = await supabase.functions.invoke("pp-ava-voice-settings", {
      body: {
        action: "save", broker_profile_id: brokerId,
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
    setSavedLang(lang);
    toast.success(L("Voix AVA synchronisée avec le mobile", "AVA voice synced with mobile"));
  };

  const Slider = ({ label, value, set, min, max, step }: { label: string; value: number; set: (n: number) => void; min: number; max: number; step: number }) => (
    <div className="mb-3">
      <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
        <span>{label}</span><span>{value.toFixed(2)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => set(Number(e.target.value))} className="w-full accent-violet-600" />
    </div>
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-1">
        <Volume2 className="w-4 h-4 text-violet-600" />
        <h2 className="text-sm font-semibold text-slate-800">{L("Voix d'AVA", "AVA voice")}</h2>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        {L(
          "La voix et la langue enregistrées ici sont les mêmes que celles de l'application mobile du courtier.",
          "The voice and language saved here are the same as the broker's mobile app settings.",
        )}
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select
          aria-label={L("Courtier", "Broker")}
          value={brokerId}
          onChange={(e) => setBrokerId(e.target.value)}
          className="h-9 rounded-lg border border-slate-200 px-2 text-sm"
        >
          {brokers.map((b) => (
            <option key={b.id} value={b.id}>{b.full_name || b.email || b.id.slice(0, 8)}</option>
          ))}
        </select>
        <span className="text-xs text-slate-500">
          {L("Langue enregistrée", "Saved language")}: <strong>{savedLang.toUpperCase()}</strong>
        </span>
      </div>

      {loading ? (
        <div className="py-8 flex justify-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : (
        <>
          <div className="max-h-72 overflow-y-auto mb-3">
            {voices.map((v) => (
              <div key={v.voice_id}
                onClick={() => setVoiceId(v.voice_id)}
                className={`flex items-center gap-2 p-2.5 rounded-lg mb-1.5 cursor-pointer border ${
                  voiceId === v.voice_id ? "border-violet-500 bg-violet-50" : "border-slate-200 hover:bg-slate-50"
                }`}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-800 truncate">{v.name}</div>
                  <div className="text-[11px] text-slate-400 truncate">
                    {[v.labels?.gender, v.labels?.accent].filter(Boolean).join(" · ") || v.voice_id.slice(0, 12)}
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); preview(v); }}
                  aria-label={L("Écouter un aperçu", "Play preview")}
                  className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
                  {previewing === v.voice_id ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                </button>
                {voiceId === v.voice_id && <Check className="w-4 h-4 text-violet-600" />}
              </div>
            ))}
          </div>

          <Slider label={L("Stabilité", "Stability")} value={stability} set={setStability} min={0} max={1} step={0.05} />
          <Slider label={L("Similarité", "Similarity")} value={similarity} set={setSimilarity} min={0} max={1} step={0.05} />
          <Slider label={L("Style", "Style")} value={style} set={setStyle} min={0} max={1} step={0.05} />
          <Slider label={L("Vitesse", "Speed")} value={speed} set={setSpeed} min={0.7} max={1.2} step={0.05} />

          <button onClick={save} disabled={saving || !voiceId}
            className="h-10 px-4 rounded-lg bg-violet-600 text-white text-sm font-medium disabled:opacity-60 inline-flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {L("Enregistrer la voix", "Save voice")}
          </button>
        </>
      )}
    </div>
  );
}
