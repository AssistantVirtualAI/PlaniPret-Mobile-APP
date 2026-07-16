import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2 } from "lucide-react";
import { LEMTEL_ORG } from "@/hooks/usePbxData";

type Row = {
  phone_number_id: string;
  organization_id: string;
  e164: string | null;
  provider: string | null;
  friendly_name: string | null;
  provider_status: string | null;
  destination_id: string | null;
  destination_number: string | null;
  destination_type: string | null;
  destination_app: string | null;
  destination_action: string | null;
  destination_enabled: boolean | null;
  link_status: "unassigned" | "attached" | "attached_disabled";
  phone_updated_at: string;
  destination_updated_at: string | null;
};

const statusBadge = (s: Row["link_status"]) =>
  s === "attached" ? "default" : s === "attached_disabled" ? "outline" : "destructive";

export default function PhoneNumbersUnified() {
  const [q, setQ] = useState("");
  const { data = [], isFetching, refetch, error } = useQuery({
    queryKey: ["phone-numbers-unified", LEMTEL_ORG],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("phone_numbers_unified" as any)
        .select("*")
        .eq("organization_id", LEMTEL_ORG)
        .order("e164", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as Row[];
    },
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return data;
    return data.filter((r) =>
      [r.e164, r.friendly_name, r.destination_number, r.destination_action, r.provider]
        .some((v) => (v || "").toLowerCase().includes(term)),
    );
  }, [data, q]);

  const counts = useMemo(() => {
    const c = { total: data.length, attached: 0, disabled: 0, unassigned: 0 };
    data.forEach((r) => {
      if (r.link_status === "attached") c.attached++;
      else if (r.link_status === "attached_disabled") c.disabled++;
      else c.unassigned++;
    });
    return c;
  }, [data]);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Phone Numbers (unified)</h1>
          <p className="text-sm text-muted-foreground">
            Provider DIDs joined with FusionPBX inbound destinations on E.164.
          </p>
        </div>
        <Button onClick={() => refetch()} disabled={isFetching} variant="outline" className="gap-2">
          {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="outline">Total: {counts.total}</Badge>
        <Badge>Attached: {counts.attached}</Badge>
        <Badge variant="outline">Disabled: {counts.disabled}</Badge>
        <Badge variant="destructive">Unassigned: {counts.unassigned}</Badge>
      </div>

      <Input
        placeholder="Search by number, name, provider, action…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-md"
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">DIDs ↔ Inbound routes</CardTitle>
          <CardDescription>
            One row per provider DID; destination columns are NULL when no inbound route matches.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && <div className="text-destructive text-sm mb-2">{(error as Error).message}</div>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-3">E.164</th>
                  <th className="py-2 pr-3">Provider</th>
                  <th className="py-2 pr-3">Friendly</th>
                  <th className="py-2 pr-3">Destination</th>
                  <th className="py-2 pr-3">Type → Action</th>
                  <th className="py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.phone_number_id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-mono">{r.e164 || "—"}</td>
                    <td className="py-2 pr-3">{r.provider || "—"}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.friendly_name || "—"}</td>
                    <td className="py-2 pr-3 font-mono">{r.destination_number || <span className="text-destructive">—</span>}</td>
                    <td className="py-2 pr-3 text-xs">
                      {r.destination_type || "—"} {r.destination_action ? `→ ${r.destination_action}` : ""}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge variant={statusBadge(r.link_status) as any}>{r.link_status}</Badge>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No DIDs found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
