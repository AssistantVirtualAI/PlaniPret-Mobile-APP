import { useEffect, useState } from "react";
import { ConsolePageHeader } from "@/components/console/ConsolePageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { logAdminAction } from "@/lib/pbx/auditLog";
import { LEMTEL_ORG } from "@/hooks/usePbxData";
import { CircleDot, PhoneOff, RotateCcw } from "lucide-react";

type PresenceStatus = "available" | "busy" | "away" | "dnd" | "offline" | "out_of_office";
type CallState = "idle" | "ringing" | "active" | "held";

const STATUSES: PresenceStatus[] = ["available", "busy", "away", "dnd", "offline", "out_of_office"];

export default function ConsolePresence() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [row, setRow] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data } = await (supabase as any)
      .from("user_presence").select("*").eq("user_id", user.id).maybeSingle();
    setRow(data);
    setMessage(data?.message ?? "");
  };

  useEffect(() => { load(); }, [user?.id]);

  // Auto-reset on_call when this desktop tab disconnects
  useEffect(() => {
    if (!user) return;
    const reset = () => {
      navigator.sendBeacon?.(
        `${(supabase as any).supabaseUrl}/rest/v1/rpc/upsert_user_presence`,
        new Blob([JSON.stringify({ _call_state: "idle", _platform: "desktop" })], { type: "application/json" })
      );
    };
    window.addEventListener("beforeunload", reset);
    return () => window.removeEventListener("beforeunload", reset);
  }, [user?.id]);

  const setStatus = async (s: PresenceStatus, cs: CallState = "idle") => {
    setBusy(true);
    try {
      await (supabase.rpc as any)("upsert_user_presence", {
        _status: s, _message: message || null, _call_state: cs, _platform: "desktop",
      });
      await logAdminAction({
        organizationId: LEMTEL_ORG,
        entityType: "user_presence",
        action: `presence.override.${s}`,
        source: "ui",
        after: { status: s, call_state: cs, message },
        result: "ok",
      });
      toast({ title: "Presence updated", description: `${s} · ${cs}` });
      await load();
    } catch (e: any) {
      toast({ title: "Update failed", description: e?.message ?? String(e), variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <div>
      <ConsolePageHeader
        title="Presence"
        description="Manual override of your softphone presence and call state."
        sourceId="extensions"
        hasData={!!row}
        onRefresh={load}
      />
      <div className="p-4 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CircleDot className="h-4 w-4" /> Current
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex gap-2"><span className="text-muted-foreground w-28">Status</span><Badge variant="outline">{row?.status ?? "—"}</Badge></div>
            <div className="flex gap-2"><span className="text-muted-foreground w-28">Call state</span><Badge variant="outline">{row?.call_state ?? "—"}</Badge></div>
            <div className="flex gap-2"><span className="text-muted-foreground w-28">Platform</span><Badge variant="outline">{row?.platform ?? "—"}</Badge></div>
            <div className="flex gap-2"><span className="text-muted-foreground w-28">Updated</span><span>{row?.updated_at ? new Date(row.updated_at).toLocaleString() : "—"}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Manual override</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Status message (optional)" value={message} onChange={(e) => setMessage(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <Button key={s} size="sm" variant="outline" disabled={busy} onClick={() => setStatus(s)}>
                  {s}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => setStatus(row?.status ?? "available", "idle")}>
                <PhoneOff className="h-4 w-4 mr-2" /> Force call state → idle
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={load}>
                <RotateCcw className="h-4 w-4 mr-2" /> Refresh
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
