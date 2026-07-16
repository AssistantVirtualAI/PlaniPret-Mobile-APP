import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2, AlertTriangle } from "lucide-react";
import { LEMTEL_ORG } from "@/hooks/usePbxData";

type Reg = {
  user?: string;
  contact?: string;
  agent?: string;
  network_ip?: string;
  network_port?: string;
  ping_status?: string;
  ping_time?: string;
  hostname?: string;
};

export default function LiveRegistrations() {
  const live = useQuery({
    queryKey: ["live-registrations", LEMTEL_ORG],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("fusionpbx-proxy", {
        body: { organization_id: LEMTEL_ORG, action: "get-registrations-live" },
      });
      if (error) throw error;
      return data as any;
    },
    refetchInterval: 15_000,
  });

  const known = useQuery({
    queryKey: ["known-extensions", LEMTEL_ORG],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pbx_extensions_real" as any)
        .select("extension")
        .eq("organization_id", LEMTEL_ORG);
      if (error) throw error;
      return new Set<string>((data || []).map((r: any) => String(r.extension)));
    },
  });

  const regs: Reg[] = (live.data as any)?.registrations || (live.data as any)?.data?.registrations || [];
  const resolved = (live.data as any)?._resolvedDomain || (live.data as any)?.resolved_domain;
  const errBanner = (live.data as any)?.error || (live.data as any)?.message;

  const ghosts = regs.filter((r) => r.user && known.data && !known.data.has(String(r.user).split("@")[0]));
  const missing = known.data
    ? Array.from(known.data).filter((ext) => !regs.some((r) => String(r.user || "").split("@")[0] === ext))
    : [];

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Live Registrations</h1>
          <p className="text-sm text-muted-foreground">
            FreeSWITCH show registrations for the resolved domain (auto-refresh 15s).
          </p>
        </div>
        <Button onClick={() => { live.refetch(); known.refetch(); }} variant="outline" className="gap-2" disabled={live.isFetching}>
          {live.isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </Button>
      </div>

      {resolved && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Resolved domain</CardTitle>
          </CardHeader>
          <CardContent className="text-sm font-mono space-y-1">
            <div>domain_uuid: <span className="text-primary">{resolved.domain}</span></div>
            <div>source: <Badge variant={resolved.source === "organization" ? "default" : "outline"}>{resolved.source}</Badge></div>
          </CardContent>
        </Card>
      )}

      {errBanner && (
        <div className="flex items-start gap-2 p-3 border border-destructive/40 rounded bg-destructive/5 text-sm">
          <AlertTriangle className="w-4 h-4 text-destructive mt-0.5" />
          <div>
            <div className="font-medium text-destructive">Live registrations endpoint returned an error</div>
            <div className="text-muted-foreground break-all">{String(errBanner)}</div>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Live registrations</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-mono">{regs.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Known SIP extensions</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-mono">{known.data?.size ?? "—"}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Unregistered extensions</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-mono">{missing.length}</div>
            {missing.length > 0 && (
              <div className="text-xs text-muted-foreground mt-1 truncate">{missing.slice(0, 8).join(", ")}{missing.length > 8 ? "…" : ""}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Registered endpoints</CardTitle>
          <CardDescription>Ghost = registered but not in pbx_extensions_real</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-3">User</th>
                  <th className="py-2 pr-3">Contact</th>
                  <th className="py-2 pr-3">IP</th>
                  <th className="py-2 pr-3">Agent</th>
                  <th className="py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {regs.map((r, i) => {
                  const ext = String(r.user || "").split("@")[0];
                  const isGhost = ghosts.includes(r);
                  return (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-mono">{ext} {isGhost && <Badge variant="destructive" className="ml-1">ghost</Badge>}</td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">{r.contact || "—"}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{r.network_ip || "—"}{r.network_port ? `:${r.network_port}` : ""}</td>
                      <td className="py-2 pr-3 text-xs">{r.agent || "—"}</td>
                      <td className="py-2 pr-3"><Badge variant="outline">{r.ping_status || "—"}</Badge></td>
                    </tr>
                  );
                })}
                {regs.length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No live registrations.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
