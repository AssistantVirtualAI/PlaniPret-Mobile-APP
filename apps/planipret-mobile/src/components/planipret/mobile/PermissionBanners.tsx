// Inline denial banners for mic / notifications / contacts.
import { useEffect, useCallback, useState } from "react";
import { Bell, Mic, Users } from "lucide-react";
import { getPermissionStatuses } from "@/lib/native/permissions/orchestrator";
import { openAppSettings, isNative } from "@/lib/native/permissions/platform";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

type Kind = "notifications" | "microphone" | "contacts";
const iconFor: Record<Kind, any> = { notifications: Bell, microphone: Mic, contacts: Users };

const label: Record<"fr" | "en", Record<Kind, string>> = {
  fr: {
    notifications: "Notifications désactivées. Activez-les pour recevoir vos appels en arrière-plan.",
    microphone: "Microphone désactivé. Activez-le pour passer et recevoir des appels.",
    contacts: "Contacts désactivés. Activez-les pour identifier vos appelants.",
  },
  en: {
    notifications: "Notifications disabled. Enable them to receive calls in the background.",
    microphone: "Microphone disabled. Enable it to place and receive calls.",
    contacts: "Contacts disabled. Enable them to identify your callers.",
  },
};

export default function PermissionBanners() {
  const { lang } = useMplanipretLang();
  const [denied, setDenied] = useState<Kind[]>([]);

  // Interroge l'API système réelle (pas le cache) — corrige le bug où les
  // bannières restaient affichées après que l'utilisateur accordait la permission
  const checkPermissions = useCallback(async () => {
    if (!(await isNative())) return;
    const s = await getPermissionStatuses();
    const list: Kind[] = [];
    if (s.notifications === "denied") list.push("notifications");
    if (s.microphone === "denied") list.push("microphone");
    if (s.contacts === "denied") list.push("contacts");
    setDenied(list);
  }, []);

  useEffect(() => {
    // Vérification initiale
    checkPermissions();

    // Re-vérifier quand l'app revient au premier plan (après réglages iOS/Android)
    const onVisible = () => { if (document.visibilityState === "visible") checkPermissions(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    // Re-vérifier via Capacitor appStateChange (iOS/Android)
    let removeListener: (() => void) | undefined;
    import("@capacitor/app").then(({ App }) => {
      App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) checkPermissions();
      }).then((h) => { removeListener = () => h.remove(); }).catch(() => {});
    }).catch(() => {});

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      removeListener?.();
    };
  }, [checkPermissions]);

  if (!denied.length) return null;
  const key = lang === "en" ? "en" : "fr";

  return (
    <div className="flex flex-col gap-2 px-3 pt-2">
      {denied.map((k) => {
        const Icon = iconFor[k];
        return (
          <div
            key={k}
            role="alert"
            className="flex items-start gap-3 rounded-xl p-3"
            style={{ background: "rgba(232,76,76,0.10)", border: "1px solid rgba(232,76,76,0.35)" }}
          >
            <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#E84C4C" }} />
            <div className="flex-1 text-[12.5px] leading-snug" style={{ color: "var(--pp-text-primary)" }}>
              {label[key][k]}
              <button
                onClick={openAppSettings}
                className="ml-2 underline font-semibold"
                style={{ color: "var(--pp-brand-accent)" }}
              >
                {lang === "fr" ? "Ouvrir les réglages" : "Open Settings"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
