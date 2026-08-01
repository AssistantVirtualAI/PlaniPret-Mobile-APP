/**
 * MaestroCallPostingPanel — live status of the Maestro `POST /calls` rules.
 *
 * Shows, for the current and recent calls, whether the inbound/outbound event
 * was posted, skipped (and why), retried, or blocked at end-of-call.
 */
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Clock, SkipForward, PhoneIncoming, PhoneOutgoing } from "lucide-react";
import {
  getMaestroPostingRecords,
  subscribeMaestroPosting,
  type MaestroPostRecord,
  type MaestroPostState,
} from "@/lib/planipret/maestroCallPosting";

const STATE_TONE: Record<MaestroPostState, string> = {
  posted: "#2EDC78",
  pending: "#F5A623",
  skipped: "#8FA8C0",
  failed: "#E84C4C",
};

const REASONS: Record<string, { fr: string; en: string }> = {
  posted: { fr: "Publié dans Maestro", en: "Posted to Maestro" },
  posting: { fr: "Envoi en cours…", en: "Posting…" },
  queued: { fr: "En attente", en: "Queued" },
  classifying: { fr: "Classification de l'appelant…", en: "Classifying caller…" },
  rule_4_inbound_from_broker_voip: {
    fr: "Règle 4 — entrant depuis un numéro VoIP de courtier (l'appelant crée l'enregistrement)",
    en: "Rule 4 — inbound from a broker VoIP number (the caller creates the record)",
  },
  classification_unavailable_posted: {
    fr: "Classification indisponible — publié quand même (POST /calls est idempotent)",
    en: "Classification unavailable — posted anyway (POST /calls is idempotent)",
  },
  post_failed: { fr: "Échec après 3 tentatives", en: "Failed after 3 attempts" },
};

function reasonLabel(reason: string, lang: "fr" | "en") {
  if (REASONS[reason]) return REASONS[reason][lang];
  const m = /^posting_attempt_(\d+)$/.exec(reason);
  if (m) return lang === "fr" ? `Envoi — tentative ${m[1]}` : `Posting — attempt ${m[1]}`;
  return reason;
}

const ENDED: Record<MaestroPostRecord["endedUpdate"], { fr: string; en: string }> = {
  none: { fr: "aucune mise à jour de fin", en: "no end-of-call update" },
  sent: { fr: "fin d'appel envoyée", en: "end-of-call sent" },
  failed: { fr: "fin d'appel échouée", en: "end-of-call failed" },
  blocked: { fr: "fin d'appel bloquée (jamais publié)", en: "end-of-call blocked (never posted)" },
};

export default function MaestroCallPostingPanel({ lang = "fr" }: { lang?: "fr" | "en" }) {
  const [rows, setRows] = useState<MaestroPostRecord[]>(() => getMaestroPostingRecords());

  useEffect(() => subscribeMaestroPosting(() => setRows(getMaestroPostingRecords())), []);

  return (
    <section className="mt-5 rounded-xl p-3" style={{ background: "#0A1628", border: "1px solid #0E2A45" }}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-semibold flex-1">
          {lang === "fr" ? "Publication des appels Maestro" : "Maestro call posting"}
        </span>
        <span className="text-[10px]" style={{ color: "#5E7A96" }}>
          {rows.length} {lang === "fr" ? "appel(s)" : "call(s)"}
        </span>
      </div>

      {rows.length === 0 && (
        <p className="text-xs" style={{ color: "#8FA8C0" }}>
          {lang === "fr"
            ? "Aucun appel depuis l'ouverture de l'application."
            : "No calls since the app was opened."}
        </p>
      )}

      <ul className="space-y-2">
        {rows.map((r) => {
          const tone = STATE_TONE[r.state];
          const StateIcon =
            r.state === "posted" ? CheckCircle2 : r.state === "failed" ? XCircle : r.state === "pending" ? Clock : SkipForward;
          const DirIcon = r.direction === "inbound" ? PhoneIncoming : PhoneOutgoing;
          return (
            <li key={r.callId} className="rounded-lg p-2.5" style={{ background: "#081120", border: "1px solid #0E2A45" }}>
              <div className="flex items-center gap-2">
                <DirIcon className="w-3.5 h-3.5 shrink-0" style={{ color: "#5EC2FF" }} />
                <span className="text-xs font-semibold flex-1 truncate">{r.number || (lang === "fr" ? "Numéro inconnu" : "Unknown number")}</span>
                <StateIcon className="w-3.5 h-3.5 shrink-0" style={{ color: tone }} />
                <span className="text-[10px] font-semibold uppercase" style={{ color: tone }}>{r.state}</span>
              </div>
              <p className="text-[11px] mt-1" style={{ color: "#8FA8C0" }}>{reasonLabel(r.reason, lang)}</p>
              {r.lastError && (
                <p className="text-[10px] mt-0.5 break-words" style={{ color: "#E84C4C" }}>{r.lastError}</p>
              )}
              <p className="text-[10px] mt-1 break-all" style={{ color: "#5E7A96" }}>
                {r.direction} · {r.classification} · {lang === "fr" ? "tentatives" : "attempts"} {r.attempts} · {ENDED[r.endedUpdate][lang]}
              </p>
              <p className="text-[10px] break-all" style={{ color: "#40597A" }}>
                dedup: {r.dedupKey} · id: {r.callId}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
