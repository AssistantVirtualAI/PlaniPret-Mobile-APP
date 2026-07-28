import { useEffect, useState, type CSSProperties } from "react";
import { Bell, Settings as SettingsIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useMplanipretTheme } from "@/hooks/useMplanipretTheme";
import { supabase } from "@/integrations/supabase/client";
import MobileProfileSheet from "./MobileProfileSheet";

const STATUS_COLOR: Record<string, string> = {
  available: "#10B981",
  busy: "#EF4444",
  break: "#F59E0B",
  offline: "#94A3B8",
};

export default function MobileHeaderControls({ profile, reloadProfile }: { profile: any; reloadProfile: () => Promise<void> | void }) {
  const { theme } = useMplanipretTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  // Mirror the active theme on <html> so Tailwind `dark:` utilities react too.
  useEffect(() => {
    if (theme === "dark") document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [theme]);

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

  const initials = (profile?.full_name || profile?.email || "?")
    .split(/\s+/).map((s: string) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  const status = profile?.status ?? "available";

  const btn: CSSProperties = {
    width: 34, height: 34,
    background: "var(--pp-bg-elevated)",
    border: "1px solid var(--pp-bg-border-2)",
    color: "var(--pp-text-secondary)",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  };

  return (
    <>
      <div className="ml-auto flex items-center gap-2">
        {/* Settings */}
        <button
          onClick={() => navigate("/mplanipret/more")}
          style={btn}
          aria-label="Settings"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>

        {/* Bell */}
        <button
          onClick={() => navigate("/mplanipret/notifications")}
          className="relative"
          style={btn}
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4" />
          {unread > 0 && (
            <span style={{
              position: "absolute", top: -3, right: -3, minWidth: 14, height: 14, padding: "0 3px",
              borderRadius: 999, background: "#EF4444", color: "#fff", fontSize: 9, fontWeight: 800,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              border: "1.5px solid var(--pp-bg-surface)",
            }}>{unread > 99 ? "99+" : unread}</span>
          )}
        </button>

        {/* Avatar initiales + status dot */}
        <button
          onClick={() => setOpen(true)}
          className="relative flex items-center justify-center rounded-full font-bold text-white"
          style={{
            width: 34, height: 34,
            background: "linear-gradient(135deg, #1A4A8A, #2E9BDC)",
            border: "1px solid var(--pp-bg-border-2)",
            fontSize: 12,
            flexShrink: 0,
          }}
          aria-label="Profile"
        >
          {initials}
          <span
            className="absolute -bottom-0.5 -right-0.5 rounded-full"
            style={{ width: 9, height: 9, background: STATUS_COLOR[status], border: "1.5px solid var(--pp-bg-surface)" }}
          />
        </button>
      </div>
      {open && <MobileProfileSheet profile={profile} reloadProfile={reloadProfile} onClose={() => setOpen(false)} />}
    </>
  );
}
