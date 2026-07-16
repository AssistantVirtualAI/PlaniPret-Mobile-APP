import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/context/OrganizationContext";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { RefreshCw, Filter, ShieldAlert } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";

type Row = {
  id: string;
  organization_id: string | null;
  admin_user_id: string | null;
  interpreted_action: string | null;
  proposed_changes_json: any;
  execution_result_json: any;
  execution_status: string | null;
  confirmation_status: string | null;
  source: string | null;
  created_at: string;
  executed_at: string | null;
};

const RANGES = [
  { v: "1h", label: "Last hour", ms: 60 * 60 * 1000 },
  { v: "24h", label: "Last 24h", ms: 24 * 60 * 60 * 1000 },
  { v: "7d", label: "Last 7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { v: "30d", label: "Last 30 days", ms: 30 * 24 * 60 * 60 * 1000 },
  { v: "all", label: "All time", ms: 0 },
] as const;

export default function AdminAIActions() {
  const { selectedOrgId } = useOrganization();
  const [orgFilter, setOrgFilter] = useState<string>(selectedOrgId || "");
  const [tool, setTool] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [range, setRange] = useState<string>("24h");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<Row | null>(null);

  const sinceIso = useMemo(() => {
    const r = RANGES.find((x) => x.v === range);
    if (!r || r.ms === 0) return null;
    return new Date(Date.now() - r.ms).toISOString();
  }, [range]);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["ai-actions", orgFilter, tool, status, sinceIso],
    queryFn: async () => {
      let q = supabase
        .from("telecom_admin_ai_actions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (orgFilter) q = q.eq("organization_id", orgFilter);
      if (tool !== "all") q = q.eq("interpreted_action", tool);
      if (status !== "all") q = q.eq("execution_status", status);
      if (sinceIso) q = q.gte("created_at", sinceIso);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return data ?? [];
    const s = search.toLowerCase();
    return (data ?? []).filter((r) =>
      JSON.stringify(r.proposed_changes_json ?? {}).toLowerCase().includes(s) ||
      JSON.stringify(r.execution_result_json ?? {}).toLowerCase().includes(s) ||
      (r.interpreted_action ?? "").toLowerCase().includes(s),
    );
  }, [data, search]);

  const tools = useMemo(() => {
    const set = new Set<string>();
    (data ?? []).forEach((r) => r.interpreted_action && set.add(r.interpreted_action));
    return Array.from(set).sort();
  }, [data]);

  const statusColor = (s: string | null) =>
    s === "completed" ? "default"
      : s === "denied" ? "destructive"
      : s === "failed" ? "destructive"
      : "secondary";

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="AI Actions Audit"
        subtitle="Every read, action and denial performed by the AVA Assistant across the platform."
        icon={ShieldAlert}
      />

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Organization ID</label>
            <Input
              placeholder="All organizations"
              value={orgFilter}
              onChange={(e) => setOrgFilter(e.target.value.trim())}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tool</label>
            <Select value={tool} onValueChange={setTool}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tools</SelectItem>
                {tools.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="denied">Denied</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Time range</label>
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => <SelectItem key={r.v} value={r.v}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Input placeholder="Search payload…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Tool</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Summary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                  <Filter className="h-4 w-4 inline mr-1" /> No matching AI actions.
                </TableCell></TableRow>
              )}
              {filtered.map((r) => {
                const reason = r.execution_result_json?.reason || r.execution_result_json?.error;
                return (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setDetail(r)}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {formatDistanceToNowStrict(new Date(r.created_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.interpreted_action}</TableCell>
                    <TableCell>
                      <Badge variant={statusColor(r.execution_status) as any}>{r.execution_status ?? "—"}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                      {r.organization_id ? r.organization_id.slice(0, 8) : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                      {r.admin_user_id ? r.admin_user_id.slice(0, 8) : "—"}
                    </TableCell>
                    <TableCell className="text-xs max-w-[420px] truncate">
                      {reason ? <span className="text-destructive">{String(reason)}</span> : JSON.stringify(r.proposed_changes_json).slice(0, 120)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">{detail?.interpreted_action}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-xs">
              <div className="flex flex-wrap gap-2">
                <Badge variant={statusColor(detail.execution_status) as any}>{detail.execution_status}</Badge>
                <Badge variant="outline">{detail.source}</Badge>
                <Badge variant="outline">{new Date(detail.created_at).toLocaleString()}</Badge>
              </div>
              <div>
                <div className="font-medium mb-1">Payload</div>
                <pre className="bg-muted p-3 rounded overflow-auto max-h-60">{JSON.stringify(detail.proposed_changes_json, null, 2)}</pre>
              </div>
              <div>
                <div className="font-medium mb-1">Result</div>
                <pre className="bg-muted p-3 rounded overflow-auto max-h-60">{JSON.stringify(detail.execution_result_json, null, 2)}</pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
