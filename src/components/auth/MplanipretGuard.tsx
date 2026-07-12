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
 *  - This guard will NEVER redirect to /planipret/admin.
 *
 * iOS WKWebView fixes:
 *  - Uses getSession() — reads local storage cache first (fast on iOS).
 *  - Hard timeout of 4 s: fail open rather than staying stuck on loading.
 *  - Listens to Capacitor App.appStateChange to re-check auth on foreground
 *    resume — prevents the black screen when returning to the app.
 *  - Listens to supabase.auth.onAuthStateChange so sign-in/sign-out events
 *    immediately update the guard state without a full reload.
 */
export function MplanipretGuard({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useMplanipretLang();
  const [state, setState] = useState<"checking" | "allow">("checking");

  const checkAuth = async (source = "init") => {
    let timedOut = false;
    const failOpenTimer = setTimeout(() => {
      timedOut = true;
      console.warn(`[MplanipretGuard] Auth check timed out (${source}) — failing open`);
      setState("allow");
    }, 4000);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (timedOut) return;

      if (!session) {
        recordRedirect(location.pathname, ROUTES.MPLANIPRET, "MplanipretGuard", `no auth session (${source}) — render inline mobile login`);
        clearTimeout(failOpenTimer);
        setState("allow");
        return;
      }

      // Block Lemtel-only users
      try {
        const { data: lemtelOnly } = await supabase.rpc("is_lemtel_only", { _user_id: session.user.id });
        if (timedOut) return;
        if (lemtelOnly === true) {
          recordRedirect(location.pathname, "/portal", "MplanipretGuard", "lemtel-only user");
          clearTimeout(failOpenTimer);
          navigate("/portal", { replace: true });
          return;
        }
      } catch {
        // RPC failure → fail open
      }

      clearTimeout(failOpenTimer);
      setState("allow");
    } catch (e) {
      console.error(`[MplanipretGuard] Auth check failed (${source}):`, e);
      if (!timedOut) {
        clearTimeout(failOpenTimer);
        setState("allow");
      }
    }
  };

  useEffect(() => {
    // Initial check
    checkAuth("init");

    // Listen to Supabase auth state changes (sign-in / sign-out / token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        setState("allow");
      } else if (event === "SIGNED_OUT") {
        // Stay in /mplanipret — PlanipretMobile will show the login screen
        setState("allow");
      }
    });

    // Listen to Capacitor App foreground resume to re-check auth
    // (prevents black screen when returning to the app from background)
    let removeAppListener: (() => void) | null = null;
    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) {
            // App came back to foreground — rehydrate session silently
            supabase.auth.getSession().catch(() => {});
            setState("allow");
          }
        });
        removeAppListener = () => handle.remove();
      } catch {
        // Not running in Capacitor (web) — no-op
      }
    })();

    // Also handle visibilitychange for web/PWA
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        supabase.auth.getSession().catch(() => {});
        setState("allow");
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      subscription.unsubscribe();
      removeAppListener?.();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "checking") {
    return (
      <div
        data-testid="mplanipret-guard-loading"
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#030810",
          color: "#4A7FA5",
          fontFamily: "Urbanist, sans-serif",
          fontSize: 14,
        }}
      >
        {t("common.loading")}
      </div>
    );
  }
  return <>{children}</>;
}

export default MplanipretGuard;
