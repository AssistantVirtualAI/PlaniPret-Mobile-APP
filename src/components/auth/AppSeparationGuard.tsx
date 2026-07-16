import { useEffect, useState, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type App = "planipret" | "lemtel";

/**
 * Hard separation between Planipret and Lemtel apps.
 * - A Lemtel-only user cannot reach /planipret/* or /mplanipret.
 * - A Planipret-only user cannot reach Lemtel routes.
 * - Super admins bypass.
 */
export function AppSeparationGuard({ app, children }: { app: App; children: ReactNode }) {
  const navigate = useNavigate();
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancelled) setOk(true); return; } // let route-level auth handle anon
      const fn = app === "planipret" ? "is_lemtel_only" : "is_planipret_only";
      const { data, error } = await supabase.rpc(fn as any, { _user_id: user.id });
      if (cancelled) return;
      if (error) { setOk(true); return; }
      if (data === true) {
        const target = app === "planipret" ? "/portal" : "/planipret";
        navigate(target, { replace: true });
        setOk(false);
      } else {
        setOk(true);
      }
    })();
    return () => { cancelled = true; };
  }, [app, navigate]);

  if (ok === null) return null;
  if (!ok) return null;
  return <>{children}</>;
}
