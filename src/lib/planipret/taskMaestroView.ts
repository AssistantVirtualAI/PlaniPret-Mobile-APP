/**
 * Maps a normalized task to the exact columns Maestro shows on its Tasks page:
 * statut · client · Filogix / Catégorie · Courtier traitant / Conseiller réf.
 * · étape + date de création · remarques.
 *
 * Presentation only: everything is read from the Maestro payload (`raw`) with
 * tolerant fallbacks, so a missing field renders as "-" like in Maestro.
 */
import type { NormalizedTask } from "../../../supabase/functions/_shared/planipret-tasks";

/** Defensive cleanup for tasks already cached by an older mobile release. */
const plainText = (value: unknown): string => String(value ?? "")
  .replace(/<\s*br\s*\/?\s*>/gi, "\n")
  .replace(/<\s*\/\s*(p|div|li|tr|h[1-6])\s*>/gi, "\n")
  .replace(/<[^>]*>/g, " ")
  .replace(/&#x([0-9a-f]+);?/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
  .replace(/&#(\d+);?/g, (_match, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
  .replace(/&nbsp;|&#160;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;|&rsquo;|&lsquo;/gi, "'")
  .replace(/&eacute;/gi, "é")
  .replace(/&egrave;/gi, "è")
  .replace(/&ecirc;/gi, "ê")
  .replace(/&agrave;/gi, "à")
  .replace(/&ocirc;/gi, "ô")
  .replace(/&ccedil;/gi, "ç")
  .replace(/&ndash;|&mdash;/gi, "-")
  .replace(/[ \t]+/g, " ")
  .replace(/\s*\n\s*/g, "\n")
  .trim();

export interface MaestroTaskView {
  statusLabel: string;
  clientName: string;
  filogix: string;
  category: string;
  brokerName: string;
  referrerName: string;
  stageLabel: string;
  createdAt: string | null;
  remarks: string;
}

const pick = (raw: any, keys: string[]): string => {
  for (const k of keys) {
    const v = raw?.[k];
    if (v === null || v === undefined) continue;
    if (typeof v === "object") {
      const nested = v.name ?? v.full_name ?? v.label ?? v.title;
      if (nested) return plainText(nested);
      continue;
    }
    const s = plainText(v);
    if (s) return s;
  }
  return "";
};

const DONE = new Set(["done", "completed", "complete", "closed", "termine", "terminé", "3", "4"]);

export function maestroTaskView(task: NormalizedTask, lang: "fr" | "en"): MaestroTaskView {
  const raw = (task as any)?.raw ?? {};
  const en = lang === "en";
  const closed = DONE.has(String(task.status ?? "").toLowerCase());

  return {
    statusLabel: pick(raw, ["state_label", "workflow_status", "etat"]) || (closed ? (en ? "Completed" : "Complété") : en ? "Pending" : "En attente"),
    clientName: plainText(task.target_name)
      || pick(raw, ["client_name", "contact_name", "customer_name", "user_name"])
      || [pick(raw, ["client_first_name"]), pick(raw, ["client_last_name"])].filter(Boolean).join(" ").trim()
      || plainText(task.notes) || (en ? "Task" : "Tâche"),
    filogix: pick(raw, ["filogix", "filogix_id", "filogix_deal_id", "filogix_number"]),
    category: pick(raw, ["category", "categorie", "category_name", "task_category", "type_label"]),
    brokerName: pick(raw, ["broker_name", "courtier", "courtier_traitant", "agent_name", "assigned_to_name", "owner_name"]),
    referrerName: pick(raw, ["referrer_name", "conseiller", "conseiller_reference", "reference_name", "referral_name", "advisor_name"]),
    stageLabel: pick(raw, ["stage", "stage_label", "status_label", "status_name", "step"]) || plainText(task.notes) || plainText(task.status),
    createdAt: pick(raw, ["created_at", "created", "date_created", "creation_date"]) || null,
    remarks: plainText(task.description) || pick(raw, ["remarks", "remarque", "remarques", "comment", "comments", "note"]),
  };
}

export function formatMaestroCreated(value: string | null, lang: "fr" | "en"): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const formatted = d.toLocaleDateString(lang === "en" ? "en-CA" : "fr-CA", {
    day: "numeric", month: "short", year: "numeric", timeZone: "America/Toronto",
  });
  return `${lang === "en" ? "Created" : "Créer"} ${formatted}`;
}
