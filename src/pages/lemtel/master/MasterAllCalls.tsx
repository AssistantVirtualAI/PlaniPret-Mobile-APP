import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function MasterAllCalls() {
  const { data: calls = [] } = useQuery({
    queryKey: ["master-all-calls"],
    queryFn: async () => {
      const { data } = await supabase
        .from("pbx_call_records" as any)
        .select("id,direction,caller_number,destination_number,duration_seconds,call_status,start_at,organization_id")
        .order("start_at", { ascending: false })
        .limit(200);
      return (data || []) as any[];
    },
  });
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-3xl font-bold">All calls (cross-org)</h1>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr className="text-left">
                <th className="p-3">Time</th>
                <th className="p-3">Org</th>
                <th className="p-3">Dir</th>
                <th className="p-3">From</th>
                <th className="p-3">To</th>
                <th className="p-3">Duration</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((c: any) => (
                <tr key={c.id} className="border-b text-xs">
                  <td className="p-2">{new Date(c.start_at).toLocaleString()}</td>
                  <td className="p-2 font-mono">{c.organization_id?.slice(0, 8)}</td>
                  <td className="p-2 capitalize">{c.direction}</td>
                  <td className="p-2">{c.caller_number}</td>
                  <td className="p-2">{c.destination_number}</td>
                  <td className="p-2">{c.duration_seconds}s</td>
                  <td className="p-2"><Badge variant="outline">{c.call_status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
