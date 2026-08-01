/**
 * MaestroCallPostingPanel
 * ─────────────────────────
 * Affiche dans la page Connexions (MConnections) un résumé du statut
 * du posting automatique des appels vers Maestro CRM.
 *
 * Les 4 règles Scott :
 *  1. Appel sortant vers un client → posté
 *  2. Appel sortant vers un numéro VoIP de courtier → posté
 *  3. Appel entrant depuis un client → posté
 *  4. Appel entrant depuis un numéro VoIP de courtier → ignoré (l'appelant poste)
 */
import { CheckCircle2, PhoneCall, Info } from "lucide-react";

interface Props {
  lang?: "fr" | "en";
}

const LABELS = {
  fr: {
    title: "Posting automatique Maestro",
    subtitle: "Les appels sont automatiquement enregistrés dans Maestro CRM selon les règles suivantes :",
    rules: [
      "Appel sortant vers un client → enregistré",
      "Appel sortant vers un courtier VoIP → enregistré",
      "Appel entrant depuis un client → enregistré",
      "Appel entrant depuis un courtier VoIP → ignoré (l'appelant enregistre)",
    ],
    dedup: "Déduplication 90 s · Retry 3× · Fire-and-forget",
  },
  en: {
    title: "Maestro Auto Call Posting",
    subtitle: "Calls are automatically recorded in Maestro CRM according to the following rules:",
    rules: [
      "Outbound call to a client → posted",
      "Outbound call to a broker VoIP number → posted",
      "Inbound call from a client → posted",
      "Inbound call from a broker VoIP number → skipped (caller posts)",
    ],
    dedup: "90 s dedup · 3× retry · Fire-and-forget",
  },
};

export default function MaestroCallPostingPanel({ lang = "fr" }: Props) {
  const L = LABELS[lang] ?? LABELS.fr;

  return (
    <section
      className="rounded-2xl p-4 mt-4"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <PhoneCall className="w-4 h-4 shrink-0" style={{ color: "var(--pp-brand-accent)" }} />
        <span className="text-[13px] font-semibold" style={{ color: "var(--pp-text-primary)" }}>
          {L.title}
        </span>
      </div>
      <p className="text-[11px] mb-3" style={{ color: "var(--pp-text-muted)" }}>
        {L.subtitle}
      </p>
      <ul className="space-y-1.5">
        {L.rules.map((rule, i) => (
          <li key={i} className="flex items-start gap-2">
            <CheckCircle2
              className="w-3.5 h-3.5 mt-0.5 shrink-0"
              style={{ color: i === 3 ? "var(--pp-text-muted)" : "var(--pp-brand-accent)" }}
            />
            <span className="text-[11px]" style={{ color: "var(--pp-text-secondary)" }}>
              {rule}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-1.5 mt-3">
        <Info className="w-3 h-3 shrink-0" style={{ color: "var(--pp-text-muted)" }} />
        <span className="text-[10px]" style={{ color: "var(--pp-text-muted)" }}>
          {L.dedup}
        </span>
      </div>
    </section>
  );
}
