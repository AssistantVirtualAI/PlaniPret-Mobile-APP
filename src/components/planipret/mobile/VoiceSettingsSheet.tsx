// Minimal placeholder — full voice settings sheet to be implemented.
import { X } from "lucide-react";

interface Props { userId: string; onClose: () => void; }

export default function VoiceSettingsSheet({ onClose }: Props) {
  return (
    <div
      className="absolute inset-0 z-[80] flex items-end"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-2xl p-6"
        style={{ background: "var(--pp-bg-surface)", borderTop: "1px solid var(--pp-bg-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-semibold text-white">Réglages voix</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 text-white/70 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[13px] text-white/60">
          Les réglages voix sont configurés depuis le portail admin Planiprêt.
        </p>
      </div>
    </div>
  );
}
