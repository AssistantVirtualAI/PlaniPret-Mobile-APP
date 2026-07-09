// Inline banner shown in the dialer after a failed call attempt due to a
// denied/unavailable microphone. Not a full-screen overlay — matches the
// industry standard contextual permission pattern (WhatsApp / Zoom / Teams).
import { MicOff } from "lucide-react";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

export default function MicDeniedBanner({ onDismiss }: { onDismiss?: () => void }) {
  const { lang } = useMplanipretLang();

  const openSettings = async () => {
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.getPlatform() === "ios") {
        window.open("app-settings:", "_system");
      } else if (Capacitor.getPlatform() === "android") {
        const { App } = await import("@capacitor/app");
        const info = await App.getInfo();
        window.open(`package:${info.id}`, "_system");
      }
    } catch {
      // Web preview: no-op.
    }
    onDismiss?.();
  };

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl p-3"
      style={{
        background: "rgba(232,76,76,0.10)",
        border: "1px solid rgba(232,76,76,0.35)",
      }}
    >
      <MicOff className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#E84C4C" }} />
      <div className="flex-1 text-[12.5px] leading-snug" style={{ color: "var(--pp-text-primary)" }}>
        {lang === "fr"
          ? "Microphone désactivé. Activez-le dans Réglages → Planiprêt → Microphone."
          : "Microphone disabled. Enable it in Settings → Planiprêt → Microphone."}
        <button
          onClick={openSettings}
          className="ml-2 underline font-semibold"
          style={{ color: "var(--pp-brand-accent)" }}
        >
          {lang === "fr" ? "Ouvrir les réglages" : "Open Settings"}
        </button>
      </div>
    </div>
  );
}
