// ReconnectStatus — bandeau de reconnexion partagé chatbot / voicebot.
// Affiche un spinner, la tentative en cours et un compte à rebours avant la
// prochaine tentative, avec une annulation utilisateur explicite.
import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";

export interface ReconnectStatusProps {
  attempt: number;
  maxAttempts: number;
  /** Timestamp (ms) de la prochaine tentative. Absent = tentative en cours. */
  nextAttemptAt?: number | null;
  onCancel: () => void;
  lang?: "fr" | "en";
  label?: string;
}

export default function ReconnectStatus({
  attempt, maxAttempts, nextAttemptAt, onCancel, lang = "fr", label,
}: ReconnectStatusProps) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!nextAttemptAt) { setRemaining(0); return; }
    const tick = () => setRemaining(Math.max(0, Math.ceil((nextAttemptAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [nextAttemptAt]);

  const L = (fr: string, en: string) => (lang === "fr" ? fr : en);
  const title = label ?? L("Reconnexion en cours…", "Reconnecting…");

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="reconnect-status"
      className="mx-4 mt-3 px-3 py-2 rounded-xl flex items-center gap-3 text-[12px]"
      style={{ background: "rgba(46,155,220,0.14)", border: "1px solid rgba(46,155,220,0.35)", color: "#E8EDF5" }}
    >
      <Loader2 className="w-4 h-4 animate-spin shrink-0" style={{ color: "#2E9BDC" }} aria-hidden />
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate">{title}</div>
        <div style={{ color: "#8FB4CE" }}>
          {L("Tentative", "Attempt")} {Math.min(attempt, maxAttempts)}/{maxAttempts}
          {remaining > 0 ? ` · ${L("nouvelle tentative dans", "retry in")} ${remaining}s` : ""}
        </div>
      </div>
      <button
        type="button"
        onClick={onCancel}
        data-testid="reconnect-cancel"
        aria-label={L("Annuler la reconnexion", "Cancel reconnection")}
        className="shrink-0 h-8 px-3 rounded-lg flex items-center gap-1 font-medium"
        style={{ background: "rgba(255,255,255,0.10)", color: "#fff" }}
      >
        <X className="w-3.5 h-3.5" />
        {L("Annuler", "Cancel")}
      </button>
    </div>
  );
}
