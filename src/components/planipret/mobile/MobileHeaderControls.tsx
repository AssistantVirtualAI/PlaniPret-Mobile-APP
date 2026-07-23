import { useEffect, useState } from "react";
import { Bell, Settings as SettingsIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { supabase } from "@/integrations/supabase/client";

export default function MobileHeaderControls({ profile: _profile, reloadProfile: _reloadProfile }: { profile: any; reloadProfile: () => Promise<void> | void }) {
  const { t } = useMplanipretLang();
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

  return (
    <div className="ml-auto flex items-center gap-2">
      <button onClick={() => navigate("/mplanipret/notifications")}
        className="relative flex items-center justify-center rounded-full"
        style={{ width: 34, height: 34, background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}
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
        style={{ width: 34, height: 34, background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}
        aria-label={t("header.profile")}>
        <SettingsIcon className="w-4 h-4" />
      </button>
    </div>
  );
}
