import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Play, Pause, Sparkles, Mic, RotateCw, Check, Settings2, ChevronDown, ChevronUp } from "lucide-react";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

type Voice = {
  voice_id: string;
  name: string;
  language: string;
  gender: string;
  preview_url: string;
  category: "professional" | "natural" | "custom";
};

type Profile = {
  id: string;
  user_id: string;
  full_name?: string | null;
  voicemail_greeting_text?: string | null;
  voicemail_greeting_voice_id?: string | null;
  voicemail_greeting_audio_url?: string | null;
  voicemail_greeting_updated_at?: string | null;
  voicemail_greeting_active?: boolean;
};

const TEMPLATES: { key: string; label: string; lang: "fr" | "en"; body: (n: string) => string }[] = [
  { key: "pro_fr", label: "🏢 Professionnel", lang: "fr",
    body: (n) => `Bonjour, vous avez joint ${n}, courtier hypothécaire chez Planiprêt. Je suis présentement avec un client. Laissez-moi votre nom, votre numéro et le meilleur moment pour vous rappeler. Je vous contacterai dans les plus brefs délais. Merci et bonne journée.` },
  { key: "out_fr", label: "📞 Absent", lang: "fr",
    body: (n) => `Bonjour, vous avez joint ${n}. Je suis absent du bureau pour quelques jours. Pour une assistance immédiate, veuillez contacter mon collègue. Sinon, laissez un message et je vous rappellerai à mon retour.` },
  { key: "ah_fr", label: "🌙 Soir/WE", lang: "fr",
    body: (n) => `Bonjour, vous avez joint ${n} chez Planiprêt. Nos bureaux sont présentement fermés. Nos heures d'affaires sont du lundi au vendredi de 9h à 17h. Laissez votre message et nous vous rappellerons dès l'ouverture. Merci.` },
  { key: "pro_en", label: "🇬🇧 Professional", lang: "en",
    body: (n) => `Hello, you've reached ${n}, mortgage broker at Planiprêt. I'm currently unavailable. Please leave your name, number and the best time to reach you, and I'll return your call as soon as possible. Thank you and have a great day.` },
];

const TOKENS = {
  bg: "#060D1A",
  card: "#0A1628",
  border: "#0E2A45",
  borderActive: "#2E9BDC",
  text: "#E8EDF5",
  muted: "#4A7FA5",
};

export default function GreetingStudio({ profile, onProfileChange }: { profile: Profile; onProfileChange?: () => void }) {
  const { t, lang } = useMplanipretLang();
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [selectedVoice, setSelectedVoice] = useState<string | null>(profile.voicemail_greeting_voice_id ?? null);
  const [text, setText] = useState<string>(profile.voicemail_greeting_text ?? "");
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genStep, setGenStep] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [previewVoiceName, setPreviewVoiceName] = useState<string>("");
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [improving, setImproving] = useState(false);
  const [settings, setSettings] = useState({ stability: 0.6, similarity_boost: 0.8, style: 0.3 });
  const [previewing, setPreviewing] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const fullName = profile.full_name ?? t("greeting.defaultBroker");
  const charCount = text.length;
  const counterColor = charCount > 480 ? "#EF4444" : charCount > 400 ? "#F59E0B" : "#10B981";

  // Load voices
  useEffect(() => {
    supabase.functions.invoke("pp-greeting-voices").then(({ data, error }) => {
      if (error) { setVoicesError(error.message); return; }
      if ((data as any)?.success) setVoices((data as any).voices);
      else setVoicesError((data as any)?.error ?? "unknown_error");
    });
  }, []);

  // Sign current greeting URL if it's a storage path
  useEffect(() => {
    const path = profile.voicemail_greeting_audio_url;
    if (!path) { setCurrentAudioUrl(null); return; }
    if (path.startsWith("http")) { setCurrentAudioUrl(path); return; }
    supabase.storage.from("voicemail-greetings").createSignedUrl(path, 3600).then(({ data }) => {
      if (data?.signedUrl) setCurrentAudioUrl(data.signedUrl);
    });
  }, [profile.voicemail_greeting_audio_url]);

  const applyTemplate = (k: string) => {
    const t = TEMPLATES.find((x) => x.key === k);
    if (!t) return;
    setText(t.body(fullName));
    setActiveTemplate(k);
  };

  const playVoicePreview = (v: Voice) => {
    if (!v.preview_url) return;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (previewing === v.voice_id) { setPreviewing(null); return; }
    const audio = new Audio(v.preview_url);
    audio.onended = () => setPreviewing(null);
    audio.play().catch(() => setPreviewing(null));
    audioRef.current = audio;
    setPreviewing(v.voice_id);
  };

  const improveText = async () => {
    if (text.trim().length < 10) { toast.error(t("greeting.draftTooShort")); return; }
    setImproving(true);
    const { data, error } = await supabase.functions.invoke("pp-greeting-improve", { body: { text, language: lang } });
    setImproving(false);
    if (error || !(data as any)?.success) { toast.error(t("greeting.improveFailed")); return; }
    setText((data as any).improved);
    toast.success(t("greeting.improved"));
  };

  const generate = async (pushToNs: boolean) => {
    if (!selectedVoice || text.length < 10) return;
    setGenerating(true);
    setGenStep(pushToNs ? t("greeting.activation") : t("greeting.generation"));
    const { data, error } = await supabase.functions.invoke("pp-greeting-generate", {
      body: {
        text,
        voice_id: selectedVoice,
        voice_settings: settings,
        push_to_ns: pushToNs,
      },
    });
    setGenerating(false);
    setGenStep("");
    if (error || !(data as any)?.success) {
      toast.error((data as any)?.error ?? error?.message ?? t("greeting.generateFailed"));
      return;
    }
    const d = data as any;
    setPreviewUrl(d.audio_url);
    setPreviewPath(d.storage_path);
    setPreviewVoiceName(d.voice_name);
    if (pushToNs) {
      toast.success(d.pushed_to_ns ? t("greeting.activated") : `${t("greeting.pushFailed")}: ${d.push_error}`);
      onProfileChange?.();
    } else {
      toast.success(t("greeting.audioGenerated"));
    }
  };

  return (
    <div className="space-y-4 pb-8" style={{ background: TOKENS.bg }}>
      {/* Header */}
      <div>
        <h2 className="text-[18px] font-bold" style={{ color: TOKENS.text }}>{t("greeting.title")}</h2>
        <p className="text-[13px] mt-1" style={{ color: TOKENS.muted }}>{t("greeting.subtitle")}</p>
      </div>

      {/* Current greeting card */}
      <div className="rounded-2xl p-4" style={{ background: TOKENS.card, border: `1px solid ${TOKENS.border}` }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] uppercase tracking-wider" style={{ color: TOKENS.muted }}>{t("greeting.current")}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
            style={profile.voicemail_greeting_active
              ? { background: "rgba(16,185,129,0.15)", color: "#10B981" }
              : { background: "rgba(245,158,11,0.15)", color: "#F59E0B" }}>
            {profile.voicemail_greeting_active ? t("greeting.active") : t("greeting.default")}
          </span>
        </div>
        {currentAudioUrl ? (
          <>
            <audio controls src={currentAudioUrl} className="w-full h-9 my-2" style={{ filter: "invert(0.9)" }} />
            {profile.voicemail_greeting_text && (
              <p className="text-[12px] italic" style={{ color: TOKENS.muted }}>
                "{profile.voicemail_greeting_text.slice(0, 120)}{profile.voicemail_greeting_text.length > 120 ? "…" : ""}"
              </p>
            )}
            {profile.voicemail_greeting_updated_at && (
              <p className="text-[10px] mt-1" style={{ color: TOKENS.muted }}>
                {t("greeting.updated")} {new Date(profile.voicemail_greeting_updated_at).toLocaleDateString(lang === "en" ? "en-CA" : "fr-CA")}
              </p>
            )}
          </>
        ) : (
          <div className="text-center py-4">
            <Mic className="w-8 h-8 mx-auto mb-2 opacity-40" style={{ color: TOKENS.muted }} />
            <p className="text-[13px]" style={{ color: TOKENS.text }}>{t("greeting.noCustom")}</p>
            <p className="text-[11px] mt-1" style={{ color: TOKENS.muted }}>{t("greeting.noCustomSub")}</p>
          </div>
        )}
      </div>

      {/* Step 1 - Voice */}
      <div>
        <div className="text-[10px] uppercase tracking-widest mb-2 font-semibold" style={{ color: TOKENS.muted }}>{t("greeting.chooseVoice")}</div>
        {voicesError && <div className="text-[12px] p-3 rounded-xl" style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444" }}>{t("greeting.voiceLoadFailed")} {voicesError}</div>}
        {!voices && !voicesError && (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: TOKENS.card }} />)}
          </div>
        )}
        {voices && (
          <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
            {voices.map((v) => (
              <button key={v.voice_id} onClick={() => setSelectedVoice(v.voice_id)}
                className="text-left p-3 rounded-xl transition"
                style={{
                  background: selectedVoice === v.voice_id ? "#0D2A4A" : TOKENS.card,
                  border: `1px solid ${selectedVoice === v.voice_id ? TOKENS.borderActive : TOKENS.border}`,
                }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[13px] font-semibold" style={{ color: TOKENS.text }}>
                    {v.gender === "F" ? "👩" : "👨"} {v.name}
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(46,155,220,0.15)", color: TOKENS.borderActive }}>{v.language}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] px-1.5 py-0.5 rounded uppercase font-semibold"
                    style={v.category === "professional"
                      ? { background: "rgba(59,130,246,0.15)", color: "#3B82F6" }
                      : v.category === "natural"
                      ? { background: "rgba(16,185,129,0.15)", color: "#10B981" }
                      : { background: "rgba(155,127,232,0.15)", color: "#9B7FE8" }}>
                    {v.category === "professional" ? "Pro" : v.category === "natural" ? t("greeting.natural") : t("greeting.custom")}
                  </span>
                  {v.preview_url && (
                    <button onClick={(e) => { e.stopPropagation(); playVoicePreview(v); }}
                      className="text-[10px] px-2 py-0.5 rounded flex items-center gap-1"
                      style={{ background: "rgba(255,255,255,0.05)", color: TOKENS.text }}>
                      {previewing === v.voice_id ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />} {t("greeting.preview")}
                    </button>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Step 2 - Text */}
      <div>
        <div className="text-[10px] uppercase tracking-widest mb-2 font-semibold" style={{ color: TOKENS.muted }}>{t("greeting.writeMessage")}</div>
        <div className="flex gap-2 overflow-x-auto pb-2 mb-2 -mx-1 px-1">
          {TEMPLATES.map((t) => (
            <button key={t.key} onClick={() => applyTemplate(t.key)}
              className="text-[11px] px-3 py-1.5 rounded-full whitespace-nowrap font-medium transition"
              style={activeTemplate === t.key
                ? { background: TOKENS.borderActive, color: "white" }
                : { background: TOKENS.card, color: TOKENS.text, border: `1px solid ${TOKENS.border}` }}>
              {t.lang === "en" ? t.label : (t.key === "pro_fr" ? (lang === "en" ? "🏢 Professional" : t.label) : t.key === "out_fr" ? (lang === "en" ? "📞 Away" : t.label) : t.key === "ah_fr" ? (lang === "en" ? "🌙 Evening/WE" : t.label) : t.label)}
            </button>
          ))}
        </div>
        <textarea value={text} onChange={(e) => { setText(e.target.value.slice(0, 500)); setActiveTemplate(null); }}
          placeholder={t("greeting.placeholder")}
          className="w-full rounded-xl p-3 text-[14px] resize-y outline-none"
          style={{ background: TOKENS.card, border: `1px solid ${TOKENS.border}`, color: TOKENS.text, minHeight: 160, lineHeight: 1.7 }} />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] font-semibold" style={{ color: counterColor }}>{charCount}/500 {t("greeting.chars")}</span>
          <button onClick={improveText} disabled={improving}
            className="text-[11px] px-3 py-1.5 rounded-lg flex items-center gap-1 font-medium disabled:opacity-50"
            style={{ background: "rgba(155,127,232,0.15)", color: "#9B7FE8" }}>
            <Sparkles className="w-3.5 h-3.5" /> {improving ? "..." : t("greeting.improve")}
          </button>
        </div>
      </div>

      {/* Step 3 - Generate */}
      <div>
        <div className="text-[10px] uppercase tracking-widest mb-2 font-semibold" style={{ color: TOKENS.muted }}>{t("greeting.previewGenerate")}</div>
        <button onClick={() => generate(false)}
          disabled={!selectedVoice || text.length < 10 || generating}
          className="w-full h-[52px] rounded-xl text-[15px] font-semibold text-white disabled:opacity-50 transition"
          style={{ background: "linear-gradient(135deg,#1A4A8A,#2E9BDC)" }}>
          {generating ? genStep : t("greeting.generateAudio")}
        </button>

        {previewUrl && (
          <div className="mt-3 rounded-2xl p-4"
            style={{ background: "linear-gradient(135deg,rgba(46,155,220,0.1),rgba(0,212,170,0.1))", border: "1px solid rgba(46,155,220,0.3)" }}>
            <div className="text-[15px] font-semibold mb-2" style={{ color: "#00D4AA" }}>{t("greeting.audioSuccess")}</div>
            <audio controls src={previewUrl} className="w-full h-9 mb-3" style={{ filter: "invert(0.9)" }} />
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.05)", color: TOKENS.text }}>
                {t("greeting.voice")} : {previewVoiceName}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => generate(false)} disabled={generating}
                className="h-11 rounded-xl text-[13px] font-medium flex items-center justify-center gap-1.5"
                style={{ background: TOKENS.card, color: TOKENS.text, border: `1px solid ${TOKENS.border}` }}>
                <RotateCw className="w-4 h-4" /> {t("greeting.regenerate")}
              </button>
              <button onClick={() => generate(true)} disabled={generating}
                className="h-11 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-1.5 text-white"
                style={{ background: "linear-gradient(135deg,#10B981,#00A88A)" }}>
                <Check className="w-4 h-4" /> {t("greeting.activate")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Advanced settings */}
      <button onClick={() => setShowSettings((s) => !s)}
        className="w-full flex items-center justify-between text-[12px] px-3 py-2 rounded-xl"
        style={{ background: TOKENS.card, color: TOKENS.muted, border: `1px solid ${TOKENS.border}` }}>
        <span className="flex items-center gap-2"><Settings2 className="w-3.5 h-3.5" /> {t("greeting.advanced")}</span>
        {showSettings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {showSettings && (
        <div className="rounded-xl p-4 space-y-3" style={{ background: TOKENS.card, border: `1px solid ${TOKENS.border}` }}>
          {([
            ["stability", t("greeting.stability")],
            ["similarity_boost", t("greeting.similarity")],
            ["style", t("greeting.style")],
          ] as const).map(([k, label]) => (
            <div key={k}>
              <div className="flex justify-between text-[11px] mb-1" style={{ color: TOKENS.muted }}>
                <span>{label}</span><span>{settings[k].toFixed(2)}</span>
              </div>
              <input type="range" min={0} max={1} step={0.05} value={settings[k]}
                onChange={(e) => setSettings((s) => ({ ...s, [k]: Number(e.target.value) }))}
                className="w-full" />
            </div>
          ))}
          <button onClick={() => setSettings({ stability: 0.6, similarity_boost: 0.8, style: 0.3 })}
            className="text-[11px]" style={{ color: TOKENS.muted }}>{t("greeting.reset")}</button>
        </div>
      )}
    </div>
  );
}
