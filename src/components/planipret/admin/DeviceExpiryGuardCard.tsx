import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Stethoscope, RefreshCw } from "lucide-react";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

const ACCENT = "#2E9BDC";
const SUCCESS = "#00D4AA";
const WARNING = "#F6B44B";
const DANGER = "#E84C4C";

type RunRow = {
  id: string;
  function_name: string;
  status: string | null;
  finished_at: string | null;
  started_at: string | null;
  summary: Record<string, any> | null;
  error?: string | null;
};

const DICT = {
  fr: {
    title: "Expiry SIP des devices (1800 s)",
    subtitle: "Audit et réparation automatique de device-sip-registration-expiry-seconds",
    audit: "Auditer",
    repair: "Corriger",
    refresh: "Rafraîchir",
    cron: "Vérification automatique toutes les 6 h",
    checked: "Vérifiés",
    compliant: "Conformes",
    drifted: "En dérive",
    repaired: "Réparés",
    errors: "Erreurs",
    noRun: "Aucune exécution enregistrée pour l'instant.",
    lastRuns: "Dernières exécutions",
    running: "Exécution en cours…",
    done: (c: number, r: number) => `Audit terminé — ${c} devices conformes, ${r} réparés`,
    failed: "Échec de l'exécution",
  },
  en: {
    title: "Device SIP expiry (1800s)",
    subtitle: "Audit and auto-repair of device-sip-registration-expiry-seconds",
    audit: "Audit",
    repair: "Repair",
    refresh: "Refresh",
    cron: "Automatic check every 6h",
    checked: "Checked",
    compliant: "Compliant",
    drifted: "Drifted",
    repaired: "Repaired",
    errors: "Errors",
    noRun: "No run recorded yet.",
    lastRuns: "Recent runs",
    running: "Running…",
    done: (c: number, r: number) => `Audit done — ${c} compliant devices, ${r} repaired`,
    failed: "Run failed",
  },
};

export default function DeviceExpiryGuardCard() {
  const { lang } = useMplanipretLang();
  const t = DICT[(lang === "en" ? "en" : "fr") as "fr" | "en"];
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<null | "audit" | "repair">(null);

  const loadRuns = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("planipret_edge_function_runs")
      .select("id, function_name, status, started_at, finished_at, summary, error")
      .in("function_name", ["pp-devices-expiry-guard", "ns-provision-broker-devices"])
      .order("finished_at", { ascending: false, nullsFirst: false })
      .limit(6);
    setRuns((data as RunRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  const run = useCallback(async (fix: boolean) => {
    setBusy(fix ? "repair" : "audit");
    const { data, error } = await supabase.functions.invoke("pp-devices-expiry-guard", {
      body: { fix, limit: 500, include_details: false },
    });
    setBusy(null);
    const res = data as any;
    if (error || !res?.success) {
      toast.error(t.failed, { description: res?.error || res?.detail || error?.message });
    } else {
      toast.success(t.done(res.compliant ?? 0, res.repaired ?? 0));
    }
    loadRuns();
  }, [loadRuns, t]);

  const last = runs.find((r) => r.function_name === "pp-devices-expiry-guard");
  const s = (last?.summary ?? {}) as Record<string, any>;

  const stat = (label: string, value: number | string, color: string) => (
    <div className="rounded-lg px-3 py-2" style={{ background: "var(--pp-bg-base)", border: "1px solid var(--pp-bg-border-2)" }}>
      <div style={{ fontSize: 11, color: "var(--pp-text-secondary)" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color }}>{value}</div>
    </div>
  );

  return (
    <div className="rounded-xl p-4" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 font-semibold" style={{ color: "var(--pp-text-primary)" }}>
            <ShieldCheck className="h-4 w-4" style={{ color: ACCENT }} /> {t.title}
          </div>
          <div style={{ fontSize: 12, color: "var(--pp-text-secondary)" }}>{t.subtitle}</div>
          <div style={{ fontSize: 11, color: SUCCESS }}>{t.cron}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => run(false)} disabled={!!busy} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium" style={{ background: "var(--pp-bg-base)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)", opacity: busy ? 0.65 : 1 }}>
            {busy === "audit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stethoscope className="h-4 w-4" />} {t.audit}
          </button>
          <button onClick={() => run(true)} disabled={!!busy} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium" style={{ background: "#0D2540", border: `1px solid ${ACCENT}44`, color: ACCENT, opacity: busy ? 0.65 : 1 }}>
            {busy === "repair" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} {t.repair}
          </button>
          <button onClick={loadRuns} disabled={loading} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--pp-bg-base)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} {t.refresh}
          </button>
        </div>
      </div>

      {last ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {stat(t.checked, s.checked ?? 0, "var(--pp-text-primary)")}
          {stat(t.compliant, s.compliant ?? 0, SUCCESS)}
          {stat(t.drifted, s.drifted ?? 0, WARNING)}
          {stat(t.repaired, s.repaired ?? 0, ACCENT)}
          {stat(t.errors, (s.errors ?? 0) + (s.repair_failed ?? 0), DANGER)}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "var(--pp-text-secondary)" }}>{busy ? t.running : t.noRun}</div>
      )}

      {runs.length > 0 && (
        <div className="mt-3">
          <div className="mb-1" style={{ fontSize: 11, color: "var(--pp-text-secondary)" }}>{t.lastRuns}</div>
          <div className="space-y-1">
            {runs.map((r) => {
              const rs = (r.summary ?? {}) as Record<string, any>;
              return (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1.5" style={{ background: "var(--pp-bg-base)", fontSize: 11, color: "var(--pp-text-secondary)" }}>
                  <span style={{ color: "var(--pp-text-primary)" }}>{r.function_name}</span>
                  <span>{r.finished_at ? new Date(r.finished_at).toLocaleString(lang === "en" ? "en-CA" : "fr-CA") : "—"}</span>
                  <span>{rs.mode ?? rs.trigger ?? "—"} · {rs.triggered ?? "—"}</span>
                  <span>
                    {rs.checked !== undefined
                      ? `${rs.compliant ?? 0}/${rs.checked} ok · ${rs.repaired ?? 0} fix`
                      : `${rs.created ?? 0} new · ${rs.patched ?? 0} patch · ${rs.skipped ?? 0} skip`}
                  </span>
                  <span style={{ color: r.status === "ok" ? SUCCESS : r.status === "error" ? DANGER : WARNING }}>{r.status ?? "—"}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
