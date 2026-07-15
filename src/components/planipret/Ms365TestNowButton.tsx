/**
 * Reusable "Tester maintenant" button for Microsoft 365 pages.
 * Runs an end-to-end test of the endpoints/scopes for a given feature and
 * auto-launches the reconnect flow if the failure is auth-related.
 */
import { useState } from "react";
import { Loader2, PlayCircle, CheckCircle2, XCircle } from "lucide-react";
import { runMs365E2EWithAutoReconnect, type Ms365Feature, type Ms365TestReport } from "@/lib/ms365E2E";

export default function Ms365TestNowButton({
  feature,
  compact = false,
  label,
}: {
  feature: Ms365Feature;
  compact?: boolean;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<Ms365TestReport | null>(null);
  const [open, setOpen] = useState(false);

  async function run() {
    setLoading(true);
    setOpen(true);
    try {
      const r = await runMs365E2EWithAutoReconnect(feature);
      setReport(r);
    } finally {
      setLoading(false);
    }
  }

  const Icon = loading ? Loader2 : !report ? PlayCircle : report.ok ? CheckCircle2 : XCircle;
  const color = !report ? "#0078D4" : report.ok ? "#1a6b3a" : "#7a1b1b";

  return (
    <div className={compact ? "" : "space-y-2"}>
      <button
        type="button"
        onClick={run}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-lg font-semibold disabled:opacity-60"
        style={{
          background: color,
          color: "white",
          padding: compact ? "5px 10px" : "8px 12px",
          fontSize: compact ? 11 : 12,
        }}
        title="Test end-to-end des endpoints Microsoft"
      >
        <Icon className={loading ? "animate-spin" : ""} style={{ width: compact ? 12 : 14, height: compact ? 12 : 14 }} />
        {label ?? "Tester maintenant"}
      </button>

      {open && report && !compact && (
        <div className="rounded-lg p-2 text-xs" style={{ background: "#0A1628", border: "1px solid #0E2A45", color: "#E8EDF5" }}>
          <div className="flex items-center justify-between mb-1">
            <div className="font-semibold" style={{ color: report.ok ? "#2EDC78" : "#E84C4C" }}>
              {report.ok ? "Tous les tests OK" : "Échec détecté"} · {report.elapsedMs}ms
            </div>
            <button onClick={() => setOpen(false)} className="opacity-60 hover:opacity-100 text-[10px]">Masquer</button>
          </div>
          <ul className="space-y-1">
            {report.steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                {s.ok
                  ? <CheckCircle2 className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: "#2EDC78" }} />
                  : <XCircle className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: "#E84C4C" }} />}
                <div className="min-w-0">
                  <span className="font-medium">{s.name}</span>{" "}
                  <span style={{ color: "#8FA8C0" }}>· {s.ms}ms</span>
                  <div className="truncate" style={{ color: s.ok ? "#8FA8C0" : "#E84C4C" }} title={s.message}>{s.message}</div>
                  {!s.ok && s.scopeHint && (
                    <div className="text-[10px]" style={{ color: "#F5A623" }}>Scope requis: {s.scopeHint}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {report.needsReconnect && (
            <div className="mt-2 text-[10px]" style={{ color: "#F5A623" }}>
              Reconnexion OAuth lancée automatiquement…
            </div>
          )}
        </div>
      )}
    </div>
  );
}
