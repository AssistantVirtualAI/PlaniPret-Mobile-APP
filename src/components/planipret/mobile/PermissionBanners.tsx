// Inline denial banners for mic / notifications / contacts.
import { useEffect, useState } from "react";
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

  useEffect(() => {
    (async () => {
      if (!(await isNative())) return;
      const s = await getPermissionStatuses();
      const list: Kind[] = [];
      if (s.notifications === "denied") list.push("notifications");
      if (s.microphone === "denied") list.push("microphone");
      if (s.contacts === "denied") list.push("contacts");
      setDenied(list);
    })();
  }, []);

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
