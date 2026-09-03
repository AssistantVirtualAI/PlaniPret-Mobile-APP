// Mobile-side task helpers. Pure logic lives in the shared module used by the
// edge function so the client and the server never disagree on formatting.
export * from "@/lib/planipret/shared/planipretTasks";

import { invokeEdge } from "@/lib/planipret/edgeAuth";
import type { NormalizedTask, TaskBuckets } from "@/lib/planipret/shared/planipretTasks";

export type TaskSource = "api" | "projection" | "unavailable";

export type TaskFilterValue = "overdue" | "today" | "upcoming" | "open" | "all";

export interface TaskListResult {
  success: boolean;
  source: TaskSource;
  tasks: NormalizedTask[];
  buckets: TaskBuckets;
  overdue_count: number;
  counts: { overdue: number; today: number; upcoming: number; open: number; all: number };
  filter: TaskFilterValue;
  page: number;
  limit: number;
  total: number;
  has_more: boolean;
  error?: string;
  message?: string;
}

async function invoke(body: Record<string, unknown>): Promise<any> {
  // Shared auth guard: skips the call when there is no valid session and asks
  // the shell to send the user back to login on 401.
  const { data, error, unauthorized } = await invokeEdge("planipret-task-api", body);
  if (unauthorized) {
    return { success: false, source: "unavailable", error: "unauthenticated", message: "Session expirée — reconnectez-vous." };
  }
  if (error) return { success: false, error: "network_error", message: error.message };
  return data ?? { success: false, error: "empty_response" };
}

export interface ListTaskOptions {
  status?: string;
  from?: string;
  to?: string;
  /** retard / aujourd'hui / à venir */
  filter?: TaskFilterValue;
  page?: number;
  limit?: number;
  /** Admin only: inspect another broker's Maestro tasks. */
  broker_id?: string | null;
}

export interface TaskHistoryEvent {
  id: string;
  action: string;
  created_at: string;
  user_id: string | null;
  metadata: Record<string, unknown> | null;
}

/** Audit trail (created / updated / deleted / denied) for one Maestro task. */
export async function taskHistory(task_id: string): Promise<TaskHistoryEvent[]> {
  const d = await invoke({ action: "history", task_id });
  return Array.isArray(d?.events) ? (d.events as TaskHistoryEvent[]) : [];
}

export async function listTasks(opts: ListTaskOptions = {}): Promise<TaskListResult> {
  const { broker_id, ...rest } = opts;
  const d = await invoke({ action: "list", ...rest, ...(broker_id ? { broker_id } : {}) });
  const tasks = Array.isArray(d?.tasks) ? d.tasks : [];
  return {
    success: !!d?.success,
    source: (d?.source ?? "unavailable") as TaskSource,
    tasks,
    buckets: d?.buckets ?? { overdue: [], today: [], upcoming: [] },
    overdue_count: d?.overdue_count ?? 0,
    counts: d?.counts ?? { overdue: 0, today: 0, upcoming: 0, open: tasks.length, all: tasks.length },
    filter: (d?.filter ?? opts.filter ?? "open") as TaskFilterValue,
    page: d?.page ?? opts.page ?? 1,
    limit: d?.limit ?? opts.limit ?? 20,
    total: d?.total ?? tasks.length,
    has_more: !!d?.has_more,
    error: d?.error,
    message: d?.message,
  };
}

export const getTask = (task_id: string) => invoke({ action: "get", task_id });

/**
 * Raw upstream read used to troubleshoot visibility: what Maestro really
 * stores for a task (assignment source, due date, calendar visibility).
 */
export const diagnoseTasks = (task_id?: string) =>
  invoke({ action: "diagnose", ...(task_id ? { task_id } : {}) });

export interface TaskDiagnostics {
  ok: boolean;
  issues: Array<{ code: "assignment_not_persisted" | "due_at_shifted"; message: string; expected: string | null; actual: string | null }>;
  assignment_repair: "not_needed" | "repaired" | "failed" | "skipped";
  expected_assignee: string | null;
  returned_assignees: string[];
  assignment_source: string;
  sent_date_toronto: string | null;
  returned_due_at_utc: string | null;
}

/** Human-readable banner text for a create response with diagnostics. */
export function describeTaskDiagnostics(d: TaskDiagnostics | undefined | null, lang: "fr" | "en" = "fr"): string | null {
  if (!d || d.ok) return null;
  const parts = d.issues.map((i) =>
    i.code === "assignment_not_persisted"
      ? (lang === "en"
          ? `Maestro did not persist the assignment (users empty, expected ${i.expected})`
          : `Maestro n'a pas enregistré l'assignation (users vide, attendu ${i.expected})`)
      : (lang === "en"
          ? `Due date mismatch: sent ${d.sent_date_toronto} (Toronto), Maestro returned ${i.actual}`
          : `Échéance différente : envoyé ${d.sent_date_toronto} (Toronto), Maestro renvoie ${i.actual}`));
  if (d.assignment_repair === "repaired") {
    parts.push(lang === "en" ? "auto-repaired via PUT" : "réparé automatiquement via PUT");
  } else if (d.assignment_repair === "failed") {
    parts.push(lang === "en" ? "auto-repair failed — report to Maestro" : "réparation auto échouée — à remonter à Maestro");
  }
  return parts.join(" · ");
}

export interface ClientTaskTarget {
  client_id: string;
  name: string;
  email: string | null;
  user: { id: string; eligible_broker_ids: string[] } | null;
  contracts: Array<{ id: string; number: string | null }>;
}

/**
 * Valid task targets from the Maestro Client List API (`task_targets`).
 * A task only shows up on the Maestro Tasks page when it uses one of these.
 */
export async function listClientTargets(search?: string): Promise<ClientTaskTarget[]> {
  const d = await invoke({ action: "client_targets", ...(search ? { search } : {}) });
  return Array.isArray((d as any)?.targets) ? ((d as any).targets as ClientTaskTarget[]) : [];
}

export interface TargetValidationResult {
  ok: boolean;
  type: "user" | "contract";
  xid: string;
  error?: "xid_out_of_scope" | "target_mapping_required" | "validation_failed";
  message?: string;
  reason?: string;
  available?: { users: string[]; contracts: string[] };
  targets_source?: "clients_api" | "unavailable";
  matched?: { client_id: string; name: string } | null;
}

/** Dry-run target check: detailed errors without creating anything. */
export async function validateTaskTarget(
  type: "user" | "contract",
  xid: string,
): Promise<{ valid: boolean; validation: TargetValidationResult; own_ids: string[] }> {
  const d = await invoke({ action: "validate_target", type, xid }) as any;
  return {
    valid: !!d?.valid,
    validation: (d?.validation ?? { ok: false, type, xid, error: "validation_failed" }) as TargetValidationResult,
    own_ids: Array.isArray(d?.own_ids) ? d.own_ids : [],
  };
}

export const createTask = (input: Record<string, unknown>) =>
  invoke({ action: "create", ...input });

export const updateTask = (task_id: string, changes: Record<string, unknown>, idempotency_key?: string) =>
  invoke({ action: "update", task_id, changes, idempotency_key });

export const deleteTask = (task_id: string, idempotency_key?: string) =>
  invoke({ action: "delete", task_id, idempotency_key });

/** Local per-user cache so the home screen paints instantly. */
const cacheKey = (userId: string) => `pp_tasks_cache_${userId}`;

export function loadTaskCache(userId: string): NormalizedTask[] {
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.tasks) ? parsed.tasks : [];
  } catch { return []; }
}

export function saveTaskCache(userId: string, tasks: NormalizedTask[]) {
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify({ tasks, at: Date.now() }));
  } catch { /* quota */ }
}

export function clearTaskCache(userId: string) {
  try { localStorage.removeItem(cacheKey(userId)); } catch { /* noop */ }
}

/** ISO timestamp -> `YYYY-MM-DDTHH:mm` wall clock in America/Toronto (for <input type="datetime-local">). */
export function toTorontoLocalInput(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d).reduce<Record<string, string>>((a, x) => { a[x.type] = x.value; return a; }, {});
  return `${p.year}-${p.month}-${p.day}T${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
}

// ── Maestro visibility ─────────────────────────────────────────────────────
export interface TaskVerifyResult {
  success: boolean;
  task_id?: string;
  created?: boolean;
  read_back?: boolean;
  visible_in_maestro?: boolean;
  source?: TaskSource;
  endpoint?: string | null;
  maestro_task_url?: string | null;
  message?: string;
}

/** Ask the gateway whether a task exists upstream and is visible for me. */
export const verifyTask = (task_id: string): Promise<TaskVerifyResult> =>
  invoke({ action: "verify", task_id });

/** Deep link to the task inside Maestro. */
export function maestroTaskUrl(taskId: string | number): string {
  return `https://client.planipret.com/main/tasks?task_id=${encodeURIComponent(String(taskId))}`;
}
