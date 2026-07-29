// Phase 4.1 — Bottom sheet for in-call audio controls.
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Volume2, Bluetooth, Headphones, X } from "lucide-react";
import { audioRouter, type AudioRoute } from "@/lib/planipret/audio/audioRouter";
import { bluetoothManager, type BtDevice } from "@/lib/planipret/audio/bluetoothManager";
import { NC_MODE_LABELS, type NCMode, getAudioConstraints } from "@/lib/planipret/audio/audioConstraints";
import { startVad, type VadAutoMute, type VadHandle } from "@/lib/planipret/audio/vad";
import { applyRnnoise } from "@/lib/planipret/audio/rnnoise";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Caller may already hold a mic stream; if not we capture one. */
  stream?: MediaStream | null;
  onMuteChange?: (muted: boolean) => void;
}

export default function CallAudioSheet({ open, onClose, stream, onMuteChange }: Props) {
  const { lang } = useMplanipretLang();
  const [route, setRoute] = useState<AudioRoute>("earpiece");
  const [devices, setDevices] = useState<BtDevice[]>([]);
  const [muted, setMuted] = useState(false);
  const [ncMode, setNcMode] = useState<NCMode>(() => (localStorage.getItem("pp_nc_mode") as NCMode) || "standard");
  const [autoMute, setAutoMute] = useState<VadAutoMute>(() => (localStorage.getItem("pp_auto_mute") as VadAutoMute) || "off");
  const [level, setLevel] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const ownedStream = useRef<MediaStream | null>(null);
  const vad = useRef<VadHandle | null>(null);

  useEffect(() => {
    if (!open) return;
    audioRouter.getCurrentRoute().then(setRoute).catch(() => {});
    return bluetoothManager.subscribe(setDevices);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      let s = stream ?? null;
      if (!s) {
        try {
          s = await navigator.mediaDevices.getUserMedia(getAudioConstraints(ncMode));
          ownedStream.current = s;
        } catch { return; }
      }
      if (ncMode === "office") s = await applyRnnoise(s).catch(() => s!);
      if (cancelled || !s) return;
      vad.current?.stop();
      vad.current = startVad({
        stream: s, autoMute,
        onLevel: setLevel,
        onEvent: (e) => setSpeaking(e === "speaking"),
        onAutoMute: () => { setMuted(true); onMuteChange?.(true); },
      });
    })();
    return () => {
      cancelled = true;
      vad.current?.stop(); vad.current = null;
      if (ownedStream.current) {
        ownedStream.current.getTracks().forEach((t) => t.stop());
        ownedStream.current = null;
      }
    };
  }, [open, ncMode, stream]);

  useEffect(() => { vad.current?.setAutoMute(autoMute); }, [autoMute]);

  const setRouteAnd = async (r: AudioRoute) => { await audioRouter.setRoute(r); setRoute(r); };
  const pickNc = (m: NCMode) => { localStorage.setItem("pp_nc_mode", m); setNcMode(m); };
  const pickAutoMute = (m: VadAutoMute) => { localStorage.setItem("pp_auto_mute", m); setAutoMute(m); };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end" style={{ background: "rgba(8,12,24,0.55)" }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full"
        style={{
          background: "var(--pp-bg-elevated)", borderTopLeftRadius: 22, borderTopRightRadius: 22,
          padding: 18, maxHeight: "86vh", overflowY: "auto",
          border: `2px solid ${speaking ? "rgba(34,197,94,0.55)" : "transparent"}`,
          boxShadow: "0 -10px 30px rgba(0,0,0,0.35)",
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 style={{ fontFamily: "Urbanist,sans-serif", fontWeight: 700, fontSize: 16, color: "var(--pp-text-primary)" }}>
            {lang === "fr" ? "Audio en appel" : "In-call audio"}
          </h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "var(--pp-bg-base)", color: "var(--pp-text-secondary)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* VU meter */}
        <div className="flex items-end gap-1 h-10 mb-4">
          {Array.from({ length: 10 }, (_, i) => {
            const on = i < level;
            const h = 8 + i * 3;
            return (
              <div key={i} style={{
                width: "100%", height: h, borderRadius: 3,
                background: on
                  ? `linear-gradient(180deg, #2E9BDC, ${i > 7 ? "#EF4444" : i > 5 ? "#EAB308" : "#22C55E"})`
                  : "var(--pp-bg-border-2)",
                transition: "background 80ms linear",
              }} />
            );
          })}
        </div>

        {/* Mic + speaker row */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            onClick={() => { const v = !muted; setMuted(v); onMuteChange?.(v); }}
            className="rounded-xl flex items-center justify-center gap-2 py-3"
            style={{
              background: muted ? "rgba(239,68,68,0.15)" : "var(--pp-bg-base)",
              color: muted ? "#EF4444" : "var(--pp-text-primary)",
              border: "1px solid var(--pp-bg-border-2)", fontSize: 13, fontWeight: 600,
            }}>
            {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            {muted ? (lang === "fr" ? "Activer micro" : "Unmute") : (lang === "fr" ? "Couper micro" : "Mute")}
          </button>
          <div className="grid grid-cols-3 gap-1">
            <RouteBtn icon={<Volume2 className="w-4 h-4" />} active={route === "speaker"} onClick={() => setRouteAnd("speaker")} />
            <RouteBtn icon={<Headphones className="w-4 h-4" />} active={route === "earpiece"} onClick={() => setRouteAnd("earpiece")} />
            <RouteBtn icon={<Bluetooth className="w-4 h-4" />} active={route === "bluetooth"} onClick={() => setRouteAnd("bluetooth")} />
          </div>
        </div>

        {/* NC mode */}
        <div className="mb-4">
          <p className="mb-1.5" style={{ fontSize: 11, fontWeight: 700, color: "var(--pp-text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
            {lang === "fr" ? "Annulation de bruit" : "Noise cancellation"}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(["standard", "office", "phone"] as NCMode[]).map((m) => {
              const meta = NC_MODE_LABELS[m];
              const active = ncMode === m;
              return (
                <button key={m} onClick={() => pickNc(m)} className="rounded-lg p-2 text-left"
                  style={{
                    background: active ? "rgba(46,155,220,0.15)" : "var(--pp-bg-base)",
                    border: `1px solid ${active ? "rgba(46,155,220,0.55)" : "var(--pp-bg-border-2)"}`,
                  }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--pp-text-primary)" }}>{lang === "fr" ? meta.fr : meta.en}</div>
                  <div style={{ fontSize: 10, color: "var(--pp-text-muted)" }}>{lang === "fr" ? meta.desc_fr : meta.desc_en}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Auto-mute */}
        <div className="mb-4">
          <p className="mb-1.5" style={{ fontSize: 11, fontWeight: 700, color: "var(--pp-text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
            {lang === "fr" ? "Auto-coupure si silence" : "Auto-mute on silence"}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(["off", "30s", "60s"] as VadAutoMute[]).map((m) => {
              const active = autoMute === m;
              const lbl = m === "off" ? (lang === "fr" ? "Désactivé" : "Off") : m;
              return (
                <button key={m} onClick={() => pickAutoMute(m)} className="rounded-lg py-2 text-center"
                  style={{
                    background: active ? "rgba(46,155,220,0.15)" : "var(--pp-bg-base)",
                    border: `1px solid ${active ? "rgba(46,155,220,0.55)" : "var(--pp-bg-border-2)"}`,
                    fontSize: 12, fontWeight: 600, color: "var(--pp-text-primary)",
                  }}>{lbl}</button>
              );
            })}
          </div>
        </div>

        {/* Bluetooth devices */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--pp-text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
              {lang === "fr" ? "Appareils Bluetooth" : "Bluetooth devices"}
            </p>
            <button onClick={() => bluetoothManager.scanAudioDevices()}
              style={{ fontSize: 11, fontWeight: 700, color: "#2E9BDC" }}>
              {lang === "fr" ? "Scanner" : "Scan"}
            </button>
          </div>
          {devices.length === 0 ? (
            <div className="rounded-lg p-3 text-center" style={{ background: "var(--pp-bg-base)", border: "1px solid var(--pp-bg-border-2)", fontSize: 12, color: "var(--pp-text-muted)" }}>
              {lang === "fr" ? "Aucun appareil détecté" : "No device detected"}
            </div>
          ) : (
            <div className="space-y-1.5">
              {devices.map((d) => (
                <button key={d.id} onClick={() => bluetoothManager.connect(d.id, d.name)}
                  className="w-full rounded-lg p-2.5 flex items-center justify-between"
                  style={{ background: "var(--pp-bg-base)", border: "1px solid var(--pp-bg-border-2)" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--pp-text-primary)" }}>{d.name}</span>
                  <Bluetooth className="w-4 h-4" style={{ color: "#2E9BDC" }} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RouteBtn({ icon, active, onClick }: { icon: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-xl flex items-center justify-center py-3"
      style={{
        background: active ? "rgba(46,155,220,0.18)" : "var(--pp-bg-base)",
        color: active ? "#2E9BDC" : "var(--pp-text-secondary)",
        border: `1px solid ${active ? "rgba(46,155,220,0.55)" : "var(--pp-bg-border-2)"}`,
      }}>
      {icon}
    </button>
  );
}
