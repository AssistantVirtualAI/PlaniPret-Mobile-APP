import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Eye, Users, Phone } from "lucide-react";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { useState } from "react";
import { CreateOrgWizard } from "@/components/portal/CreateOrgWizard";

export default function ResellerDashboard() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { enter } = useImpersonation();
  const qc = useQueryClient();
  const [openWizard, setOpenWizard] = useState(false);

  const { data: org } = useQuery({
    queryKey: ["org-by-slug", slug],
    queryFn: async () => {
      const { data } = await supabase
        .from("organizations")
        .select("*")
        .eq("slug", slug!)
        .maybeSingle();
      return data as any;
    },
    enabled: !!slug,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["reseller-customers", org?.id],
    enabled: !!org?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("organizations")
        .select("*")
        .eq("parent_org_id", org.id);
      return (data || []) as any[];
    },
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{org?.brand_name || org?.name || "Reseller Portal"}</h1>
          <p className="text-muted-foreground">
            {customers.length} customers • Plan: {org?.billing_plan}
          </p>
        </div>
        <Button onClick={() => setOpenWizard(true)}>
          <Plus className="h-4 w-4 mr-2" /> Create Customer
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <Users className="h-8 w-8 text-primary" />
            <div>
              <div className="text-2xl font-bold">{customers.length}</div>
              <div className="text-xs text-muted-foreground">Customer organizations</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <Phone className="h-8 w-8 text-primary" />
            <div>
              <div className="text-2xl font-bold">—</div>
              <div className="text-xs text-muted-foreground">Total extensions</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <Phone className="h-8 w-8 text-primary" />
            <div>
              <div className="text-2xl font-bold">—</div>
              <div className="text-xs text-muted-foreground">Calls today</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>My customers</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr className="text-left">
                <th className="p-2">Name</th>
                <th className="p-2">Plan</th>
                <th className="p-2">Status</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c: any) => (
                <tr key={c.id} className="border-b">
                  <td className="p-2 font-medium">{c.name}</td>
                  <td className="p-2 capitalize">{c.billing_plan}</td>
                  <td className="p-2">
                    <Badge variant={c.status === "active" ? "default" : "secondary"}>
                      {c.status}
                    </Badge>
                  </td>
                  <td className="p-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await enter(c.id, c.name);
                        navigate(`/org/${c.slug}/admin/dashboard`);
                      }}
                    >
                      <Eye className="h-4 w-4 mr-1" /> View portal
                    </Button>
                  </td>
                </tr>
              ))}
              {!customers.length && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-muted-foreground">
                    No customers yet. Click "Create Customer" to add one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <CreateOrgWizard
        open={openWizard}
        onOpenChange={setOpenWizard}
        onCreated={() => qc.invalidateQueries({ queryKey: ["reseller-customers", org?.id] })}
        parentOrgId={org?.id}
      />
    </div>
  );
}
