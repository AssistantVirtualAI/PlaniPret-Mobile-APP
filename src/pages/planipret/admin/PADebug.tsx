import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw } from "lucide-react";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

const DICT = {
  fr: {
    title: "Debug NS-API ↔ Courtiers",
    subtitle: "Audit du décalage entre `planipret_profiles` et les extensions NetSapiens.",
    rerun: "Relancer",
    statA: "A — planipret_profiles",
    statAHint: "Comptes courtiers du portail",
    statB: "B — NS-API (paginé)",
    statD: "D — pp-ns-users (KPI/sidebar)",
    statHeader: "X-Total-Count entêtes",
    statHeaderHint: "Si renseigné, fait foi",
    diffTitle: "C — Diff portail ↔ NS-API",
    nsMissingFromPortal: (n: number) => `Extensions NS-API sans compte portail : ${n}`,
    moreCount: (n: number) => `…+${n} de plus`,
    portalMissingFromNs: (n: number) => `Profils portail sans extension NS-API : ${n}`,
    pagesTitle: "B — Pages NS-API sondées",
    httpLine: (status: number, count: number, url: string) => `HTTP ${status} — ${count} éléments — ${url}`,
    present: "présent",
  },
  en: {
    title: "Debug NS-API ↔ Brokers",
    subtitle: "Audit of the mismatch between `planipret_profiles` and NetSapiens extensions.",
    rerun: "Rerun",
    statA: "A — planipret_profiles",
    statAHint: "Portal broker accounts",
    statB: "B — NS-API (paginated)",
    statD: "D — pp-ns-users (KPI/sidebar)",
    statHeader: "X-Total-Count headers",
    statHeaderHint: "If set, it's authoritative",
    diffTitle: "C — Portal ↔ NS-API diff",
    nsMissingFromPortal: (n: number) => `NS-API extensions without a portal account: ${n}`,
    moreCount: (n: number) => `…+${n} more`,
    portalMissingFromNs: (n: number) => `Portal profiles without an NS-API extension: ${n}`,
    pagesTitle: "B — Probed NS-API pages",
    httpLine: (status: number, count: number, url: string) => `HTTP ${status} — ${count} items — ${url}`,
    present: "present",
  },
} as const;

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
  const { lang } = useMplanipretLang();
  const t = DICT[lang];
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
          <h1 className="text-2xl font-semibold">{t.title}</h1>
          <p className="text-sm text-muted-foreground">
            {t.subtitle}
          </p>
        </div>
        <Button onClick={run} disabled={loading} variant="outline">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          {t.rerun}
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat label={t.statA} value={count?.a_portalCount ?? "—"} hint={t.statAHint} />
        <Stat label={t.statB} value={count?.b_nsApiCount ?? "—"} hint={count?.b_paginationSignal ?? ""} />
        <Stat label={t.statD} value={ppNsUsersCount ?? "—"} hint={ppNsUsersStrategy ?? ""} />
        <Stat label={t.statHeader} value={count?.b_totalFromHeader ?? "n/a"} hint={t.statHeaderHint} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{t.diffTitle}</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <div className="font-medium">
              {t.nsMissingFromPortal(count?.c_nsExtensionsMissingFromPortalCount ?? 0)}
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {(count?.c_nsExtensionsMissingFromPortal ?? []).slice(0, 80).map((e) => (
                <Badge key={e} variant="outline" className="font-mono text-xs">{e}</Badge>
              ))}
              {((count?.c_nsExtensionsMissingFromPortal?.length ?? 0) > 80) && (
                <span className="text-muted-foreground">{t.moreCount(count!.c_nsExtensionsMissingFromPortal.length - 80)}</span>
              )}
            </div>
          </div>
          <div>
            <div className="font-medium">
              {t.portalMissingFromNs(count?.c_portalProfilesMissingFromNsCount ?? 0)}
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
        <CardHeader><CardTitle className="text-base">{t.pagesTitle}</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1 text-xs font-mono">
            {(count?.b_pages ?? []).map((p, i) => (
              <div key={i} className="rounded border px-2 py-1">
                <div>{t.httpLine(p.status, p.count, p.url)}</div>
                <div className="text-muted-foreground">
                  x-total-count: {p.headers["x-total-count"] ?? "—"} · content-range: {p.headers["content-range"] ?? "—"} · link: {p.headers["link"] ? t.present : "—"}
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
