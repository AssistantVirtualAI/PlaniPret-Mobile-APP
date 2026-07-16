import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, XCircle, AlertCircle, Activity } from "lucide-react";

/**
 * NsSyncBar — passive NS-API status indicator.
 *
 * All manual sync buttons have been removed. Sync now runs automatically in the
 * background via `usePlanipretNsAutoSync` mounted at the admin layout level.
 * This component only reports connectivity + last-sync timestamp.
 */

type FeatureKey = "cdrs" | "messages" | "recordings" | "voicemails";
type FeatureStatus = "ok" | "empty" | "unavailable" | "error" | "unknown";

interface Feature {
  feature: FeatureKey;
  status: FeatureStatus;
  detail?: string;
  sample_count?: number;
  last_probed_at?: string | null;
}

const LABELS: Record<FeatureKey, string> = {
  cdrs: "CDR",
  messages: "SMS",
  recordings: "Enregistrements",
  voicemails: "Boîtes vocales",
};

const NS_DOMAIN = "planipret.ca";

function statusColor(s: FeatureStatus) {
  if (s === "ok") return "#00D4AA";
  if (s === "empty") return "#F5A623";
  if (s === "error" || s === "unavailable") return "#E84C4C";
  return "#6B7280";
}

function statusIcon(s: FeatureStatus) {
  if (s === "ok") return <CheckCircle2 className="w-3 h-3" style={{ color: statusColor(s) }} />;
  if (s === "empty") return <AlertCircle className="w-3 h-3" style={{ color: statusColor(s) }} />;
  if (s === "error" || s === "unavailable") return <XCircle className="w-3 h-3" style={{ color: statusColor(s) }} />;
  return <Activity className="w-3 h-3" style={{ color: statusColor(s) }} />;
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.floor(diff / 1000));
  if (s < 60) return `il y a ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return new Date(iso).toLocaleString("fr-CA", { dateStyle: "short", timeStyle: "short" });
}

export interface NsSyncBarProps {
  features?: FeatureKey[];
  /** Ignored — kept for backwards compatibility. */
  onReload?: () => void | Promise<void>;
  reloadLabel?: string;
}

export default function NsSyncBar({ features = ["cdrs", "messages", "recordings"] }: NsSyncBarProps) {
  const [rows, setRows] = useState<Feature[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const loadStatus = useCallback(async () => {
    const { data } = await supabase
      .from("planipret_ns_server_capabilities")
      .select("feature, status, detail, sample_count, last_probed_at")
      .eq("domain", NS_DOMAIN)
      .in("feature", features);
    const map = new Map<string, Feature>();
    (data ?? []).forEach((r: any) => map.set(r.feature, r as Feature));
    setRows(features.map((f) => map.get(f) ?? { feature: f, status: "unknown" as FeatureStatus }));

    const { data: run } = await supabase
      .from("planipret_edge_function_runs")
      .select("finished_at, started_at")
      .eq("function_name", "pp-admin-ns-sync")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (run) setLastSync(run.finished_at ?? run.started_at ?? null);
  }, [features.join(",")]);

  useEffect(() => {
    loadStatus();
    const t = window.setInterval(loadStatus, 30_000);
    const rel = window.setInterval(() => setTick((x) => x + 1), 15_000);
    const onFocus = () => loadStatus();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(t);
      window.clearInterval(rel);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadStatus]);

  return (
    <div
      className="pp-card p-2.5 flex flex-wrap items-center gap-3"
      style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full"
          style={{
            background: "rgba(0,212,170,0.10)",
            border: "1px solid rgba(0,212,170,0.30)",
            fontSize: 10,
            fontWeight: 700,
            color: "#00D4AA",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
          title="Synchronisation NS-API automatique en arrière-plan"
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#00D4AA",
              boxShadow: "0 0 0 3px rgba(0,212,170,0.18)",
              animation: "pp-pulse 2s ease-in-out infinite",
            }}
          />
          Sync auto
        </span>
        <div className="flex items-center gap-1.5">
          {rows.map((r) => (
            <span
              key={r.feature}
              title={`${r.detail ?? r.status}${r.sample_count ? ` · ${r.sample_count} échantillons` : ""}${r.last_probed_at ? ` · ${new Date(r.last_probed_at).toLocaleString("fr-CA")}` : ""}`}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px]"
              style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}
            >
              {statusIcon(r.status)}
              {LABELS[r.feature]}
            </span>
          ))}
        </div>
      </div>

      {lastSync && (
        <span className="text-[10px] ml-auto" style={{ color: "var(--pp-text-faint)" }} data-tick={tick}>
          Dernière sync · {relTime(lastSync)}
        </span>
      )}
      <style>{`@keyframes pp-pulse { 0%,100%{opacity:1} 50%{opacity:.55} }`}</style>
    </div>
  );
}
