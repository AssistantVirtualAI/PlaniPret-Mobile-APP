import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eye, Edit, Pause, Trash2, FileBarChart, DollarSign } from "lucide-react";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { useNavigate } from "react-router-dom";
import { CreateOrgWizard } from "@/components/portal/CreateOrgWizard";
import { toast } from "sonner";

type Filter = "all" | "reseller" | "customer" | "direct" | "suspended" | "trial";

export default function MasterOrganizations() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(params.get("create") === "1");
  const { enter } = useImpersonation();
  const navigate = useNavigate();

  const { data: orgs = [] } = useQuery({
    queryKey: ["all-orgs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("organizations")
        .select("*")
        .order("created_at", { ascending: false });
      return (data || []) as any[];
    },
  });

  const filtered = orgs.filter((o: any) => {
    if (search && !o.name?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === "all") return true;
    if (filter === "suspended") return o.status === "suspended";
    if (filter === "trial") return o.status === "trial";
    return o.org_type === filter;
  });

  const suspend = async (id: string, status: string) => {
    const next = status === "suspended" ? "active" : "suspended";
    const { error } = await supabase.from("organizations").update({ status: next }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(`Organization ${next}`);
      qc.invalidateQueries({ queryKey: ["all-orgs"] });
    }
  };

  const del = async (id: string, name: string) => {
    if (!confirm(`Delete ${name}? This is irreversible.`)) return;
    const { error } = await supabase.from("organizations").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["all-orgs"] });
    }
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Organizations</h1>
          <p className="text-muted-foreground">{orgs.length} total</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">📥 Export</Button>
          <Button onClick={() => setOpen(true)}>+ Create Organization</Button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Input
          placeholder="Search organizations…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="reseller">Resellers</TabsTrigger>
            <TabsTrigger value="customer">Customers</TabsTrigger>
            <TabsTrigger value="direct">Direct</TabsTrigger>
            <TabsTrigger value="suspended">Suspended</TabsTrigger>
            <TabsTrigger value="trial">Trial</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr className="text-left">
                <th className="p-3">Name</th>
                <th className="p-3">Type</th>
                <th className="p-3">Plan</th>
                <th className="p-3">Status</th>
                <th className="p-3">Created</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o: any) => (
                <tr key={o.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-medium">{o.name}</td>
                  <td className="p-3">
                    <Badge variant="outline" className="capitalize">{o.org_type}</Badge>
                  </td>
                  <td className="p-3 capitalize">{o.billing_plan}</td>
                  <td className="p-3">
                    <Badge
                      variant={
                        o.status === "active" ? "default" : o.status === "suspended" ? "destructive" : "secondary"
                      }
                    >
                      {o.status}
                    </Badge>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {new Date(o.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-3 flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await enter(o.id, o.name);
                        navigate(
                          o.org_type === "reseller"
                            ? `/org/${o.slug}/reseller/dashboard`
                            : `/org/${o.slug}/admin/dashboard`
                        );
                      }}
                      title="Enter portal"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" title="Edit">
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => suspend(o.id, o.status)} title="Suspend">
                      <Pause className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" title="Reports">
                      <FileBarChart className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" title="Billing">
                      <DollarSign className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => del(o.id, o.name)}
                      title="Delete"
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    No organizations match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <CreateOrgWizard
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            params.delete("create");
            setParams(params);
          }
        }}
        onCreated={() => qc.invalidateQueries({ queryKey: ["all-orgs"] })}
      />
    </div>
  );
}
