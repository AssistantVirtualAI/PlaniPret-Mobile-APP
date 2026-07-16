import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type DesktopRole = "normal" | "org_admin" | "reseller_admin" | "super_admin";

export function useDesktopRole() {
  const { user, loading: authLoading } = useAuth();
  const [role, setRole] = useState<DesktopRole>("normal");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setRole("normal");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { data: isSuper } = await supabase.rpc("is_super_admin", { _user_id: user.id });
        if (isSuper) return setRole("super_admin"), setLoading(false);

        const { data: master } = await supabase
          .from("org_members")
          .select("role")
          .eq("user_id", user.id)
          .in("role", ["master_admin", "reseller_admin"])
          .maybeSingle();
        if (master?.role === "master_admin") return setRole("super_admin"), setLoading(false);
        if (master?.role === "reseller_admin") return setRole("reseller_admin"), setLoading(false);

        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);
        const admin = roles?.some((r: any) =>
          r.role === "org_admin" || r.role === "reseller_admin" || r.role === "manager"
        );
        setRole(admin ? "org_admin" : "normal");
      } catch {
        setRole("normal");
      } finally {
        setLoading(false);
      }
    })();
  }, [user, authLoading]);

  const isAdmin = role === "org_admin" || role === "reseller_admin" || role === "super_admin";
  return { role, isAdmin, loading };
}
