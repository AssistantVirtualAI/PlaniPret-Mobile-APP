import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSoftphone } from "@/hooks/useSoftphone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle, Clock, PhoneCall } from "lucide-react";

const PLATFORM_ORG_ID = "71755d33-ed64-4ad5-a828-61c9d2029eb7";

type Check = {
  id: string;
  label: string;
  status: "pending" | "pass" | "fail" | "skip";
  detail?: string;
  error?: string;
  fix?: string;
  at?: string;
};

function StatusIcon({ s }: { s: Check["status"] }) {
  if (s === "pass") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (s === "fail") return <XCircle className="h-4 w-4 text-red-600" />;
  if (s === "skip") return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
  return <Clock className="h-4 w-4 text-amber-500 animate-pulse" />;
}

function Row({ c }: { c: Check }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b last:border-b-0">
      <StatusIcon s={c.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{c.label}</span>
          {c.at && <span className="text-[10px] text-muted-foreground">{new Date(c.at).toLocaleTimeString()}</span>}
        </div>
        {c.detail && <div className="text-xs text-muted-foreground">{c.detail}</div>}
        {c.error && <div className="text-xs text-red-500 break-all">Error: {c.error}</div>}
        {c.fix && c.status === "fail" && (
          <div className="text-xs text-amber-600 mt-1">Recommended fix: {c.fix}</div>
        )}
      </div>
    </div>
  );
}

export default function TelephonyQA() {
  const sp = useSoftphone();
  const [checks, setChecks] = useState<Record<string, Check>>({});
  const [running, setRunning] = useState(false);
  const [testNumber, setTestNumber] = useState("");

  const upd = useCallback((id: string, patch: Partial<Check>) => {
    setChecks((prev) => ({
      ...prev,
      [id]: { id, label: prev[id]?.label || id, status: "pending", ...prev[id], ...patch, at: new Date().toISOString() },
    }));
  }, []);

  const init = useCallback(() => {
    const base: Check[] = [
      { id: "fusion_api", label: "FusionPBX API reachable (via fusionpbx-proxy)", status: "pending" },
      { id: "sync_job", label: "Last successful FusionPBX sync job", status: "pending" },
      { id: "wss", label: "WSS TLS connectivity (backend-provided URL)", status: "pending" },
      { id: "creds", label: "Softphone credentials available for current user", status: "pending" },
      { id: "sip_reg", label: "SIP registration status (live)", status: "pending" },
      { id: "outbound", label: "Outbound call test workflow", status: "pending", detail: "Use the test call form below" },
      { id: "inbound", label: "Inbound call readiness checklist", status: "pending" },
      { id: "cdr", label: "CDR sync verification after test call", status: "pending" },
    ];
    setChecks(Object.fromEntries(base.map((c) => [c.id, c])));
  }, []);

  useEffect(() => {
    init();
  }, [init]);

  // Reflect live SIP registration state
  useEffect(() => {
    const status = sp?.snap?.status;
    const cause = sp?.snap?.errorCause;
    if (!status) return;
    if (status === "registered") {
      upd("sip_reg", { status: "pass", detail: `Registered as ext ${sp?.config?.extension || ""}`.trim() });
    } else if (status === "error" || status === "disconnected") {
      upd("sip_reg", {
        status: "fail",
        error: cause || status,
        fix:
          (cause || "").toLowerCase().includes("cert") || (cause || "").toLowerCase().includes("ssl")
            ? "Use a WSS host whose TLS cert matches (e.g. pbxnode.lemtel.tel) — FUSIONPBX_WSS_URL secret."
            : "Re-check softphone-credentials response and FusionPBX user provisioning.",
      });
    } else {
      upd("sip_reg", { status: "pending", detail: status });
    }
  }, [sp?.snap?.status, sp?.snap?.errorCause, sp?.config?.extension, upd]);


  const runAll = useCallback(async () => {
    setRunning(true);
    init();
    try {
      // 1. fusion api + 4. creds via existing edge functions in parallel
      const [ping, spHealth] = await Promise.all([
        supabase.functions.invoke("telephony-ping", { body: { organization_id: PLATFORM_ORG_ID } }),
        supabase.functions.invoke("softphone-credentials-health", {}),
      ]);

      const fusion = (ping.data as any)?.services?.fusionpbx;
      if (fusion?.ok) upd("fusion_api", { status: "pass", detail: `${fusion.latency_ms} ms` });
      else
        upd("fusion_api", {
          status: fusion?.error === "Not configured" ? "skip" : "fail",
          error: fusion?.error,
          fix: "Set FUSIONPBX_API_URL / FUSIONPBX_API_KEY / FUSIONPBX_USERNAME secrets.",
        });

      // 2. Last sync job
      const { data: sync, error: syncErr } = await supabase
        .from("pbx_sync_jobs")
        .select("status, completed_at, error, job_type")
        .order("completed_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (syncErr) {
        upd("sync_job", { status: "fail", error: syncErr.message });
      } else if (!sync) {
        upd("sync_job", { status: "skip", detail: "No sync job recorded yet" });
      } else if (sync.status === "completed" || sync.status === "success") {
        upd("sync_job", {
          status: "pass",
          detail: `${sync.job_type} at ${sync.completed_at ? new Date(sync.completed_at).toLocaleString() : "—"}`,
        });
      } else {
        upd("sync_job", {
          status: "fail",
          error: sync.error || sync.status,
          fix: "Trigger fusionpbx-sync-config / fusionpbx-sync-cdr manually and review logs.",
        });
      }


      // 3. WSS
      const wss = (spHealth.data as any)?.checks?.current_user_lookup?.wss_url
        || (spHealth.data as any)?.checks?.fallback_ext_300?.wss_url;
      if (wss) {
        try {
          const u = new URL(wss);
          if (u.protocol !== "wss:") throw new Error("WSS URL is not wss://");
          upd("wss", { status: "pass", detail: `${u.host}` });
        } catch (e: any) {
          upd("wss", { status: "fail", error: e.message, fix: "Backend must return a valid wss:// URL." });
        }
      } else {
        upd("wss", { status: "fail", error: "No WSS URL from backend", fix: "Configure FUSIONPBX_WSS_URL secret." });
      }

      // 4. credentials availability (without exposing secrets)
      const cu = (spHealth.data as any)?.checks?.current_user_lookup;
      if (cu?.found && cu?.has_password) {
        upd("creds", { status: "pass", detail: `ext ${cu.extension} · password ${cu.masked_password}` });
      } else if (cu?.found && !cu?.has_password) {
        upd("creds", { status: "fail", error: "User found but no SIP password", fix: "Reset SIP password via secure backend." });
      } else if ((spHealth.data as any)?.checks?.fallback_ext_300?.found) {
        upd("creds", { status: "skip", detail: "Using shared ext 300 fallback" });
      } else {
        upd("creds", { status: "fail", error: "No softphone row for current user", fix: "Provision pbx_softphone_users row." });
      }

      // 7. inbound readiness — phone numbers + IVR/extension routing
      const { count: didCount } = await supabase
        .from("phone_numbers")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", PLATFORM_ORG_ID);
      if ((didCount || 0) > 0) {
        upd("inbound", { status: "pass", detail: `${didCount} DID(s) provisioned. Verify each routes to extension/IVR.` });
      } else {
        upd("inbound", { status: "fail", error: "No DIDs assigned", fix: "Assign a DID to an extension or IVR in Phone Numbers." });
      }

      // 8. CDR recency
      const { data: lastCdr } = await supabase
        .from("pbx_call_records")
        .select("start_at")
        .order("start_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!lastCdr) {
        upd("cdr", { status: "skip", detail: "No CDR rows yet — place a test call." });
      } else {
        const age = Date.now() - new Date(lastCdr.start_at as string).getTime();
        const mins = Math.round(age / 60000);
        upd("cdr", {
          status: mins < 60 ? "pass" : "skip",
          detail: `Last CDR ${mins} min ago`,
        });
      }
    } finally {
      setRunning(false);
    }
  }, [init, upd]);

  const placeTestCall = useCallback(async () => {
    if (!testNumber) return;
    upd("outbound", { status: "pending", detail: `Dialing ${testNumber}…` });
    try {
      const call = (sp as any).call || (sp as any).dial;
      if (typeof call === "function") {
        await call(testNumber);
        upd("outbound", { status: "pass", detail: `Dial initiated to ${testNumber}` });
      } else {
        upd("outbound", {
          status: "fail",
          error: "Softphone has no dial() exposed",
          fix: "Use the My Workspace › Softphone page to place a call, then re-run checks for CDR.",
        });
      }
    } catch (e: any) {
      upd("outbound", { status: "fail", error: e.message });
    }
  }, [sp, testNumber, upd]);

  const ordered = ["fusion_api", "sync_job", "wss", "creds", "sip_reg", "outbound", "inbound", "cdr"]
    .map((id) => checks[id])
    .filter(Boolean);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Telephony QA</h1>
          <p className="text-sm text-muted-foreground">
            Operational verification of FusionPBX, WSS, SIP registration, calls and CDR sync.
          </p>
        </div>
        <Button onClick={runAll} disabled={running} size="sm">
          <RefreshCw className={`h-4 w-4 mr-2 ${running ? "animate-spin" : ""}`} />
          Run all checks
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            QA checklist
            <Badge variant="outline">{ordered.filter((c) => c.status === "pass").length} / {ordered.length} passing</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ordered.map((c) => (
            <Row key={c.id} c={c} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <PhoneCall className="h-4 w-4" /> Outbound call test
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">Destination (E.164)</label>
              <Input
                value={testNumber}
                onChange={(e) => setTestNumber(e.target.value)}
                placeholder="+15145551234"
              />
            </div>
            <Button onClick={placeTestCall} disabled={!testNumber || sp?.snap?.status !== "registered"}>
              Dial
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Requires SIP registration. After the call ends, click <b>Run all checks</b> to verify CDR sync.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
