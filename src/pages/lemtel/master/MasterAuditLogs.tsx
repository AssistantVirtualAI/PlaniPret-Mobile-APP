import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Shield, Search } from "lucide-react";

export default function MasterAuditLogs() {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  const { data: orgs = [] } = useQuery({
    queryKey: ["all-orgs-min"],
    queryFn: async () => {
      const { data } = await supabase.from("organizations").select("id,name");
      return (data || []) as { id: string; name: string }[];
    },
  });
  const orgMap = new Map(orgs.map((o) => [o.id, o.name]));

  const { data: profiles = [] } = useQuery({
    queryKey: ["all-profiles-min"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,email,full_name");
      return (data || []) as { id: string; email: string; full_name: string }[];
    },
  });
  const userMap = new Map(profiles.map((p) => [p.id, p.full_name || p.email]));

  const { data: logs = [] } = useQuery({
    queryKey: ["audit-logs-all", actionFilter],
    queryFn: async () => {
      let q = supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (actionFilter) q = q.ilike("action", `%${actionFilter}%`);
      const { data } = await q;
      return (data || []) as any[];
    },
  });

  const filtered = logs.filter((l) => {
    if (!search) return true;
    const hay = `${orgMap.get(l.organization_id) || ""} ${userMap.get(l.user_id) || ""} ${l.action} ${l.resource_type}`.toLowerCase();
    return hay.includes(search.toLowerCase());
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Shield className="h-7 w-7" /> Audit logs
        </h1>
        <Badge variant="outline">{filtered.length} entries</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search org, user, action…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Input
            className="w-64"
            placeholder="Action contains…"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr className="text-left">
                <th className="p-3">When</th>
                <th className="p-3">Organization</th>
                <th className="p-3">User</th>
                <th className="p-3">Impersonator</th>
                <th className="p-3">Action</th>
                <th className="p-3">Resource</th>
                <th className="p-3">IP</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l: any) => (
                <tr key={l.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 text-xs whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</td>
                  <td className="p-3">{orgMap.get(l.organization_id) || <span className="text-muted-foreground">—</span>}</td>
                  <td className="p-3">{userMap.get(l.user_id) || <span className="text-muted-foreground font-mono text-xs">{l.user_id?.slice(0, 8)}</span>}</td>
                  <td className="p-3">
                    {l.impersonator_id ? (
                      <Badge variant="destructive" className="text-xs">
                        {userMap.get(l.impersonator_id) || l.impersonator_id.slice(0, 8)}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3"><Badge variant="secondary">{l.action}</Badge></td>
                  <td className="p-3 text-xs">{l.resource_type}</td>
                  <td className="p-3 text-xs font-mono text-muted-foreground">{l.ip_address || "—"}</td>
                </tr>
              ))}
              {!filtered.length && (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No audit entries match.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
