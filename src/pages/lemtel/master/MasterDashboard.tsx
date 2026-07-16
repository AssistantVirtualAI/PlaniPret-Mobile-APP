import { useOrgHierarchy, OrgNode } from "@/hooks/useOrgHierarchy";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Briefcase, Store, Users, Phone, Activity, Server } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useImpersonation } from "@/contexts/ImpersonationContext";

function TreeNode({ node, depth = 0 }: { node: OrgNode; depth?: number }) {
  const navigate = useNavigate();
  const { enter } = useImpersonation();
  const Icon = node.org_type === "master" ? Building2 : node.org_type === "reseller" ? Briefcase : Store;
  return (
    <div>
      <div
        className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer"
        style={{ paddingLeft: 8 + depth * 20 }}
        onClick={async () => {
          if (node.org_type !== "master") await enter(node.id, node.name);
          const base =
            node.org_type === "reseller"
              ? `/org/${node.slug}/reseller/dashboard`
              : `/org/${node.slug}/admin/dashboard`;
          navigate(base);
        }}
      >
        <Icon className="h-4 w-4 text-primary" />
        <span className="font-medium">{node.name}</span>
        <Badge variant="outline" className="text-xs capitalize">{node.org_type}</Badge>
        <Badge
          variant={node.status === "active" ? "default" : "secondary"}
          className="text-xs ml-auto"
        >
          {node.status}
        </Badge>
      </div>
      {node.children?.map((c) => (
        <TreeNode key={c.id} node={c} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function MasterDashboard() {
  const { data: tree = [], isLoading } = useOrgHierarchy();
  const navigate = useNavigate();

  const { data: stats } = useQuery({
    queryKey: ["master-stats"],
    queryFn: async () => {
      const LEMTEL = "71755d33-ed64-4ad5-a828-61c9d2029eb7";
      // Lemtel subtree: Lemtel + any org whose parent is Lemtel
      const { data: subtreeRows } = await supabase
        .from("organizations")
        .select("id")
        .or(`id.eq.${LEMTEL},parent_org_id.eq.${LEMTEL}`);
      const subtreeIds = (subtreeRows || []).map((r: any) => r.id);
      const ids = subtreeIds.length ? subtreeIds : [LEMTEL];

      const startOfDay = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

      const [orgs, users, exts, calls] = await Promise.all([
        Promise.resolve({ count: ids.length }),
        supabase
          .from("organization_members")
          .select("user_id", { count: "exact", head: true })
          .in("organization_id", ids),
        supabase
          .from("pbx_extensions" as any)
          .select("id", { count: "exact", head: true })
          .eq("organization_id", LEMTEL),
        supabase
          .from("pbx_call_records" as any)
          .select("id", { count: "exact", head: true })
          .eq("organization_id", LEMTEL)
          .gte("start_at", startOfDay),
      ]);
      return {
        orgs: orgs.count || 0,
        users: users.count || 0,
        extensions: exts.count || 0,
        callsToday: calls.count || 0,
      };
    },
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Lemtel Master Portal</h1>
          <p className="text-muted-foreground">
            Total orgs: {stats?.orgs ?? "—"} • Users: {stats?.users ?? "—"} • Extensions:{" "}
            {stats?.extensions ?? "—"} • Calls today: {stats?.callsToday ?? "—"}
          </p>
        </div>
        <Button onClick={() => navigate("/org/lemtel/master/organizations?create=1")}>
          + Create Organization
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Organizations", value: stats?.orgs, Icon: Building2 },
          { label: "Users", value: stats?.users, Icon: Users },
          { label: "Extensions", value: stats?.extensions, Icon: Phone },
          { label: "Calls today", value: stats?.callsToday, Icon: Activity },
        ].map((c) => (
          <Card key={c.label}>
            <CardContent className="pt-6 flex items-center gap-3">
              <c.Icon className="h-8 w-8 text-primary" />
              <div>
                <div className="text-2xl font-bold">{c.value ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{c.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" /> Organization tree
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {isLoading ? (
              <div className="text-muted-foreground">Loading…</div>
            ) : (
              tree.map((n) => <TreeNode key={n.id} node={n} />)
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" /> System health
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              { label: "FusionPBX", status: "connected" },
              { label: "Supabase", status: "connected" },
              { label: "Telnyx SMS", status: "active" },
              { label: "ElevenLabs", status: "active" },
            ].map((s) => (
              <div key={s.label} className="flex items-center justify-between">
                <span>{s.label}</span>
                <Badge variant="default" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                  🟢 {s.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
