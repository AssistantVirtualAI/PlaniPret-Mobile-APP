// Planipret mobile — ringtone picker for inbound calls (in-app SIP calls only,
// distinct from the phone's native ringtone). Persisted in localStorage.

import { useEffect, useRef, useState } from "react";
import { Bell, Play, Square, Vibrate } from "lucide-react";
import {
  RINGTONE_PRESETS,
  RINGTONE_KEY,
  RINGTONE_VOLUME_KEY,
  RINGTONE_VIBRATE_KEY,
  DEFAULT_RINGTONE_ID,
  getRingtonePreset,
  playRingtonePreset,
} from "@/lib/planipret/audio/ringtonePresets";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

export default function MRingtoneSettings() {
  const { lang } = useMplanipretLang();
  const fr = lang === "fr";
  const [selected, setSelected] = useState<string>(() => {
    try { return localStorage.getItem(RINGTONE_KEY) || DEFAULT_RINGTONE_ID; } catch { return DEFAULT_RINGTONE_ID; }
  });
  const [volume, setVolume] = useState<number>(() => {
    try { const v = Number(localStorage.getItem(RINGTONE_VOLUME_KEY)); return Number.isFinite(v) && v > 0 ? v : 1; } catch { return 1; }
  });
  const [vibrate, setVibrate] = useState<boolean>(() => {
    try { return localStorage.getItem(RINGTONE_VIBRATE_KEY) !== "0"; } catch { return true; }
  });
  const [previewing, setPreviewing] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => { try { localStorage.setItem(RINGTONE_KEY, selected); } catch {} }, [selected]);
  useEffect(() => { try { localStorage.setItem(RINGTONE_VOLUME_KEY, String(volume)); } catch {} }, [volume]);
  useEffect(() => { try { localStorage.setItem(RINGTONE_VIBRATE_KEY, vibrate ? "1" : "0"); } catch {} }, [vibrate]);
  useEffect(() => () => { stopRef.current?.(); }, []);

  const stopPreview = () => {
    stopRef.current?.();
    stopRef.current = null;
    setPreviewing(null);
  };

  const preview = (id: string) => {
    stopPreview();
    const preset = getRingtonePreset(id);
    if (!preset.steps.length) {
      try { (navigator as any).vibrate?.([400, 200, 400]); } catch {}
      return;
    }
    setPreviewing(id);
    stopRef.current = playRingtonePreset(preset, { volumeScale: volume });
    // auto-stop preview after 6s
    setTimeout(() => { setPreviewing((cur) => (cur === id ? (stopPreview(), null) : cur)); }, 6000);
  };

  const pick = (id: string) => {
    setSelected(id);
    preview(id);
  };

  return (
    <section
      className="rounded-3xl p-5 mb-4"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="flex items-center gap-2 mb-1">
        <Bell className="w-4 h-4 opacity-70" />
        <h3 className="text-sm font-semibold">{fr ? "Sonnerie des appels" : "Call ringtone"}</h3>
      </div>
      <p className="text-[11px] opacity-60 mb-4 leading-tight">
        {fr
          ? "S'applique aux appels reçus dans l'application (différente de la sonnerie native du téléphone)."
          : "Applies to calls received inside the app (different from the phone's native ringtone)."}
      </p>

      <div className="space-y-2">
        {RINGTONE_PRESETS.map((p) => {
          const active = p.id === selected;
          return (
            <div
              key={p.id}
              className="flex items-center gap-3 rounded-2xl px-3 py-3"
              style={{
                background: active ? "rgba(46,155,220,0.18)" : "rgba(255,255,255,0.05)",
                border: `1px solid ${active ? "rgba(46,155,220,0.5)" : "rgba(255,255,255,0.1)"}`,
              }}
            >
              <button className="flex-1 text-left" onClick={() => pick(p.id)}>
                <div className="text-sm font-medium">{p.label[fr ? "fr" : "en"]}</div>
                {active && (
                  <div className="text-[10px] opacity-70 mt-0.5">{fr ? "Sélectionnée" : "Selected"}</div>
                )}
              </button>
              <button
                aria-label={fr ? "Écouter" : "Preview"}
                onClick={() => (previewing === p.id ? stopPreview() : preview(p.id))}
                className="rounded-full p-2"
                style={{ background: "rgba(255,255,255,0.08)" }}
              >
                {previewing === p.id ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="opacity-80">{fr ? "Volume de la sonnerie" : "Ringtone volume"}</span>
          <span className="opacity-60">{Math.round(volume * 100)}%</span>
        </div>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="w-full"
        />
      </div>

      <div className="my-4 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />

      <button
        onClick={() => setVibrate((v) => !v)}
        className="w-full flex items-center gap-3 text-left"
      >
        <Vibrate className="w-4 h-4 opacity-70" />
        <div className="flex-1">
          <div className="text-sm">{fr ? "Vibration" : "Vibration"}</div>
          <div className="text-[11px] opacity-60">
            {fr ? "Vibrer en même temps que la sonnerie" : "Vibrate along with the ringtone"}
          </div>
        </div>
        <span
          className="w-10 h-6 rounded-full relative transition-colors"
          style={{ background: vibrate ? "rgba(46,155,220,0.8)" : "rgba(255,255,255,0.15)" }}
        >
          <span
            className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
            style={{ left: vibrate ? 18 : 2 }}
          />
        </span>
      </button>
    </section>
  );
}
