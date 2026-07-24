import { useEffect, useState } from "react";
import { Bell, Settings as SettingsIcon, Sun, Moon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { supabase } from "@/integrations/supabase/client";

export default function MobileHeaderControls({ profile, reloadProfile: _reloadProfile }: { profile: any; reloadProfile: () => Promise<void> | void }) {
  const { lang, setLang } = useMplanipretLang();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [dark, setDark] = useState<boolean>(() => localStorage.getItem("planipret_dark") !== "0");

  useEffect(() => {
    if (dark) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
    localStorage.setItem("planipret_dark", dark ? "1" : "0");
  }, [dark]);

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

  const toggleLang = async () => {
    const next = lang === "fr" ? "en" : "fr";
    setLang(next);
    if (profile?.user_id) {
      try {
        await supabase.from("planipret_profiles").update({ language: next }).eq("user_id", profile.user_id);
      } catch { /* noop */ }
    }
  };

  const pill: React.CSSProperties = {
    width: 34, height: 34, background: "var(--pp-bg-elevated)",
    border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)",
  };

  return (
    <div className="ml-auto flex items-center gap-2">
      <button
        onClick={toggleLang}
        className="flex items-center justify-center rounded-full text-[11px] font-bold"
        style={pill}
        aria-label="Language"
      >
        {lang === "fr" ? "FR" : "EN"}
      </button>
      <button
        onClick={() => setDark((d) => !d)}
        className="flex items-center justify-center rounded-full"
        style={pill}
        aria-label="Theme"
      >
        {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>
      <button onClick={() => navigate("/mplanipret/notifications")}
        className="relative flex items-center justify-center rounded-full"
        style={pill}
        aria-label="Notifications">
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
      <button onClick={() => navigate("/mplanipret/more")}
        className="flex items-center justify-center rounded-full"
        style={pill}
        aria-label="Settings">
        <SettingsIcon className="w-4 h-4" />
      </button>
    </div>
  );
}
