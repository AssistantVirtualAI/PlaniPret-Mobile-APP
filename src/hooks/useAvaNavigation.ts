// useAvaNavigation — listens for AVA broadcast events on Realtime and
// performs navigation/UI side effects on the mobile app.
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
        // Optionally dispatch a window event for sheets/modals
        if (payload.client_id || payload.call_id) {
          window.dispatchEvent(new CustomEvent("ava:open", { detail: payload }));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, navigate]);
}
