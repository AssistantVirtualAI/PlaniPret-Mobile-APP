import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";

type Check = { name: string; status: "ok" | "fail" | "warn"; detail: string };

export default function PortalDiagnostic() {
  const { user, loading } = useAuth();
  const [checks, setChecks] = useState<Check[]>([]);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    if (loading) return;
    (async () => {
      setRunning(true);
      const out: Check[] = [];

      out.push({
        name: "Auth session",
        status: user ? "ok" : "fail",
        detail: user ? `Logged in as ${user.email} (${user.id})` : "No active Supabase session",
      });

      if (user) {
        const { data: sp, error: spErr } = await supabase
          .from("pbx_softphone_users")
          .select("id, extension, organization_id, portal_user_id")
          .eq("portal_user_id", user.id);
        out.push({
          name: "pbx_softphone_users mapping",
          status: spErr ? "fail" : (sp && sp.length > 0 ? "ok" : "warn"),
          detail: spErr
            ? `Query error: ${spErr.message}`
            : sp && sp.length > 0
              ? `Found ${sp.length} row(s): ext ${sp.map((r) => r.extension).join(", ")}`
              : "No softphone user row linked to your account",
        });

        const { data: cl, error: clErr } = await (supabase as any)
          .from("clients")
          .select("id, portal_user_id")
          .eq("portal_user_id", user.id);
        out.push({
          name: "clients mapping",
          status: clErr ? "warn" : (cl && cl.length > 0 ? "ok" : "warn"),
          detail: clErr
            ? `Query error: ${clErr.message}`
            : cl && cl.length > 0
              ? `Found ${cl.length} client row(s)`
              : "No client row linked (optional if softphone mapping exists)",
        });

        const { data: roles, error: rolesErr } = await supabase
          .from("user_roles")
          .select("organization_id, role")
          .eq("user_id", user.id);
        out.push({
          name: "user_roles",
          status: rolesErr ? "fail" : (roles && roles.length > 0 ? "ok" : "warn"),
          detail: rolesErr
            ? `Query error: ${rolesErr.message}`
            : roles && roles.length > 0
              ? roles.map((r: any) => `${r.role} @ ${r.organization_id}`).join(" · ")
              : "No roles assigned",
        });

        const { data: orgs, error: orgsErr } = await supabase
          .from("organization_members")
          .select("organization_id")
          .eq("user_id", user.id);
        out.push({
          name: "organization_members",
          status: orgsErr ? "fail" : (orgs && orgs.length > 0 ? "ok" : "fail"),
          detail: orgsErr
            ? `Query error: ${orgsErr.message}`
            : orgs && orgs.length > 0
              ? orgs.map((o: any) => o.organization_id).join(", ")
              : "Not a member of any organization",
        });

        const isLemtelMember = (orgs || []).some(
          (o: any) => o.organization_id === "71755d33-ed64-4ad5-a828-61c9d2029eb7"
        );
        out.push({
          name: "Lemtel organization membership",
          status: isLemtelMember ? "ok" : "fail",
          detail: isLemtelMember
            ? "User is a member of the Lemtel org"
            : "Not a member of Lemtel org → LemtelGuard will block",
        });

        const allowed = (sp && sp.length > 0) || (cl && cl.length > 0);
        out.push({
          name: "PortalGuard verdict",
          status: allowed ? "ok" : "fail",
          detail: allowed
            ? "Access ALLOWED — portal pages should render"
            : "Access DENIED — link your account via pbx_softphone_users.portal_user_id or clients.portal_user_id",
        });
      }

      setChecks(out);
      setRunning(false);
    })();
  }, [user?.id, loading]);

  const icon = (s: Check["status"]) =>
    s === "ok" ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> :
    s === "warn" ? <AlertCircle className="w-4 h-4 text-amber-500" /> :
    <XCircle className="w-4 h-4 text-rose-500" />;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Portal Access Diagnostic
            {running && <Badge variant="secondary">running…</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {checks.map((c) => (
            <div key={c.name} className="flex items-start gap-3 p-3 rounded-md border bg-card">
              <div className="mt-0.5">{icon(c.status)}</div>
              <div className="flex-1">
                <div className="text-sm font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground break-all">{c.detail}</div>
              </div>
            </div>
          ))}
          {!running && checks.length === 0 && (
            <div className="text-sm text-muted-foreground">No checks ran. Are you logged in?</div>
          )}
          <div className="pt-2 flex gap-3 text-sm">
            <Link to="/auth" className="text-primary underline">Login page</Link>
            <Link to="/org/lemtel/portal/dashboard" className="text-primary underline">Try portal dashboard</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
