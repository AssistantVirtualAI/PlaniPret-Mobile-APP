import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";

export default function MasterAllUsers() {
  const { data: rows = [] } = useQuery({
    queryKey: ["master-all-users"],
    queryFn: async () => {
      const { data } = await supabase
        .from("org_members" as any)
        .select("id,role,joined_at,user_id,org_id,organizations(name,slug),profiles:profiles!org_members_user_id_fkey(email,full_name)")
        .limit(500);
      return (data || []) as any[];
    },
  });
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-3xl font-bold">All users</h1>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr className="text-left">
                <th className="p-3">User</th>
                <th className="p-3">Organization</th>
                <th className="p-3">Role</th>
                <th className="p-3">Joined</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="border-b">
                  <td className="p-3">{r.profiles?.email || r.user_id?.slice(0, 8)}</td>
                  <td className="p-3">{r.organizations?.name || "-"}</td>
                  <td className="p-3 capitalize">{r.role?.replace("_", " ")}</td>
                  <td className="p-3 text-xs">{new Date(r.joined_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
