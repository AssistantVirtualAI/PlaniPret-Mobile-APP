import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type CcRole = "none" | "agent" | "supervisor" | "admin";

const LEMTEL_ORG = "71755d33-ed64-4ad5-a828-61c9d2029eb7";

export function useCallCenterRole() {
  const { user } = useAuth();
  const [data, setData] = useState<{
    role: CcRole;
    queues: string[];
    extension: string | null;
    organization_id: string | null;
    isSuperAdmin: boolean;
    isLemtelAdmin: boolean;
    isOrgAdmin: boolean;
  }>({
    role: "none", queues: [], extension: null, organization_id: null,
    isSuperAdmin: false, isLemtelAdmin: false, isOrgAdmin: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const [spuRes, superRes, lemtelRes, orgAdminRes] = await Promise.all([
        supabase
          .from("pbx_softphone_users")
          .select("cc_role, cc_queues, extension, organization_id")
          .eq("portal_user_id", user.id)
          .maybeSingle(),
        supabase.rpc("is_super_admin", { _user_id: user.id }),
        supabase.rpc("is_lemtel_admin", { _user_id: user.id }),
        supabase.rpc("has_role", { _user_id: user.id, _org_id: LEMTEL_ORG, _role: "org_admin" as any }),
      ]);
      if (cancelled) return;
      const row = spuRes.data as any;
      setData({
        role: (row?.cc_role as CcRole) || "none",
        queues: (row?.cc_queues as string[]) || [],
        extension: row?.extension || null,
        organization_id: row?.organization_id || null,
        isSuperAdmin: !!superRes.data,
        isLemtelAdmin: !!lemtelRes.data,
        isOrgAdmin: !!orgAdminRes.data,
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const elevated = data.isSuperAdmin || data.isLemtelAdmin || data.isOrgAdmin;
  const isAdmin = data.role === "admin" || elevated;
  const isSupervisor = data.role === "supervisor" || isAdmin;
  const isAgent = data.role === "agent";

  return { ...data, loading, isAgent, isSupervisor, isAdmin, elevated };
}
