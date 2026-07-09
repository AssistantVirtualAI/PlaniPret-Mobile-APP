import { useState } from "react";
import { Globe, Moon, Sun } from "lucide-react";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { useMplanipretTheme } from "@/hooks/useMplanipretTheme";
import MobileProfileSheet from "./MobileProfileSheet";

const STATUS_COLOR: Record<string, string> = {
  available: "#10B981",
  busy: "#EF4444",
  break: "#F59E0B",
  offline: "#94A3B8",
};

export default function MobileHeaderControls({ profile, reloadProfile }: { profile: any; reloadProfile: () => Promise<void> | void }) {
  const { t, lang, toggle: toggleLang } = useMplanipretLang();
  const { theme, toggle: toggleTheme } = useMplanipretTheme();
  const [open, setOpen] = useState(false);

  const initials = (profile?.full_name || profile?.email || "?")
    .split(/\s+/).map((s: string) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  const status = profile?.status ?? "available";

  return (
    <>
      <div className="ml-auto flex items-center gap-1.5">
        <button onClick={toggleLang}
          className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold"
          style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}
          aria-label={t("header.lang")}>
          <Globe className="w-3 h-3" />
          <span>{lang.toUpperCase()}</span>
        </button>
        <button onClick={toggleTheme}
          className="flex items-center justify-center rounded-full"
          style={{ width: 28, height: 28, background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}
          aria-label={t("header.theme")}>
          {theme === "light" ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
        </button>
        <button onClick={() => setOpen(true)}
          className="relative flex items-center justify-center rounded-full font-bold text-white"
          style={{
            width: 30, height: 30,
            background: "linear-gradient(135deg, #1A4A8A, #2E9BDC)",
            border: "1px solid var(--pp-bg-border-2)",
            fontSize: 11,
          }}
          aria-label={t("header.profile")}>
          {initials}
          <span className="absolute -bottom-0.5 -right-0.5 rounded-full"
            style={{ width: 9, height: 9, background: STATUS_COLOR[status], border: "1.5px solid var(--pp-bg-surface)" }} />
        </button>
      </div>
      {open && <MobileProfileSheet profile={profile} reloadProfile={reloadProfile} onClose={() => setOpen(false)} />}
    </>
  );
}
