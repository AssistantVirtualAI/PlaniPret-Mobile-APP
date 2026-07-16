import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, RefreshCw, Trash2, Power, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LEMTEL_ORG } from "@/hooks/usePbxData";
import { usePbxWrite } from "@/hooks/usePbxWrite";
import { usePbxRealtime } from "@/hooks/usePbxRealtime";
import { toast } from "sonner";

type Kind = "gateways" | "sip-profiles" | "conferences" | "hold-music" | "dialplans";

const KIND_LABELS: Record<Kind, string> = {
  gateways: "Gateways / Trunks",
  "sip-profiles": "SIP Profiles",
  conferences: "Conference Rooms",
  "hold-music": "Hold Music",
  dialplans: "Dialplan (Raw)",
};

const MIRROR_TABLES: Record<Kind, string> = {
  gateways: "pbx_gateways",
  "sip-profiles": "pbx_sip_profiles",
  conferences: "pbx_conferences",
  "hold-music": "pbx_hold_music",
  dialplans: "pbx_dialplans",
};

function useList(kind: Kind) {
  return useQuery({
    queryKey: ["pbx", "adv", kind],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("fusionpbx-proxy", {
        body: { action: `list-${kind}`, organization_id: LEMTEL_ORG },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).message || (data as any).error);
      return ((data as any)?.data ?? []) as any[];
    },
  });
}

function AdvancedTab({ kind }: { kind: Kind }) {
  const { data = [], isLoading, refetch, isFetching } = useList(kind);
  const write = usePbxWrite();
  const [open, setOpen] = useState(false);
  const [jsonText, setJsonText] = useState("{}");
  usePbxRealtime([MIRROR_TABLES[kind]], ["pbx", "adv", kind]);

  const handleCreate = async () => {
    let parsed: Record<string, any>;
    try { parsed = JSON.parse(jsonText); } catch { toast.error("Invalid JSON"); return; }
    await write.mutateAsync({
      organizationId: LEMTEL_ORG,
      action: `create-${kind}`,
      params: parsed,
    });
    setOpen(false); setJsonText("{}"); refetch();
  };

  const handleDelete = async (row: any) => {
    if (!confirm("Delete this object in FusionPBX?")) return;
    const uuidField = Object.keys(row).find((k) => k.endsWith("_uuid")) || "uuid";
    await write.mutateAsync({
      organizationId: LEMTEL_ORG,
      action: `delete-${kind}`,
      params: { [uuidField]: row[uuidField], uuid: row[uuidField] },
    });
    refetch();
  };

  const handleRestart = async (row: any) => {
    if (kind === "gateways") {
      await write.mutateAsync({
        organizationId: LEMTEL_ORG, action: "restart-gateway",
        params: { gateway_name: row.gateway },
      });
    } else if (kind === "sip-profiles") {
      await write.mutateAsync({
        organizationId: LEMTEL_ORG, action: "restart-sip-profile",
        params: { profile_name: row.sip_profile_name },
      });
    }
  };

  const columns = Object.keys(data[0] ?? {}).filter((k) => !["raw_data", "domain_uuid"].includes(k)).slice(0, 6);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">{KIND_LABELS[kind]} ({data.length})</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />Refresh
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-2" />New</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Create {KIND_LABELS[kind]}</DialogTitle></DialogHeader>
              <div className="space-y-2">
                <Label>Raw JSON payload (FusionPBX field names)</Label>
                <Textarea rows={14} value={jsonText} onChange={(e) => setJsonText(e.target.value)} className="font-mono text-xs" />
                <p className="text-xs text-muted-foreground">Advanced mode — fields are forwarded as-is to FusionPBX REST.</p>
              </div>
              <DialogFooter>
                <Button onClick={handleCreate} disabled={write.isPending}>
                  {write.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>
        ) : data.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">No {KIND_LABELS[kind]} found in FusionPBX.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => <TableHead key={c}>{c}</TableHead>)}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row, i) => (
                <TableRow key={row[columns[0]] ?? i}>
                  {columns.map((c) => (
                    <TableCell key={c} className="font-mono text-xs max-w-[200px] truncate">
                      {typeof row[c] === "object" ? JSON.stringify(row[c]) : String(row[c] ?? "—")}
                    </TableCell>
                  ))}
                  <TableCell className="text-right space-x-2">
                    {(kind === "gateways" || kind === "sip-profiles") && (
                      <Button variant="ghost" size="sm" onClick={() => handleRestart(row)}>
                        <Power className="w-4 h-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(row)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default function TelephonyAdvanced() {
  const [tab, setTab] = useState<Kind>("gateways");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ShieldAlert className="w-7 h-7 text-amber-500" /> PBX Advanced
          </h1>
          <p className="text-muted-foreground">Super-admin: gateways, SIP profiles, conferences, hold music, dialplan raw.</p>
        </div>
        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">Super Admin</Badge>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Kind)}>
        <TabsList className="grid grid-cols-5 w-full max-w-3xl">
          {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
            <TabsTrigger key={k} value={k}>{KIND_LABELS[k].split(" ")[0]}</TabsTrigger>
          ))}
        </TabsList>
        {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
          <TabsContent key={k} value={k} className="mt-4">
            <AdvancedTab kind={k} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
