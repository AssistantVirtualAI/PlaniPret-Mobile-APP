import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Headphones, RefreshCw, Wand2, AlertCircle, CheckCircle2 } from "lucide-react";

interface AuditResult {
  user_id: string;
  email: string | null;
  softphone_users_count: number;
  softphone_users: any[];
  resolved_organization_id: string | null;
  matching_call_records: number;
  matching_recordings: number;
  orphan_recordings_in_org: number;
  has_mapping: boolean;
  checked_at: string;
}

export default function MyRecordings() {
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [recordings, setRecordings] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const { data: a, error: ae } = await (supabase.rpc as any)("audit_my_recordings_access");
      if (ae) throw ae;
      setAudit(a as AuditResult);
      if (a?.has_mapping) {
        const { data: recs } = await supabase
          .from("pbx_call_recordings")
          .select("id, recorded_at, duration_seconds, direction, recording_name, available, transcribed, analyzed, sentiment, pbx_uuid, call_record_id")
          .eq("organization_id", a.resolved_organization_id)
          .order("recorded_at", { ascending: false })
          .limit(100);
        setRecordings(recs ?? []);
      } else {
        setRecordings([]);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Audit failed");
    } finally { setBusy(false); }
  };

  const relink = async () => {
    setBusy(true);
    try {
      const { data, error } = await (supabase.rpc as any)("relink_my_softphone_user");
      if (error) throw error;
      const linked = (data as any)?.linked ?? 0;
      if (linked > 0) toast.success(`Linked ${linked} extension(s)`);
      else toast.info("No matching unlinked extensions found");
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Re-link failed");
    } finally { setBusy(false); }
  };

  useEffect(() => { load(); }, []);

  const empty = audit && audit.matching_recordings === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Headphones className="h-5 w-5" /> My Recordings
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={busy}>
            <RefreshCw className={`h-4 w-4 mr-1 ${busy ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="secondary" size="sm" onClick={relink} disabled={busy}>
            <Wand2 className="h-4 w-4 mr-1" /> Re-link my extension
          </Button>
        </div>
      </div>

      {audit && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Diagnostic</CardTitle>
            <CardDescription>Why we can or can't see your recordings.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Stat label="Linked extensions" value={audit.softphone_users_count} good={audit.softphone_users_count > 0} />
            <Stat label="Matching call records" value={audit.matching_call_records} good={audit.matching_call_records > 0} />
            <Stat label="Matching recordings" value={audit.matching_recordings} good={audit.matching_recordings > 0} />
            <Stat label="Orphan recordings (org)" value={audit.orphan_recordings_in_org} />
            {audit.softphone_users.length > 0 && (
              <div className="col-span-2 md:col-span-4 mt-2 flex flex-wrap gap-2">
                {audit.softphone_users.map((s: any) => (
                  <Badge key={s.id} variant="outline">{s.extension} @ {s.sip_domain}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {audit && !audit.has_mapping && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No extension linked</AlertTitle>
          <AlertDescription>
            Your account isn't connected to any SIP extension yet. Click <b>Re-link my extension</b>, or ask an
            admin to assign you one.
          </AlertDescription>
        </Alert>
      )}

      {audit?.has_mapping && empty && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No recordings found</AlertTitle>
          <AlertDescription>
            Your extension is linked, but no recordings match it. Either no calls were recorded yet, or
            recordings haven't been mirrored from FusionPBX. {audit.orphan_recordings_in_org > 0 && (
              <span>There are {audit.orphan_recordings_in_org} unlinked recordings in your org — ask an admin to run reconcile.</span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {recordings.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Recent recordings</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recordings.map((r) => (
                <div key={r.id} className="flex items-center justify-between border rounded-md p-3 text-sm">
                  <div>
                    <div className="font-medium">{r.recording_name ?? r.pbx_uuid ?? r.id}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.recorded_at ? new Date(r.recorded_at).toLocaleString() : "—"} ·
                      {" "}{r.direction ?? "?"} · {r.duration_seconds ?? "?"}s
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {r.available && <Badge variant="outline" className="text-emerald-500">Available</Badge>}
                    {r.transcribed && <Badge variant="outline">Transcribed</Badge>}
                    {r.analyzed && <Badge variant="outline">Analyzed</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, good }: { label: string; value: number; good?: boolean }) {
  return (
    <div className="border rounded-md p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold flex items-center gap-1">
        {value}
        {good && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
      </div>
    </div>
  );
}
