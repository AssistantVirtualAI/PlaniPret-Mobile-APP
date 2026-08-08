// Pastille flottante affichée quand l'écran d'appel est minimisé.
// L'appel n'est jamais démonté : seul l'affichage plein écran est masqué.
import { useEffect, useState } from "react";
import { Phone, PhoneOff, Users } from "lucide-react";
import { callUi } from "@/lib/planipret/callUiStore";
import type { PpSipSnapshot } from "@/lib/planipret/sip/ppSipProvider";
import { formatSipParty } from "@/lib/planipret/sip/formatSipParty";

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function PpCallPill({
  snap,
  onHangup,
}: {
  snap: PpSipSnapshot;
  onHangup: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (snap.callState !== "active" || !snap.startedAt) return;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - (snap.startedAt ?? Date.now())) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [snap.callState, snap.startedAt]);

  const party = formatSipParty(snap.remoteIdentity, "fr", snap.remoteNumber);
  const label = snap.conference ? "Conférence" : party.name;
  const status = snap.callState === "held" ? "En attente"
    : snap.callState === "ringing-out" ? "Sonnerie…"
    : snap.callState === "ringing-in" ? "Appel entrant"
    : fmt(elapsed);

  return (
    <div
      className="fixed left-0 right-0 z-[70] px-3"
      style={{ bottom: `calc(72px + env(safe-area-inset-bottom, 0px))` }}
    >
      <button
        onClick={() => callUi.restore()}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left active:scale-[0.99] transition"
        style={{
          background: "linear-gradient(135deg, #0C5C33, #14964F)",
          boxShadow: "0 10px 30px rgba(20,150,79,0.35)",
          color: "white",
        }}
      >
        <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
          style={{ background: "rgba(255,255,255,0.18)" }}>
          {snap.conference ? <Users className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold truncate">{label}</span>
          <span className="block text-[11px] opacity-80">{status} · Toucher pour revenir</span>
        </span>
        <span
          role="button"
          aria-label="Raccrocher"
          onClick={(e) => { e.stopPropagation(); onHangup(); }}
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{ background: "rgba(0,0,0,0.28)" }}
        >
          <PhoneOff className="w-4 h-4" />
        </span>
      </button>
    </div>
  );
}
