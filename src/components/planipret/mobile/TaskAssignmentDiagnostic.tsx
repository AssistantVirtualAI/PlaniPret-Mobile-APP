import { useState } from "react";
import { createPortal } from "react-dom";
import { X, CheckCircle2, XCircle, Loader2, ExternalLink } from "lucide-react";
import { invokeEdge } from "@/lib/planipret/edgeAuth";

interface Step { step: string; ok: boolean; detail: string }
interface Result {
  success?: boolean;
  ok?: boolean;
  steps?: Step[];
  task_id?: string;
  expected_assignee?: string;
  returned_assignees?: string[];
  assignment_source?: string;
  maestro_task_url?: string | null;
  message?: string;
  error?: string;
  correlation_id?: string;
}

const LABELS: Record<string, string> = {
  allowed_assignees: "Assignations autorisées (moi + adjoints)",
  assignee_guard: "Vérification avant envoi",
  payload: "Payload Task API",
  create: "POST /api/main/tasks",
  readback: "Relecture de la tâche",
  users_populated: "GET renvoie users pour mon profil",
  cleanup: "Nettoyage",
};

/**
 * Diagnostic screen: runs a real round-trip in the Maestro Task module
 * (create → read back → check `users`) and shows exactly where it breaks.
 */
export default function TaskAssignmentDiagnostic({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [cleanup, setCleanup] = useState(false);
  const [assignee, setAssignee] = useState("");
  const [res, setRes] = useState<Result | null>(null);

  const run = async () => {
    setBusy(true);
    setRes(null);
    const { data, error } = await invokeEdge("planipret-task-api", {
      action: "assignment_selftest",
      cleanup,
      ...(assignee.trim() ? { users_id: assignee.trim() } : {}),
    });
    setRes(error ? { success: false, error: "network_error", message: error.message } : (data as Result));
    setBusy(false);
  };

  const host = typeof document !== "undefined"
    ? (document.getElementById("pp-mobile-frame") ?? document.body)
    : null;
  if (!host) return null;

  const card = { background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-primary)" } as const;

  return createPortal((
    <div className="absolute inset-0 z-[110] flex items-end" role="dialog" aria-modal="true" aria-label="Diagnostic d'assignation">
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose} />
      <div
        className="relative w-full rounded-t-3xl overflow-y-auto"
        style={{ background: "var(--pp-bg-base, #fff)", maxHeight: "92%", paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 pt-4 pb-3" style={{ background: "var(--pp-bg-base, #fff)" }}>
          <h2 className="text-base font-semibold pp-heading">Diagnostic — assignation de tâche</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="w-10 h-10 rounded-xl flex items-center justify-center" style={card}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 pb-6 space-y-3">
          <p className="text-[12px]" style={{ color: "var(--pp-text-muted)" }}>
            Crée une vraie tâche dans le module Task de Maestro, la relit et vérifie que <code>users</code>
            {" "}contient bien votre profil. La tâche est conservée pour que vous puissiez la voir dans Maestro.
          </p>

          <label className="block">
            <span className="text-[11px]" style={{ color: "var(--pp-text-muted)" }}>users_id à tester (vide = moi)</span>
            <input
              className="w-full rounded-xl px-3 py-3 text-sm" style={card}
              inputMode="numeric" value={assignee} placeholder="ex. 387460525"
              aria-label="users_id à tester"
              onChange={(e) => setAssignee(e.target.value)}
            />
          </label>

          <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--pp-text-muted)" }}>
            <input type="checkbox" checked={cleanup} onChange={(e) => setCleanup(e.target.checked)} />
            Supprimer la tâche de test à la fin
          </label>

          <button
            type="button" onClick={run} disabled={busy}
            className="w-full rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: "var(--pp-color-primary, #0023e6)", color: "#fff" }}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {busy ? "Test en cours…" : "Lancer le diagnostic"}
          </button>

          {res && (
            <div className="space-y-2">
              {(res.steps ?? []).map((s) => (
                <div key={s.step} className="rounded-xl px-3 py-2 flex items-start gap-2" style={card}>
                  {s.ok
                    ? <CheckCircle2 className="w-4 h-4 mt-0.5" style={{ color: "#22c55e" }} />
                    : <XCircle className="w-4 h-4 mt-0.5" style={{ color: "var(--pp-color-danger, #ef4444)" }} />}
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium">{LABELS[s.step] ?? s.step}</div>
                    <div className="text-[11px] break-words" style={{ color: "var(--pp-text-muted)" }}>{s.detail}</div>
                  </div>
                </div>
              ))}

              {res.message && !res.steps?.length && (
                <div className="rounded-xl px-3 py-2 text-[12px]" style={card}>{res.message}</div>
              )}

              {res.task_id && (
                <div className="rounded-xl px-3 py-3 space-y-1" style={card}>
                  <div className="text-[13px] font-medium">Tâche Maestro #{res.task_id}</div>
                  <div className="text-[11px]" style={{ color: "var(--pp-text-muted)" }}>
                    Attendu : {res.expected_assignee} · Retourné : {(res.returned_assignees ?? []).join(", ") || "—"} ({res.assignment_source})
                  </div>
                  {res.maestro_task_url && (
                    <a href={res.maestro_task_url} target="_blank" rel="noreferrer"
                      className="text-[12px] font-semibold inline-flex items-center gap-1"
                      style={{ color: "var(--pp-color-primary, #0023e6)" }}>
                      Ouvrir dans Maestro <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}

              {res.correlation_id && (
                <div className="text-[10px]" style={{ color: "var(--pp-text-muted)" }}>ID de corrélation : {res.correlation_id}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  ), host);
}
