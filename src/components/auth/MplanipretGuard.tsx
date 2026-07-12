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
 *
 * iOS WKWebView fix:
 *  - Uses getSession() instead of getUser() — getSession() reads from the
 *    local storage cache first (fast on iOS). getUser() always makes a
 *    network round-trip which can hang on cold start in WKWebView.
 *  - Hard timeout of 4 s: if auth check doesn't complete, fail open
 *    (show the app / login screen) rather than staying stuck on loading.
 */
export function MplanipretGuard({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useMplanipretLang();
  const [state, setState] = useState<"checking" | "allow">("checking");

  useEffect(() => {
    let cancelled = false;

    // Hard timeout — if auth check hangs (iOS WKWebView cold start), fail open.
    const failOpenTimer = setTimeout(() => {
      if (!cancelled) {
        console.warn("[MplanipretGuard] Auth check timed out — failing open");
        setState("allow");
      }
    }, 4000);

    (async () => {
      try {
        // Use getSession() — reads local storage cache first (fast on iOS),
        // then validates in background. Much more reliable than getUser() on
        // native WKWebView where the network call can block indefinitely.
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;

        if (!session) {
          recordRedirect(location.pathname, ROUTES.MPLANIPRET, "MplanipretGuard", "no auth session — render inline mobile login");
          clearTimeout(failOpenTimer);
          setState("allow");
          return;
        }

        // Block Lemtel-only users — they have no business in the Planiprêt mobile app.
        try {
          const { data: lemtelOnly } = await supabase.rpc("is_lemtel_only", { _user_id: session.user.id });
          if (cancelled) return;
          if (lemtelOnly === true) {
            recordRedirect(location.pathname, "/portal", "MplanipretGuard", "lemtel-only user");
            clearTimeout(failOpenTimer);
            navigate("/portal", { replace: true });
            return;
          }
        } catch {
          // RPC failure should not push the user into the admin portal — fail open here.
        }

        clearTimeout(failOpenTimer);
        setState("allow");
      } catch (e) {
        console.error("[MplanipretGuard] Auth check failed:", e);
        if (!cancelled) {
          clearTimeout(failOpenTimer);
          setState("allow");
        }
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(failOpenTimer);
    };
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
