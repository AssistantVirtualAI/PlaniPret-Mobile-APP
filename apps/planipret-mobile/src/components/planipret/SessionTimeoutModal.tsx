import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";

export default function SessionTimeoutModal() {
  const [cfg, setCfg] = useState<{ enabled: boolean; minutes: number }>({ enabled: true, minutes: 30 });
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("planipret_settings")
        .select("session_timeout_enabled, session_timeout_minutes")
        .limit(1)
        .maybeSingle();
      if (data) setCfg({
        enabled: data.session_timeout_enabled ?? true,
        minutes: data.session_timeout_minutes ?? 30,
      });
    })();
  }, []);

  const { warning, countdown, dismiss, logoutNow } = useSessionTimeout({
    enabled: cfg.enabled, timeoutMinutes: cfg.minutes, warningSeconds: 60,
  });

  if (!warning) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6"
      style={{ background: "rgba(6,13,26,0.85)", backdropFilter: "blur(6px)" }}>
      <div className="planipret-scope w-full max-w-sm pp-card" style={{ padding: 24 }}>
        <h2 style={{ fontFamily: "Inter,sans-serif", fontWeight: 700, fontSize: 18, color: "var(--pp-text-primary)", marginBottom: 8 }}>
          ⏱️ Session sur le point d'expirer
        </h2>
        <p style={{ fontSize: 13, color: "var(--pp-text-secondary)", marginBottom: 16 }}>
          Votre session expirera dans <strong style={{ color: "var(--pp-brand-accent)" }}>{countdown}</strong> secondes en raison d'inactivité.
        </p>
        <div className="flex gap-2">
          <button onClick={dismiss} className="pp-btn-primary flex-1">Je suis là</button>
          <button onClick={logoutNow} className="pp-btn-secondary flex-1">Se déconnecter</button>
        </div>
      </div>
    </div>
  );
}
