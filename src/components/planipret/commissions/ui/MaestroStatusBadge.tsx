import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, CloudOff, Clock, Database, Loader2 } from "lucide-react";
import {
  MAESTRO_SYNC_EVENT, readMaestroSyncStatus, relativeTime, type MaestroSyncStatus,
} from "@/lib/planipret/commissionsCache";

/**
 * Status strip shown under the commissions toolbar: last sync date, number of
 * imported commissions, current data freshness and the last UI-side error.
 */
export default function MaestroStatusBadge({
  lang, scope, loading, stale, dataError, rowCount, dataSyncedAt,
}: {
  lang: "fr" | "en";
  scope: "admin" | "broker";
  loading?: boolean;
  stale?: boolean;
  dataError?: string | null;
  rowCount?: number | null;
  dataSyncedAt?: string | null;
}) {
  const isFr = lang !== "en";
  const [status, setStatus] = useState<MaestroSyncStatus | null>(() => readMaestroSyncStatus(scope));

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (!d || d.scope === scope) setStatus(readMaestroSyncStatus(scope));
    };
    window.addEventListener(MAESTRO_SYNC_EVENT, on);
    return () => window.removeEventListener(MAESTRO_SYNC_EVENT, on);
  }, [scope]);

  const syncedAt = status?.at ?? dataSyncedAt ?? null;
  const rel = relativeTime(syncedAt, isFr);
  const failed = status && !status.ok;

  const tone = dataError || failed ? "#ef4444" : stale ? "#f59e0b" : "#16a34a";
  const Icon = loading ? Loader2 : dataError ? CloudOff : failed ? AlertTriangle : stale ? Clock : CheckCircle2;

  const chip = (content: React.ReactNode, key: string) => (
    <span key={key} className="inline-flex items-center gap-1" style={{ fontSize: 11.5, color: "var(--pp-text-muted)" }}>
      {content}
    </span>
  );

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2 rounded-xl"
      style={{
        padding: "7px 10px",
        border: `1px solid color-mix(in srgb, ${tone} 40%, var(--pp-bg-border))`,
        background: `color-mix(in srgb, ${tone} 8%, transparent)`,
      }}
    >
      <span className="inline-flex items-center gap-1.5" style={{ fontSize: 12, fontWeight: 800, color: tone }}>
        <Icon className={`w-3.5 h-3.5${loading ? " animate-spin" : ""}`} />
        {loading
          ? (isFr ? "Chargement des commissions…" : "Loading commissions…")
          : dataError
            ? (isFr ? "Endpoint Maestro injoignable" : "Maestro endpoint unreachable")
            : stale
              ? (isFr ? "Données en cache (dernier affichage)" : "Cached data (last known)")
              : (isFr ? "Données à jour" : "Data up to date")}
      </span>

      {chip(<><Clock className="w-3 h-3" />{isFr ? "Dernier sync" : "Last sync"} : {rel ?? (isFr ? "jamais" : "never")}</>, "sync")}

      {status && chip(
        <><Database className="w-3 h-3" />{isFr ? "Commissions importées" : "Imported commissions"} : {status.written ?? 0}
          {status.brokers ? ` · ${status.brokers} ${isFr ? "courtier(s)" : "broker(s)"}` : ""}</>,
        "imported",
      )}

      {typeof rowCount === "number" && chip(
        <>{isFr ? "Lignes affichées" : "Rows displayed"} : {rowCount}</>, "rows",
      )}

      {(dataError || status?.error) && (
        <span className="truncate" style={{ fontSize: 11.5, color: "#ef4444", maxWidth: 420 }}>
          {status?.code === "no_endpoint"
            ? (isFr ? "Endpoint Maestro pas encore disponible — données inchangées."
                    : "Maestro endpoint not available yet — data unchanged.")
            : (dataError ?? status?.error)}
        </span>
      )}

      {status?.unlinked?.length ? (
        <span className="truncate" style={{ fontSize: 11.5, color: "#f59e0b", maxWidth: 360 }}>
          {isFr ? "Non rattachés" : "Unlinked"} : {status.unlinked.slice(0, 3).join(", ")}
          {status.unlinked.length > 3 ? ` +${status.unlinked.length - 3}` : ""}
        </span>
      ) : null}
    </div>
  );
}
