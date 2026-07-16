import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

type Feature = {
  feature: string;
  endpoint: string;
  status: "ok" | "empty" | "unavailable" | "error";
  detail: string;
  sample_count: number;
};

const LABELS: Record<string, string> = {
  cdrs: "CDRs (appels)",
  messages: "SMS / Messages",
  voicemails: "Boîtes vocales",
  recordings: "Enregistrements d'appels",
  transcriptions: "Transcriptions",
};

export default function NsCapabilitiesPanel({ domain }: { domain: string }) {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [version, setVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);

  async function loadCached() {
    const { data } = await supabase
      .from("planipret_ns_server_capabilities")
      .select("feature, endpoint, status, detail, sample_count, last_probed_at, metadata")
      .eq("domain", domain)
      .order("feature");
    if (data?.length) {
      setFeatures(data as any);
      setLastRun(data[0]?.last_probed_at ?? null);
      const v = (data[0] as any)?.metadata?.server_version;
      if (v) setVersion(v);
    }
  }

  async function probe() {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("ns-debug-audit", {
        body: { mode: "capabilities", domain },
      });
      if (error) throw new Error(error.message);
      setFeatures((data as any).features ?? []);
      setVersion((data as any).version ?? null);
      setLastRun(new Date().toISOString());
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadCached(); }, [domain]);

  function icon(s: Feature["status"]) {
    if (s === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    if (s === "empty") return <AlertCircle className="h-4 w-4 text-amber-600" />;
    return <XCircle className="h-4 w-4 text-destructive" />;
  }

  return (
    <div className="mt-4 rounded-lg border bg-muted/30 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold">🔍 Fonctionnalités disponibles sur ce serveur</h4>
          <p className="text-xs text-muted-foreground">
            Version : <span className="font-mono">{version ?? "—"}</span>
            {lastRun && <> · dernière sonde : {new Date(lastRun).toLocaleString("fr-CA")}</>}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={probe} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-2 h-3 w-3" />}
          Sonder
        </Button>
      </div>

      {error && <div className="mt-3 text-xs text-destructive">{error}</div>}

      <div className="mt-3 space-y-2">
        {features.length === 0 && !loading && (
          <div className="text-xs text-muted-foreground">Cliquez sur « Sonder » pour vérifier les fonctionnalités.</div>
        )}
        {features.map((f) => (
          <div key={f.feature} className="flex items-start gap-2 rounded border bg-background px-3 py-2">
            {icon(f.status)}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{LABELS[f.feature] ?? f.feature}</span>
                <Badge variant="outline" className="text-[10px]">{f.status}</Badge>
                {f.sample_count > 0 && <span className="text-[10px] text-muted-foreground">{f.sample_count} échantillon(s)</span>}
              </div>
              <div className="text-[11px] font-mono text-muted-foreground truncate">{f.endpoint}</div>
              <div className="mt-1 text-xs text-muted-foreground">{f.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
