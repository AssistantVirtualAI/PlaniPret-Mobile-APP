// Écrans pilotés à distance : maintenance, mise à jour obligatoire, bannière.
// Les valeurs proviennent du portail admin via `mobile-config`.
import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Download, Megaphone, X } from "lucide-react";
import { useRemoteConfig } from "@/hooks/useRemoteConfig";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { checkAndApplyOtaUpdate } from "@/lib/native/otaUpdater";

const BANNER_DISMISS_KEY = "pp.remoteBanner.dismissed";

function FullScreen({
  icon, title, message, action,
}: { icon: ReactNode; title: string; message: string; action?: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-4 px-8 text-center"
      style={{ background: "var(--pp-bg-base, #0F172A)", color: "var(--pp-text-primary, #fff)" }}
    >
      <div className="flex items-center justify-center w-16 h-16 rounded-full"
        style={{ background: "rgba(46,155,220,0.12)" }}>
        {icon}
      </div>
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="text-sm opacity-80 max-w-xs leading-relaxed">{message}</p>
      {action}
    </div>
  );
}

export default function RemoteConfigGate({ children }: { children: ReactNode }) {
  const { lang } = useMplanipretLang();
  const fr = lang !== "en";
  const { maintenance, maintenanceMessage, forceUpdate, config, loading } = useRemoteConfig();
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(BANNER_DISMISS_KEY) === (config.messages.banner ?? ""); }
    catch { return false; }
  });

  // Vérifie une mise à jour de contenu au démarrage (silencieuse).
  useEffect(() => { void checkAndApplyOtaUpdate(); }, []);

  if (!loading && maintenance) {
    return (
      <FullScreen
        icon={<AlertTriangle className="w-7 h-7" style={{ color: "#F59E0B" }} />}
        title={fr ? "Maintenance en cours" : "Maintenance in progress"}
        message={
          maintenanceMessage ||
          (fr
            ? "L'application est temporairement indisponible. Réessayez dans quelques minutes."
            : "The app is temporarily unavailable. Please try again in a few minutes.")
        }
      />
    );
  }

  if (!loading && forceUpdate) {
    return (
      <FullScreen
        icon={<Download className="w-7 h-7" style={{ color: "#2E9BDC" }} />}
        title={fr ? "Mise à jour requise" : "Update required"}
        message={
          fr
            ? "Une nouvelle version est nécessaire pour continuer. Mettez à jour l'application depuis l'App Store ou Google Play."
            : "A newer version is required to continue. Please update the app from the App Store or Google Play."
        }
      />
    );
  }

  const banner = config.messages.banner;

  return (
    <>
      {banner && !dismissed && (
        <div
          className="flex items-center gap-2 px-4 py-2 text-[13px]"
          style={{
            background: "rgba(46,155,220,0.12)",
            borderBottom: "1px solid var(--pp-bg-border, rgba(255,255,255,0.08))",
            color: "var(--pp-text-primary, #fff)",
          }}
        >
          <Megaphone className="w-4 h-4 shrink-0" style={{ color: "#2E9BDC" }} />
          <span className="flex-1">{banner}</span>
          <button
            aria-label={fr ? "Fermer" : "Dismiss"}
            onClick={() => {
              try { localStorage.setItem(BANNER_DISMISS_KEY, banner); } catch { /* noop */ }
              setDismissed(true);
            }}
          >
            <X className="w-4 h-4 opacity-70" />
          </button>
        </div>
      )}
      {children}
    </>
  );
}
