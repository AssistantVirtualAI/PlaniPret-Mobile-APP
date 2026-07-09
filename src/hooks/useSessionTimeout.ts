import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { loginWithRedirect, ROUTES } from "@/lib/routes";

type Options = {
  enabled?: boolean;
  timeoutMinutes?: number;
  warningSeconds?: number;
};

const ACTIVITY_EVENTS = ["mousemove", "keydown", "touchstart", "click", "scroll"];

export function useSessionTimeout(opts: Options = {}) {
  const enabled = opts.enabled ?? true;
  const timeoutMs = (opts.timeoutMinutes ?? 30) * 60_000;
  const warningSec = opts.warningSeconds ?? 60;
  const navigate = useNavigate();
  const [warning, setWarning] = useState(false);
  const [countdown, setCountdown] = useState(warningSec);
  const lastActiveRef = useRef<number>(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetActivity = () => { lastActiveRef.current = Date.now(); if (warning) setWarning(false); };

  const logoutAuto = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const auth = supabase.auth;
      // Best-effort audit
      try {
        const tok = (await auth.getSession()).data.session?.access_token;
        if (tok && user) {
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pp-audit-log`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_id: user.id, action: "LOGOUT",
              metadata: { reason: "session_timeout" },
            }),
          }).catch(() => {});
        }
      } catch { /* ignore */ }
      await supabase.auth.signOut();
    } finally {
      toast.info("Votre session a expiré pour des raisons de sécurité (inactivité).");
      navigate(loginWithRedirect(ROUTES.MPLANIPRET), { replace: true });
    }
  };

  useEffect(() => {
    if (!enabled) return;
    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, resetActivity, { passive: true }));
    timerRef.current = setInterval(() => {
      const idle = Date.now() - lastActiveRef.current;
      if (idle >= timeoutMs && !warning) {
        setWarning(true);
        setCountdown(warningSec);
      } else if (warning) {
        setCountdown((c) => {
          if (c <= 1) { logoutAuto(); return 0; }
          return c - 1;
        });
      }
    }, 1000);
    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, resetActivity));
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, timeoutMs, warningSec, warning]);

  return {
    warning,
    countdown,
    dismiss: () => { resetActivity(); setWarning(false); },
    logoutNow: logoutAuto,
  };
}
