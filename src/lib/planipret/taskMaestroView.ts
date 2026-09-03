/**
 * Maps a normalized task to the exact columns Maestro shows on its Tasks page:
 * statut · client · Filogix / Catégorie · Courtier traitant / Conseiller réf.
 * · étape + date de création · remarques.
 *
 * Presentation only: everything is read from the Maestro payload (`raw`) with
 * tolerant fallbacks, so a missing field renders as "-" like in Maestro.
 */
import type { NormalizedTask } from "@/lib/planipret/shared/planipretTasks";

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
      if (nested) return String(nested).trim();
      continue;
    }
    const s = String(v).trim();
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
    clientName: task.target_name
      || pick(raw, ["client_name", "contact_name", "customer_name", "user_name"])
      || [pick(raw, ["client_first_name"]), pick(raw, ["client_last_name"])].filter(Boolean).join(" ").trim()
      || task.notes || (en ? "Task" : "Tâche"),
    filogix: pick(raw, ["filogix", "filogix_id", "filogix_deal_id", "filogix_number"]),
    category: pick(raw, ["category", "categorie", "category_name", "task_category", "type_label"]),
    brokerName: pick(raw, ["broker_name", "courtier", "courtier_traitant", "agent_name", "assigned_to_name", "owner_name"]),
    referrerName: pick(raw, ["referrer_name", "conseiller", "conseiller_reference", "reference_name", "referral_name", "advisor_name"]),
    stageLabel: pick(raw, ["stage", "stage_label", "status_label", "status_name", "step"]) || task.notes || String(task.status ?? ""),
    createdAt: pick(raw, ["created_at", "created", "date_created", "creation_date"]) || null,
    remarks: task.description || pick(raw, ["remarks", "remarque", "remarques", "comment", "comments", "note"]),
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
