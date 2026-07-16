import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function MasterBilling() {
  const { data: orgs = [] } = useQuery({
    queryKey: ["billing-orgs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("organizations")
        .select("id,name,slug,billing_plan,status,trial_ends_at,max_extensions,max_storage_gb");
      return (data || []) as any[];
    },
  });
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-3xl font-bold">Billing</h1>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr className="text-left">
                <th className="p-3">Organization</th>
                <th className="p-3">Plan</th>
                <th className="p-3">Status</th>
                <th className="p-3">Trial ends</th>
                <th className="p-3">Limits</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o: any) => (
                <tr key={o.id} className="border-b">
                  <td className="p-3 font-medium">{o.name}</td>
                  <td className="p-3 capitalize">{o.billing_plan}</td>
                  <td className="p-3"><Badge variant="outline">{o.status}</Badge></td>
                  <td className="p-3">{o.trial_ends_at ? new Date(o.trial_ends_at).toLocaleDateString() : "-"}</td>
                  <td className="p-3 text-xs">{o.max_extensions} ext • {o.max_storage_gb} GB</td>
                  <td className="p-3 flex gap-1">
                    <Button size="sm" variant="outline">Upgrade</Button>
                    <Button size="sm" variant="outline">Suspend</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
