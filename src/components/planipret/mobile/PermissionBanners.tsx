// Inline denial banner — compact, microphone only (le plus critique pour VoIP).
// N'affiche qu'une seule bannière pour ne pas surcharger l'écran.
import { useEffect, useState } from "react";
import { Mic } from "lucide-react";
import { getPermissionStatuses } from "@/lib/native/permissions/orchestrator";
import { openAppSettings, isNative } from "@/lib/native/permissions/platform";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

export default function PermissionBanners() {
  const { lang } = useMplanipretLang();
  const [micDenied, setMicDenied] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    (async () => {
      if (!(await isNative())) return;
      const s = await getPermissionStatuses();
      if (s.microphone === "denied") setMicDenied(true);
    })();
  }, []);

  if (!micDenied || dismissed) return null;

  const isFr = lang !== "en";

  return (
    <div className="px-4 pt-1">
      <div
        role="alert"
        className="flex items-center gap-2.5 rounded-xl px-3 py-2.5"
        style={{
          background: "rgba(232,76,76,0.08)",
          border: "1px solid rgba(232,76,76,0.25)",
        }}
      >
        <Mic className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#E84C4C" }} />
        <div className="flex-1 text-[11.5px] leading-snug" style={{ color: "var(--pp-text-secondary)" }}>
          {isFr ? "Microphone désactivé." : "Microphone disabled."}
          <button
            onClick={openAppSettings}
            className="ml-1.5 underline font-semibold"
            style={{ color: "var(--pp-brand-accent)" }}
          >
            {isFr ? "Réglages" : "Settings"}
          </button>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-[11px] px-1.5 py-0.5 rounded"
          style={{ color: "var(--pp-text-faint)" }}
          aria-label="Fermer"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
