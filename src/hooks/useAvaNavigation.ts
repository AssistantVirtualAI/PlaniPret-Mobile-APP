// useAvaNavigation — listens for AVA broadcast events on Realtime and
// performs navigation/UI side effects on the mobile app.
//
// Emits these window events so screens can react without React-router state:
//  - "ava:open"                — { client_id | call_id }
//  - "ava:open-dialer"         — { number, autoDial? }
//  - "ava:open-sms-composer"   — { number, body }
//  - "ava:open-email-composer" — { to, subject, body }
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export function useAvaNavigation(userId: string | undefined | null) {
  const navigate = useNavigate();
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`ava-nav:${userId}`)
      .on("broadcast", { event: "navigate" }, (msg) => {
        const payload = (msg as any)?.payload ?? {};
        const route: string | undefined = payload.route;
        if (route) navigate(route);

        if (payload.open_dialer) {
          window.dispatchEvent(new CustomEvent("ava:open-dialer", { detail: payload.open_dialer }));
        }
        if (payload.open_sms_composer) {
          window.dispatchEvent(new CustomEvent("ava:open-sms-composer", { detail: payload.open_sms_composer }));
        }
        if (payload.open_email_composer) {
          window.dispatchEvent(new CustomEvent("ava:open-email-composer", { detail: payload.open_email_composer }));
        }
        if (payload.client_id || payload.call_id) {
          window.dispatchEvent(new CustomEvent("ava:open", { detail: payload }));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, navigate]);
}
