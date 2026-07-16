import { useEffect, useState } from "react";
import { ConsolePageHeader } from "@/components/console/ConsolePageHeader";
import { supabase } from "@/integrations/supabase/client";
import { InventoryTable } from "@/components/console/InventoryTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Row {
  id: string; action: string; entity_type: string; entity_id: string | null;
  actor_email: string | null; source: string | null; result: string | null;
  confirmed_at: string | null; created_at: string; rollback_of?: string | null;
  before_json?: unknown; after_json?: unknown; diff_json?: unknown; metadata?: unknown;
}

export default function ConsoleAudit() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Row | null>(null);
  const [filter, setFilter] = useState("all");
  const [rollingBack, setRollingBack] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
      const { data } = await (supabase.from("pbx_admin_actions") as any)
        .select("id, action, entity_type, entity_id, actor_email, source, result, confirmed_at, created_at, rollback_of, before_json, after_json, diff_json, metadata")
        .order("created_at", { ascending: false }).limit(200);
      setRows((data ?? []) as Row[]);
      setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const visibleRows = rows.filter((r) => filter === "all" || r.action.startsWith(filter) || r.entity_type === filter || r.source === filter || r.result === filter);
  const rollback = async () => {
    if (!selected) return;
    setRollingBack(true);
    try {
      const { data, error } = await (supabase.rpc as any)("rollback_admin_action", { _action_id: selected.id });
      if (error) throw error;
      toast({ title: "Rollback drafted", description: `Linked to ${String((data as any)?.rollback_action_id ?? '').slice(0, 8)}` });
      setSelected(null);
      await load();
    } catch (e: any) {
      toast({ title: "Rollback failed", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setRollingBack(false);
    }
  };

  return (
    <div>
      <ConsolePageHeader
        title="Audit Log"
        description="Every PBX admin action with rollback metadata."
        sourceId="extensions"
        hasData={rows.length > 0}
        onRefresh={load}
        busy={loading}
        rightExtra={
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="chatbot">Chatbot</SelectItem>
              <SelectItem value="rollback">Rollback</SelectItem>
              <SelectItem value="ok">OK</SelectItem>
              <SelectItem value="drafted">Drafted</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        }
      />
      <InventoryTable
        loading={loading} rows={visibleRows} getRowKey={r => r.id}
        searchAccessor={r => `${r.action} ${r.entity_type} ${r.actor_email ?? ""}`}
        searchPlaceholder="Search action / entity / actor…"
        emptyTitle="No admin actions recorded yet"
        columns={[
          { key: "when",   header: "When",   render: r => <span className="text-xs">{new Date(r.created_at).toLocaleString()}</span> },
          { key: "actor",  header: "Actor",  render: r => <span className="text-xs">{r.actor_email ?? "system"}</span> },
          { key: "act",    header: "Action", render: r => <code className="text-xs">{r.action}</code> },
          { key: "ent",    header: "Entity", render: r => <span className="text-xs">{r.entity_type}{r.entity_id ? ` · ${r.entity_id.slice(0,8)}` : ""}</span> },
          { key: "src",    header: "Source", render: r => <Badge variant="outline" className="text-[10px]">{r.source ?? "ava"}</Badge> },
          { key: "res",    header: "Result", render: r => <Badge variant={r.result === "ok" ? "secondary" : r.result === "drafted" ? "outline" : "destructive"} className="text-[10px]">{r.result ?? "?"}</Badge> },
        ]}
        rowActions={r => <Button size="sm" variant="outline" onClick={() => setSelected(r)}>Details</Button>}
      />
      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selected?.action}</SheetTitle>
            <SheetDescription>{selected?.entity_type}{selected?.entity_id ? ` · ${selected.entity_id}` : ""}</SheetDescription>
          </SheetHeader>
          {selected && (
            <div className="mt-5 space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{selected.source ?? "ava"}</Badge>
                <Badge variant={selected.result === "ok" ? "secondary" : "outline"}>{selected.result ?? "unknown"}</Badge>
                {selected.rollback_of && <Badge variant="outline">rollback</Badge>}
              </div>
              {["before_json", "after_json", "diff_json", "metadata"].map((key) => (
                <div key={key}>
                  <div className="text-xs font-medium mb-1">{key.replace("_json", "")}</div>
                  <pre className="text-xs bg-muted/40 rounded-md p-3 overflow-auto max-h-52">{JSON.stringify((selected as any)[key] ?? null, null, 2)}</pre>
                </div>
              ))}
              {!selected.rollback_of && !selected.action.startsWith("rollback.") && (
                <Button onClick={rollback} disabled={rollingBack} variant="outline">
                  <RotateCcw className="h-4 w-4 mr-2" /> {rollingBack ? "Drafting…" : "Draft rollback"}
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
