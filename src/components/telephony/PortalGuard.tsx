import { ReactNode, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ShieldOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  children: ReactNode;
}

/**
 * Restricts access to /org/lemtel/portal/* routes.
 * Allows only users who are mapped via pbx_softphone_users.portal_user_id
 * or clients.portal_user_id (when that column is present).
 * RLS still enforces row-level isolation; this is an extra UI guard.
 */
export function PortalGuard({ children }: Props) {
  const { user } = useAuth();
  const [state, setState] = useState<"checking" | "allowed" | "denied">("checking");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: sp } = await supabase
          .from("pbx_softphone_users")
          .select("id")
          .eq("portal_user_id", user.id)
          .limit(1);
        if (sp && sp.length > 0) {
          if (!cancelled) setState("allowed");
          return;
        }
        const { data: cl } = await (supabase as any)
          .from("clients")
          .select("id")
          .eq("portal_user_id", user.id)
          .limit(1);
        if (!cancelled) setState(cl && cl.length > 0 ? "allowed" : "denied");
      } catch {
        if (!cancelled) setState("denied");
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  if (state === "checking") {
    return <div className="p-8 text-center text-sm text-muted-foreground">Verifying access…</div>;
  }

  if (state === "denied") {
    return (
      <div className="max-w-md mx-auto mt-20 px-4">
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <ShieldOff className="w-10 h-10 mx-auto text-rose-500" />
            <h2 className="text-xl font-semibold">Access Denied</h2>
            <p className="text-sm text-muted-foreground">
              Your account is not linked to a customer portal. Contact your administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}

export default PortalGuard;
