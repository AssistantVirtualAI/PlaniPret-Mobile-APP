import { ReactNode, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type Portal = "platform" | "customer" | "my";

/**
 * Enforces strict role separation between portals.
 *  - platform: super_admin or master_admin only
 *  - customer: org_admin / reseller_admin / manager (or higher)
 *  - my: any authenticated user
 *
 * Retries on transient network errors instead of bouncing the user to /my.
 */
export function RolePortalGuard({ portal, children }: { portal: Portal; children: ReactNode }) {
  const { user, loading } = useAuth();
  const [state, setState] = useState<"checking" | "allow" | "deny-platform" | "deny-customer" | "error">("checking");

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    let cancelled = false;

    const check = async (attempt: number): Promise<void> => {
      try {
        const [isSuperRes, orgMembersRes, rolesRes] = await Promise.all([
          supabase.rpc("is_super_admin", { _user_id: user.id }),
          supabase.from("org_members").select("role").eq("user_id", user.id),
          supabase.from("user_roles").select("role").eq("user_id", user.id),
        ]);

        if (isSuperRes.error || orgMembersRes.error || rolesRes.error) {
          throw isSuperRes.error || orgMembersRes.error || rolesRes.error;
        }

        const orgMemberRoles = (orgMembersRes.data || []).map((r: any) => r.role);
        const isSuper = isSuperRes.data === true;
        const isMaster = orgMemberRoles.some((r) => r === "ava_admin" || r === "master_admin");
        const isCustomerAdminViaOrgMembers = orgMemberRoles.some(
          (r) => r === "reseller_admin" || r === "customer_admin"
        );
        const isAdmin =
          isCustomerAdminViaOrgMembers ||
          rolesRes.data?.some((r: any) =>
            r.role === "org_admin" || r.role === "reseller_admin" || r.role === "manager"
          );

        if (cancelled) return;
        if (portal === "platform") {
          setState(isSuper || isMaster ? "allow" : isAdmin ? "deny-platform" : "deny-customer");
        } else if (portal === "customer") {
          setState(isSuper || isMaster || isAdmin ? "allow" : "deny-customer");
        } else {
          setState("allow");
        }
      } catch (err) {
        if (cancelled) return;
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          return check(attempt + 1);
        }
        setState(portal === "my" ? "allow" : "error");
      }
    };

    check(0);
    return () => { cancelled = true; };
  }, [user, loading, portal]);

  if (loading || state === "checking") {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (state === "deny-platform") return <Navigate to="/customer" replace />;
  if (state === "deny-customer") return <Navigate to="/my" replace />;
  if (state === "error") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center px-6">
        <div className="text-lg font-semibold">Connexion réseau instable</div>
        <div className="text-sm text-muted-foreground">Impossible de vérifier vos permissions. Veuillez rafraîchir.</div>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm"
        >Réessayer</button>
      </div>
    );
  }
  return <>{children}</>;
}
