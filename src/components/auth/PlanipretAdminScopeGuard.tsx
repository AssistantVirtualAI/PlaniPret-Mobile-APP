import { useEffect, useState, ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PLANIPRET_ORG_ID } from "@/lib/avaOwner";

// iOS Capacitor cold-boot: Supabase calls can stall or throw {} during startup.
// Wrap every network call with a timeout so a stall never crashes the app.
function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); },
    );
  });
}

/**
 * Global scope guard: a Planipret-only admin is locked to /planipret/*, /mplanipret/*,
 * /auth, /reset-password, /post-login, /auth/maestro/callback and /portals.
 * Any attempt to visit AVA/Lemtel routes via URL manipulation redirects to
 * /planipret/admin/overview and pins the selected org to Planipret.
 *
 * IMPORTANT (iOS crash fix): Every Supabase call is wrapped in try/catch + withTimeout.
 * On iOS cold-boot, getUser() and RPC calls can throw {} (empty object) which would
 * propagate to React's commitRoot and crash the app. We fail-open (isPlanipretOnly=false)
 * on any error so the guard never blocks the app from loading.
 */
const ALLOWED_PREFIXES = [
  "/planipret",
  "/mplanipret",
  "/auth",
  "/reset-password",
  "/post-login",
  "/portals",
];

export function PlanipretAdminScopeGuard({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [isPlanipretOnly, setIsPlanipretOnly] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // getSession() is local-storage backed — faster and safer than getUser() on iOS cold-boot.
        // getUser() performs a network round-trip that can stall or throw {} during startup.
        const { data: { session } } = await withTimeout(
          supabase.auth.getSession(),
          2500,
          "scope_guard_session",
        );
        const user = session?.user ?? null;
        if (!user) {
          if (!cancelled) setIsPlanipretOnly(false);
          return;
        }
        const [superRes, planipretAdminRes, lemtelMemberRes] = await Promise.all([
          withTimeout(supabase.rpc("is_super_admin", { _user_id: user.id }), 2500, "scope_guard_super"),
          withTimeout(supabase.rpc("is_planipret_admin", { _user_id: user.id }), 2500, "scope_guard_pp_admin"),
          withTimeout(supabase.rpc("is_lemtel_member", { _user_id: user.id }), 2500, "scope_guard_lemtel"),
        ]);
        if (cancelled) return;
        const isSuper = superRes.data === true;
        const isPlanipretAdmin = planipretAdminRes.data === true;
        const isLemtelMember = lemtelMemberRes.data === true;
        const locked = isPlanipretAdmin && !isSuper && !isLemtelMember;
        setIsPlanipretOnly(locked);
        if (locked) {
          try { localStorage.setItem("selected_organization_id", PLANIPRET_ORG_ID); } catch {}
        }
      } catch (error) {
        // Fail-open: any error (network, timeout, {}) → treat as non-restricted user.
        // This prevents a startup crash from blocking the entire app.
        console.warn("[PlanipretAdminScopeGuard] scope check failed, failing open:", error);
        if (!cancelled) setIsPlanipretOnly(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!isPlanipretOnly) return;
    const allowed = pathname === "/" || ALLOWED_PREFIXES.some(p => pathname === p || pathname.startsWith(p + "/"));
    if (!allowed) navigate("/planipret/admin/overview", { replace: true });
  }, [isPlanipretOnly, pathname, navigate]);

  return <>{children}</>;
}
