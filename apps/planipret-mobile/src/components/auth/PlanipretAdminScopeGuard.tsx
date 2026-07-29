import { useEffect, useState, ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PLANIPRET_ORG_ID } from "@/lib/avaOwner";

/**
 * Global scope guard: a Planipret-only admin is locked to /planipret/*, /mplanipret/*,
 * /auth, /reset-password, /post-login, /auth/maestro/callback and /portals.
 * Any attempt to visit AVA/Lemtel routes via URL manipulation redirects to
 * /planipret/admin/overview and pins the selected org to Planipret.
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancelled) setIsPlanipretOnly(false); return; }

      const [superRes, planipretAdminRes, lemtelMemberRes] = await Promise.all([
        supabase.rpc("is_super_admin", { _user_id: user.id }),
        supabase.rpc("is_planipret_admin", { _user_id: user.id }),
        supabase.rpc("is_lemtel_member", { _user_id: user.id }),
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
