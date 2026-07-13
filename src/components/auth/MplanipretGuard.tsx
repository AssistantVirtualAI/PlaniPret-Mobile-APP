import { ReactNode, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ROUTES } from "@/lib/routes";
import { recordRedirect } from "@/lib/debug/navDebug";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

/**
 * Dedicated access guard for the Planiprêt MOBILE app (`/mplanipret/*`).
 *
 * Rules:
 *  - Unauthenticated users stay on /mplanipret and see the mobile login.
 *  - Lemtel-only users are blocked (sent to /portal).
 *  - This guard will NEVER redirect to /planipret/admin — the admin portal
 *    is a completely separate surface. If the user has no Planiprêt profile
 *    we still let `PlanipretMobile` render its own "no profile" state so
 *    `/mplanipret` never collapses into the admin portal by accident.
 */
export function MplanipretGuard({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useMplanipretLang();
  const [state, setState] = useState<"checking" | "allow">("checking");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!user) {
        recordRedirect(location.pathname, ROUTES.MPLANIPRET, "MplanipretGuard", "no auth session — render inline mobile login");
        setState("allow");
        return;
      }

      // Block Lemtel-only users — they have no business in the Planiprêt mobile app.
      try {
        const { data: lemtelOnly } = await supabase.rpc("is_lemtel_only", { _user_id: user.id });
        if (cancelled) return;
        if (lemtelOnly === true) {
          recordRedirect(location.pathname, "/portal", "MplanipretGuard", "lemtel-only user");
          navigate("/portal", { replace: true });
          return;
        }
      } catch {
        // RPC failure should not push the user into the admin portal — fail open here.
      }

      setState("allow");
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "checking") {
    return (
      <div
        data-testid="mplanipret-guard-loading"
        style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#030810", color: "#4A7FA5" }}
      >
        {t("common.loading")}
      </div>
    );
  }
  return <>{children}</>;
}

export default MplanipretGuard;
