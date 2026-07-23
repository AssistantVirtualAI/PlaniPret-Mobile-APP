import { useEffect, useState } from "react";
import { Bell, Settings as SettingsIcon, Globe, Moon, Sun } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { useMplanipretTheme } from "@/hooks/useMplanipretTheme";
import { supabase } from "@/integrations/supabase/client";

export default function MobileHeaderControls({ profile, reloadProfile }: { profile: any; reloadProfile: () => Promise<void> | void }) {
  const { t, lang, toggle: toggleLang } = useMplanipretLang();
  const { theme, toggle: toggleTheme } = useMplanipretTheme();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        if (!u?.user) return;
        const { count } = await supabase
          .from("planipret_ava_notifications" as any)
          .select("id", { count: "exact", head: true })
          .eq("user_id", u.user.id)
          .is("read_at", null);
        if (!cancelled) setUnread(count ?? 0);
      } catch { /* noop */ }
    };
    load();
    const timer = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  const handleLangToggle = async () => {
    toggleLang();
    // Persist language change to profile if available
    if (profile?.user_id) {
      const newLang = lang === "fr" ? "en" : "fr";
      try {
        await supabase.from("planipret_profiles").update({ language: newLang }).eq("user_id", profile.user_id);
        if (reloadProfile) await reloadProfile();
      } catch { /* noop */ }
    }
  };

  const btnStyle = {
    width: 34, height: 34,
    background: "var(--pp-bg-elevated)",
    border: "1px solid var(--pp-bg-border-2)",
    color: "var(--pp-text-secondary)",
  };

  return (
    <div className="ml-auto flex items-center gap-1.5">
      {/* Language toggle: FR / EN */}
      <button
        onClick={handleLangToggle}
        className="flex items-center justify-center rounded-full text-[10px] font-bold"
        style={btnStyle}
        aria-label={t("header.lang")}
      >
        <Globe className="w-3.5 h-3.5" />
      </button>

      {/* Theme toggle: dark / light */}
      <button
        onClick={toggleTheme}
        className="flex items-center justify-center rounded-full"
        style={btnStyle}
        aria-label={theme === "dark" ? "Mode clair" : "Mode sombre"}
      >
        {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
      </button>

      {/* Notifications */}
      <button
        onClick={() => navigate("/mplanipret/notifications")}
        className="relative flex items-center justify-center rounded-full"
        style={btnStyle}
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span style={{
            position: "absolute", top: -3, right: -3, minWidth: 16, height: 16, padding: "0 4px",
            borderRadius: 999, background: "#EF4444", color: "#fff", fontSize: 10, fontWeight: 800,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            border: "1.5px solid var(--pp-bg-surface)",
          }}>{unread > 99 ? "99+" : unread}</span>
        )}
      </button>

      {/* Settings / More */}
      <button
        onClick={() => navigate("/mplanipret/more")}
        className="flex items-center justify-center rounded-full"
        style={btnStyle}
        aria-label={t("header.profile")}
      >
        <SettingsIcon className="w-4 h-4" />
      </button>
    </div>
  );
}
