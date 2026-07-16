import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Shield } from "lucide-react";
import { toast } from "sonner";
import { LEMTEL_ORG } from "@/hooks/usePbxData";

type Row = {
  id: string;
  organization_id: string;
  pbx_uuid: string;
  username: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  groups: string[] | null;
  enabled: boolean;
  api_key_present: boolean;
  sync_status: string;
  last_pbx_seen_at: string | null;
};

export default function PbxAdminUsers() {
  const qc = useQueryClient();
  const { data = [], isFetching, refetch, error } = useQuery({
    queryKey: ["pbx-admin-users", LEMTEL_ORG],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pbx_admin_users" as any)
        .select("*")
        .eq("organization_id", LEMTEL_ORG)
        .order("username", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as Row[];
    },
  });

  const sync = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("sync-pbx-admin-users", {
        body: { organization_id: LEMTEL_ORG },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => {
      toast.success(`Synced ${d?.upserted ?? 0} PBX admin users`);
      qc.invalidateQueries({ queryKey: ["pbx-admin-users"] });
    },
    onError: (e: any) => toast.error(`Sync failed: ${e?.message || e}`),
  });

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Shield className="w-5 h-5" />PBX Admin Users
          </h1>
          <p className="text-sm text-muted-foreground">
            FusionPBX backoffice accounts for the resolved domain. Read-only mirror.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => sync.mutate()} disabled={sync.isPending} className="gap-2">
            {sync.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sync from PBX
          </Button>
          <Button onClick={() => refetch()} variant="outline" disabled={isFetching}>
            {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Refresh"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Accounts ({data.length})</CardTitle>
          <CardDescription>Source: pbx_admin_users · synced from FusionPBX /users</CardDescription>
        </CardHeader>
        <CardContent>
          {error && <div className="text-destructive text-sm mb-2">{(error as Error).message}</div>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-3">Username</th>
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Groups</th>
                  <th className="py-2 pr-3">API key</th>
                  <th className="py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map((u) => (
                  <tr key={u.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-mono">{u.username}</td>
                    <td className="py-2 pr-3">{[u.first_name, u.last_name].filter(Boolean).join(" ") || "—"}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{u.email || "—"}</td>
                    <td className="py-2 pr-3 text-xs">{(u.groups || []).join(", ") || "—"}</td>
                    <td className="py-2 pr-3">{u.api_key_present ? <Badge>yes</Badge> : <span className="text-muted-foreground">no</span>}</td>
                    <td className="py-2 pr-3">
                      <Badge variant={u.sync_status === "synced" ? "default" : u.sync_status === "orphan" ? "destructive" : "outline"}>
                        {u.sync_status}
                      </Badge>
                      {!u.enabled && <Badge variant="outline" className="ml-2">disabled</Badge>}
                    </td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No admin users synced yet. Click “Sync from PBX”.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
