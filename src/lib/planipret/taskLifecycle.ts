/**
 * Cycle de vie visible d'une tâche Maestro : créée → confirmée → clôturée.
 *
 * - `created`   : la tâche existe côté app mais Maestro n'a pas encore confirmé
 *                 l'assignation (aucun `users`/`users_id` relu).
 * - `confirmed` : Maestro a relu la tâche avec son identifiant et son assignation.
 * - `closed`    : la tâche est terminée/complétée côté Maestro.
 *
 * Présentation uniquement : aucune écriture, aucune requête.
 */
import type { NormalizedTask } from "@/lib/planipret/shared/planipretTasks";

export type TaskLifecycleStage = "created" | "confirmed" | "closed";

const DONE = new Set(["done", "completed", "complete", "closed", "termine", "terminé", "3", "4"]);

export function taskLifecycleStage(task: NormalizedTask): TaskLifecycleStage {
  // A task id and an assignment returned from a cache, projection, POST or PUT
  // receipt are not proof that Maestro currently stores that state. Only a
  // documented GET read-back may receive the confirmed/closed wording.
  const raw = (task as any)?.raw ?? {};
  const readBack = (task as any)?.maestro_read_back === true
    || raw?.maestro_read_back === true
    || raw?.read_back === true
    || raw?.visible_in_maestro === true;
  if (DONE.has(String(task?.status ?? "").toLowerCase())) return readBack ? "closed" : "created";
  const hasId = Boolean(String(task?.id ?? "").trim());
  const assigned = Array.isArray(task?.assignee_ids) && task.assignee_ids.filter(Boolean).length > 0;
  return hasId && assigned && readBack ? "confirmed" : "created";
}

export interface TaskLifecycleBadge {
  stage: TaskLifecycleStage;
  label: string;
  /** Couleur de texte/point (tokens du thème, clair et sombre). */
  color: string;
  /** Fond discret de la pastille. */
  background: string;
  /** Explication courte, utilisée en title/aria-label. */
  detail: string;
}

export function describeTaskLifecycle(stage: TaskLifecycleStage, lang: "fr" | "en" = "fr"): TaskLifecycleBadge {
  const en = lang === "en";
  if (stage === "closed") {
    return {
      stage,
      label: en ? "Closed" : "Clôturée",
      color: "var(--pp-success, #16A34A)",
      background: "rgba(22,163,74,0.12)",
      detail: en ? "Completed in Maestro" : "Terminée dans Maestro",
    };
  }
  if (stage === "confirmed") {
    return {
      stage,
      label: en ? "Confirmed" : "Confirmée",
      color: "var(--pp-brand-accent, #0023e6)",
      background: "rgba(0,35,230,0.10)",
      detail: en ? "Read back from Maestro with its assignment" : "Relue dans Maestro avec son assignation",
    };
  }
  return {
    stage,
    label: en ? "Created" : "Créée",
    color: "var(--pp-warning, #B45309)",
    background: "rgba(245,158,11,0.14)",
      detail: en ? "Waiting for a Maestro API read-back" : "En attente d’une relecture par l’API Maestro",
  };
}

export function taskLifecycleBadge(task: NormalizedTask, lang: "fr" | "en" = "fr"): TaskLifecycleBadge {
  return describeTaskLifecycle(taskLifecycleStage(task), lang);
}

/** Origine de création lisible : app mobile, AVA, portail ou Maestro. */
export type TaskOrigin = "mobile" | "ava" | "portal" | "maestro";

export function taskOrigin(task: NormalizedTask): TaskOrigin {
  const raw = (task as any)?.raw ?? {};
  const src = String(raw.source ?? raw.created_from ?? raw.origin ?? "").toLowerCase();
  if (task?.created_by_ava || src.includes("ava")) return "ava";
  if (src.includes("mobile") || src.includes("app")) return "mobile";
  if (src.includes("portal") || src.includes("portail") || src.includes("web")) return "portal";
  return "maestro";
}

export function describeTaskOrigin(origin: TaskOrigin, lang: "fr" | "en" = "fr"): string {
  const en = lang === "en";
  switch (origin) {
    case "mobile": return en ? "Mobile app" : "App mobile";
    case "ava": return "AVA";
    case "portal": return en ? "Portal" : "Portail";
    default: return "Maestro";
  }
}

/** Tâches créées depuis l'app mobile (incluant celles créées par AVA en mobilité). */
export function isMobileCreatedTask(task: NormalizedTask): boolean {
  const origin = taskOrigin(task);
  return origin === "mobile" || origin === "ava";
}

/** Date de création remontée par Maestro, si disponible. */
export function taskCreatedAt(task: NormalizedTask): string | null {
  const raw = (task as any)?.raw ?? {};
  for (const key of ["created_at", "created", "date_created", "creation_date", "createdAt"]) {
    const v = raw[key];
    if (v) return String(v);
  }
  return null;
}

export function formatTaskTimestamp(value: string | null | undefined, lang: "fr" | "en" = "fr"): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(lang === "en" ? "en-CA" : "fr-CA", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "America/Toronto",
  });
}
