import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle, Minus } from "lucide-react";

const PLATFORM_ORG_ID = "71755d33-ed64-4ad5-a828-61c9d2029eb7";

type Svc = { ok: boolean; latency_ms?: number; error?: string; detail?: string };
type PingResp = {
  mock_mode?: boolean;
  services?: Record<string, Svc>;
  checked_at?: string;
  error?: string;
};

function statusFor(s?: Svc) {
  if (!s) return { kind: "pending" as const, label: "Pending" };
  if (s.error === "Not configured" || s.error === "No AI key configured")
    return { kind: "off" as const, label: "Not configured" };
  if (s.ok) return { kind: "ok" as const, label: s.detail ? `OK · ${s.detail}` : "OK" };
  return { kind: "fail" as const, label: s.error || "Failed" };
}

function Pill({ kind, label }: { kind: "ok" | "fail" | "off" | "pending"; label: string }) {
  const map = {
    ok: { Icon: CheckCircle2, cls: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30" },
    fail: { Icon: XCircle, cls: "text-red-600 bg-red-500/10 border-red-500/30" },
    off: { Icon: Minus, cls: "text-muted-foreground bg-muted/40 border-border" },
    pending: { Icon: AlertTriangle, cls: "text-amber-600 bg-amber-500/10 border-amber-500/30" },
  } as const;
  const { Icon, cls } = map[kind];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border ${cls}`}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

function HealthCard({
  title,
  description,
  svc,
}: {
  title: string;
  description: string;
  svc?: Svc;
}) {
  const s = statusFor(svc);
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm">{title}</CardTitle>
          <Pill kind={s.kind} label={s.label} />
        </div>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground space-y-1">
        <div>{description}</div>
        {svc?.latency_ms != null && <div>Latency: {svc.latency_ms} ms</div>}
        {svc?.error && svc.error !== "Not configured" && (
          <div className="text-red-500 break-all">Error: {svc.error}</div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SystemHealth() {
  const [ping, setPing] = useState<PingResp | null>(null);
  const [softphone, setSoftphone] = useState<any>(null);
  const [releaseCount, setReleaseCount] = useState<number | null>(null);
  const [dbOk, setDbOk] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const [p, sp, rel, db] = await Promise.all([
        supabase.functions.invoke("telephony-ping", { body: { organization_id: PLATFORM_ORG_ID } }),
        supabase.functions.invoke("softphone-credentials-health", {}),
        supabase.from("app_releases").select("id", { count: "exact", head: true }),
        supabase.from("organizations").select("id", { count: "exact", head: true }).limit(1),
      ]);
      setPing((p.data as PingResp) || { error: p.error?.message });
      setSoftphone(sp.data || { ok: false, error: sp.error?.message });
      setReleaseCount(rel.count ?? 0);
      setDbOk(!db.error);
      setCheckedAt(new Date().toISOString());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  const services = ping?.services || {};
  const wssOk = !!softphone?.checks?.current_user_lookup?.wss_url || !!softphone?.checks?.fallback_ext_300;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">System Health Center</h1>
          <p className="text-sm text-muted-foreground">
            Live status across telephony, AI, database and release providers.
            {checkedAt && <span className="ml-2">· Last check: {new Date(checkedAt).toLocaleTimeString()}</span>}
            {ping?.mock_mode && <Badge variant="outline" className="ml-2">Mock mode</Badge>}
          </p>
        </div>
        <Button onClick={run} disabled={loading} size="sm">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Re-run checks
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <HealthCard title="FusionPBX API" description="REST connectivity through fusionpbx-proxy" svc={services.fusionpbx} />
        <HealthCard
          title="FusionPBX sync jobs"
          description="CDR & config synchronization"
          svc={
            services.fusionpbx
              ? { ok: services.fusionpbx.ok, detail: services.fusionpbx.ok ? "Reachable" : undefined, error: services.fusionpbx.error }
              : undefined
          }
        />
        <HealthCard
          title="WSS / WebRTC"
          description="Softphone WebSocket reachability"
          svc={
            softphone
              ? wssOk
                ? { ok: true, detail: softphone.checks?.current_user_lookup?.wss_url ? "User-bound" : "Fallback ext 300" }
                : { ok: false, error: softphone.error || "No WSS configuration" }
              : undefined
          }
        />
        <HealthCard title="Telnyx SMS" description="Messaging profile reachability" svc={services.telnyx} />
        <HealthCard title="ElevenLabs greetings" description="TTS voice generation" svc={services.elevenlabs} />
        <HealthCard title="AI analysis / transcription" description="Lovable Gateway or Anthropic" svc={services.ai} />
        <HealthCard
          title="Supabase DB / RLS"
          description="Database reachability via anon client"
          svc={dbOk == null ? undefined : dbOk ? { ok: true } : { ok: false, error: "Query failed" }}
        />
        <HealthCard
          title="App releases"
          description="Downloads catalog availability"
          svc={
            releaseCount == null
              ? undefined
              : releaseCount > 0
              ? { ok: true, detail: `${releaseCount} release(s)` }
              : { ok: false, error: "No app_releases rows" }
          }
        />
      </div>
    </div>
  );
}
