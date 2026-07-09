import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw } from "lucide-react";

type CountResult = {
  ok: boolean;
  a_portalCount: number;
  b_nsApiCount: number;
  b_paginationSignal: string;
  b_totalFromHeader: number | null;
  b_pages: Array<{ url: string; status: number; count: number; headers: Record<string, string | null> }>;
  b_warning: string | null;
  c_nsExtensionsMissingFromPortal: string[];
  c_portalProfilesMissingFromNs: string[];
  c_nsExtensionsMissingFromPortalCount: number;
  c_portalProfilesMissingFromNsCount: number;
};

export default function PADebug() {
  const [count, setCount] = useState<CountResult | null>(null);
  const [ppNsUsersCount, setPpNsUsersCount] = useState<number | null>(null);
  const [ppNsUsersStrategy, setPpNsUsersStrategy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const [{ data: countData, error: e1 }, { data: ppNs, error: e2 }] = await Promise.all([
        supabase.functions.invoke("ns-debug-audit", { body: { mode: "count" } }),
        supabase.functions.invoke("pp-ns-users", { body: {} }),
      ]);
      if (e1) throw new Error(e1.message);
      if (e2) console.warn(e2);
      setCount(countData as CountResult);
      setPpNsUsersCount(((ppNs as any)?.count ?? null));
      setPpNsUsersStrategy(((ppNs as any)?.strategy ?? null));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { run(); }, []);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Debug NS-API ↔ Courtiers</h1>
          <p className="text-sm text-muted-foreground">
            Audit du décalage entre `planipret_profiles` et les extensions NetSapiens.
          </p>
        </div>
        <Button onClick={run} disabled={loading} variant="outline">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Relancer
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat label="A — planipret_profiles" value={count?.a_portalCount ?? "—"} hint="Comptes courtiers du portail" />
        <Stat label="B — NS-API (paginé)" value={count?.b_nsApiCount ?? "—"} hint={count?.b_paginationSignal ?? ""} />
        <Stat label="D — pp-ns-users (KPI/sidebar)" value={ppNsUsersCount ?? "—"} hint={ppNsUsersStrategy ?? ""} />
        <Stat label="X-Total-Count entêtes" value={count?.b_totalFromHeader ?? "n/a"} hint="Si renseigné, fait foi" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">C — Diff portail ↔ NS-API</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <div className="font-medium">
              Extensions NS-API sans compte portail : {count?.c_nsExtensionsMissingFromPortalCount ?? 0}
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {(count?.c_nsExtensionsMissingFromPortal ?? []).slice(0, 80).map((e) => (
                <Badge key={e} variant="outline" className="font-mono text-xs">{e}</Badge>
              ))}
              {((count?.c_nsExtensionsMissingFromPortal?.length ?? 0) > 80) && (
                <span className="text-muted-foreground">…+{(count!.c_nsExtensionsMissingFromPortal.length - 80)} de plus</span>
              )}
            </div>
          </div>
          <div>
            <div className="font-medium">
              Profils portail sans extension NS-API : {count?.c_portalProfilesMissingFromNsCount ?? 0}
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {(count?.c_portalProfilesMissingFromNs ?? []).slice(0, 80).map((e) => (
                <Badge key={e} variant="outline" className="font-mono text-xs">{e}</Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">B — Pages NS-API sondées</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1 text-xs font-mono">
            {(count?.b_pages ?? []).map((p, i) => (
              <div key={i} className="rounded border px-2 py-1">
                <div>HTTP {p.status} — {p.count} éléments — {p.url}</div>
                <div className="text-muted-foreground">
                  x-total-count: {p.headers["x-total-count"] ?? "—"} · content-range: {p.headers["content-range"] ?? "—"} · link: {p.headers["link"] ? "présent" : "—"}
                </div>
              </div>
            ))}
            {count?.b_warning && <div className="mt-2 text-destructive">⚠ {count.b_warning}</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs uppercase text-muted-foreground">{label}</div>
        <div className="text-3xl font-semibold">{String(value)}</div>
        {hint && <div className="mt-1 text-xs text-muted-foreground truncate">{hint}</div>}
      </CardContent>
    </Card>
  );
}
