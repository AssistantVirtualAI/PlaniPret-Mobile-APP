// PpCallDiagnosticPanel — overlay showing softphone state, current line/call id,
// and last CDR/recording probe results. Toggled from the in-call screen.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X, RefreshCw, Activity, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { PpSipSnapshot } from "@/lib/planipret/sip/ppSipProvider";

type Props = {
  open: boolean;
  onClose: () => void;
  snap: PpSipSnapshot;
};

type Diag = {
  ok?: boolean;
  extension?: string;
  domain?: string;
  count?: number;
  calls?: Array<{
    call_db_id: string;
    ns_ids: string[];
    extension: string;
    direction: string;
    from_number: string;
    to_number: string;
    started_at: string;
    duration_seconds: number;
    has_recording: boolean;
    recording_url_present: boolean;
    transcript_present: boolean;
    analyzed_at: string | null;
    cdr_checks: Array<{ id: string; status?: number; ok?: boolean; error?: string }>;
    recording_checks: Array<{ id: string; status?: number; ok?: boolean; ct?: string; error?: string }>;
    issues: string[];
  }>;
  error?: string;
};

export default function PpCallDiagnosticPanel({ open, onClose, snap }: Props) {
  const [diag, setDiag] = useState<Diag | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("pp-call-diagnostic", {
        body: { recent: true, limit: 3 },
      });
      if (error) setDiag({ error: error.message });
      else setDiag(data as Diag);
    } catch (e: any) {
      setDiag({ error: e?.message ?? "unknown" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (open) run(); }, [open, run]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-3"
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg rounded-2xl overflow-hidden text-white"
        style={{ background: "linear-gradient(160deg, #0A1425 0%, #0D2540 100%)", border: "1px solid rgba(255,255,255,0.12)" }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-semibold">Diagnostic softphone</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={run} disabled={loading} className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-4 space-y-3 text-xs">
          {/* Live softphone state */}
          <section className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="text-[11px] uppercase tracking-widest text-white/50 mb-2">État softphone</div>
            <Row label="Registration" value={snap.status ?? "—"} />
            <Row label="Call state" value={snap.callState ?? "idle"} />
            <Row label="Direction" value={snap.direction ?? "—"} />
            <Row label="Line / Call ID" value={snap.callId ?? "—"} mono />
            <Row label="Remote" value={snap.remoteNumber ?? snap.remoteIdentity ?? "—"} />
            <Row label="Muted / Hold" value={`${snap.muted ? "muted" : "on"} · ${snap.onHold ? "hold" : "live"}`} />
            {snap.errorCause && <Row label="Erreur" value={snap.errorCause} danger />}
          </section>

          {/* Backend diagnostic */}
          {diag?.error && (
            <div className="rounded-xl p-3 text-red-300" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)" }}>
              {diag.error}
            </div>
          )}

          {diag?.calls && diag.calls.length === 0 && (
            <div className="rounded-xl p-3 text-white/60" style={{ background: "rgba(255,255,255,0.04)" }}>
              Aucun appel récent trouvé pour l'extension {diag.extension ?? "—"}.
            </div>
          )}

          {diag?.calls?.map((c) => (
            <section key={c.call_db_id} className="rounded-xl p-3 space-y-2"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-widest text-white/50">
                    {c.direction} · {new Date(c.started_at).toLocaleString()}
                  </div>
                  <div className="text-sm">{c.from_number} → {c.to_number} · {c.duration_seconds}s</div>
                </div>
                {c.issues.length === 0
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  : <AlertTriangle className="w-4 h-4 text-amber-400" />}
              </div>
              <Row label="DB ID" value={c.call_db_id} mono />
              <Row label="NS IDs" value={c.ns_ids.join(", ") || "—"} mono />
              <Row label="Ext" value={c.extension || "—"} />
              <Row label="Recording" value={
                c.recording_url_present ? "url stockée"
                  : c.has_recording ? "flag ok / url absente" : "aucun"
              } />
              <Row label="Transcript" value={c.transcript_present ? "présent" : "absent"} />
              <Row label="Analyse IA" value={c.analyzed_at ? new Date(c.analyzed_at).toLocaleTimeString() : "non lancée"} />

              <details className="text-[11px] mt-1">
                <summary className="cursor-pointer text-white/60">Probes NS-API ({c.cdr_checks.length + c.recording_checks.length})</summary>
                <div className="mt-2 space-y-1">
                  {c.cdr_checks.map((p, i) => (
                    <div key={`cdr-${i}`} className="flex justify-between font-mono">
                      <span className="truncate mr-2">CDR {p.id}</span>
                      <span className={p.ok ? "text-emerald-400" : "text-red-300"}>{p.status ?? p.error}</span>
                    </div>
                  ))}
                  {c.recording_checks.map((p, i) => (
                    <div key={`rec-${i}`} className="flex justify-between font-mono">
                      <span className="truncate mr-2">REC {p.id}</span>
                      <span className={p.ok ? "text-emerald-400" : "text-red-300"}>{p.status ?? p.error}</span>
                    </div>
                  ))}
                </div>
              </details>

              {c.issues.length > 0 && (
                <div className="mt-2 space-y-1">
                  {c.issues.map((iss, i) => (
                    <div key={i} className="text-amber-300 text-[11px] flex gap-2">
                      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                      <span>{iss}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono, danger }: { label: string; value: string; mono?: boolean; danger?: boolean }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="text-white/50">{label}</span>
      <span className={`${mono ? "font-mono" : ""} ${danger ? "text-red-300" : "text-white/90"} truncate max-w-[60%] text-right`}>{value}</span>
    </div>
  );
}
