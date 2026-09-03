// Pure, runtime-agnostic helpers for the Planiprêt Task API.
// Imported by the `planipret-task-api` edge function AND by the mobile app
// (via src/lib/planipret/tasks.ts). Must stay free of Deno/Node globals.
//
// Official routes (https://client.planipret.com/api-docs/openapi.yaml):
//   POST   /api/main/tasks
//   PUT    /api/main/tasks/{taskId}   (task_id also required in body)
//   DELETE /api/main/tasks/{taskId}   (task_id also required in body)
// There is NO documented list endpoint — listing is best-effort server side.

export const TASK_TZ = "America/Toronto";

export type TaskType = "user" | "contract";

export interface NormalizedTask {
  id: string;
  notes: string;
  description: string | null;
  due_at: string | null; // ISO
  status: string | null;
  type: TaskType | null;
  xid: string | null;
  target_name: string | null;
  is_recurring: boolean;
  recurring_pattern: string | null;
  created_by_ava: boolean;
  /** Maestro user ids this task is assigned to (from `users`, `users_id`, …). */
  assignee_ids: string[];
  /** Where the assignment was read from — `none` means Maestro returned nothing. */
  assignment_source: "users" | "users_id" | "xid" | "none";
  /**
   * Calendar (Nylas) synchronisation state. Maestro's calendar only shows
   * tasks that were synchronised with Nylas; the Tasks page shows them all.
   */
  sync_status: TaskSyncStatus;
  /** Machine readable reason explaining `sync_status`. */
  sync_reason: TaskSyncReason;
  raw?: unknown;
}

export type TaskSyncStatus = "synced" | "pending" | "not_synced" | "unknown";
export type TaskSyncReason =
  | "nylas_event_linked"
  | "awaiting_nylas"
  | "calendar_sync_disabled"
  | "assignment_missing"
  | "sync_failed"
  | "not_created_yet"
  | "unknown";

const NYLAS_ID_KEYS = [
  "nylas_id", "nylas_event_id", "nylas_event", "calendar_event_id",
  "event_id", "external_event_id", "nylasEventId",
];

/** Derive the Nylas/calendar sync state of a task from the Maestro payload. */
export function computeTaskSync(raw: any, assigneeIds: string[] = []): { sync_status: TaskSyncStatus; sync_reason: TaskSyncReason } {
  if (!raw || typeof raw !== "object") return { sync_status: "unknown", sync_reason: "unknown" };
  const has = (k: string) => {
    const v = (raw as any)[k];
    return v !== undefined && v !== null && String(v).trim() !== "" && String(v) !== "0";
  };
  if (NYLAS_ID_KEYS.some(has)) return { sync_status: "synced", sync_reason: "nylas_event_linked" };
  const state = String(raw.sync_status ?? raw.nylas_status ?? "").toLowerCase();
  if (state === "synced" || state === "success") return { sync_status: "synced", sync_reason: "nylas_event_linked" };
  if (state === "failed" || state === "error") return { sync_status: "not_synced", sync_reason: "sync_failed" };
  if (!String(raw.id ?? raw.task_id ?? "").trim()) return { sync_status: "not_synced", sync_reason: "not_created_yet" };
  const wantsCalendar = truthy(raw.sync_calendar ?? raw.syncCalendar ?? raw.calendar_sync);
  if (!wantsCalendar) return { sync_status: "not_synced", sync_reason: "calendar_sync_disabled" };
  if (!assigneeIds.length) return { sync_status: "not_synced", sync_reason: "assignment_missing" };
  return { sync_status: "pending", sync_reason: "awaiting_nylas" };
}

/** Human readable explanation of a task sync state. */
export function describeTaskSync(
  status: TaskSyncStatus,
  reason: TaskSyncReason,
  lang: "fr" | "en" = "fr",
): { label: string; detail: string } {
  const en = lang === "en";
  const label = status === "synced"
    ? (en ? "Calendar synced" : "Calendrier synchro")
    : status === "pending"
      ? (en ? "Sync pending" : "Synchro en attente")
      : status === "not_synced"
        ? (en ? "Not synced" : "Non synchronisée")
        : (en ? "Unknown" : "Inconnu");
  const details: Record<TaskSyncReason, [string, string]> = {
    nylas_event_linked: ["Événement Nylas lié — visible dans le calendrier Maestro.", "Nylas event linked — visible in the Maestro calendar."],
    awaiting_nylas: ["En attente de la synchronisation Nylas côté Maestro.", "Waiting for Maestro's Nylas synchronisation."],
    calendar_sync_disabled: ["Synchronisation calendrier non demandée — visible uniquement dans la page Tâches.", "Calendar sync not requested — only visible on the Tasks page."],
    assignment_missing: ["Maestro n'a pas enregistré l'assignation (users vide).", "Maestro did not persist the assignment (users empty)."],
    sync_failed: ["Maestro signale un échec de synchronisation Nylas.", "Maestro reports a failed Nylas synchronisation."],
    not_created_yet: ["Tâche pas encore créée dans Maestro.", "Task not created in Maestro yet."],
    unknown: ["État de synchronisation inconnu.", "Unknown synchronisation state."],
  };
  const d = details[reason] ?? details.unknown;
  return { label, detail: en ? d[1] : d[0] };
}

/** Date/time parts of `date` rendered in America/Toronto. */
export function torontoParts(date: Date): { y: number; m: number; d: number; hh: number; mm: number; ss: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TASK_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) if (part.type !== "literal") p[part.type] = part.value;
  return {
    y: Number(p.year), m: Number(p.month), d: Number(p.day),
    hh: Number(p.hour === "24" ? "00" : p.hour), mm: Number(p.minute), ss: Number(p.second),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Convert any ISO/Date/"YYYY-MM-DD HH:mm:ss" input to the API format in Toronto time. */
export function toApiDateTime(input: string | Date): string | null {
  if (!input) return null;
  if (typeof input === "string") {
    const local = input.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
    // A naive local datetime (no timezone marker) is already Toronto wall-clock.
    if (local) return `${local[1]}-${local[2]}-${local[3]} ${local[4]}:${local[5]}:${local[6] ?? "00"}`;
  }
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  const p = torontoParts(d);
  return `${p.y}-${pad(p.m)}-${pad(p.d)} ${pad(p.hh)}:${pad(p.mm)}:${pad(p.ss)}`;
}

/** Parse an API "YYYY-MM-DD HH:mm:ss" (Toronto wall-clock) into a real instant. */
export function fromApiDateTime(value: unknown): string | null {
  if (!value) return null;
  const s = String(value).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) return new Date(s).toISOString();
  // Resolve the Toronto offset for that wall-clock time.
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  let ts = guess;
  for (let i = 0; i < 2; i++) {
    const p = torontoParts(new Date(ts));
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
    ts += guess - asUtc;
  }
  return new Date(ts).toISOString();
}

export function formatTaskDue(iso: string | null, lang: "fr" | "en" = "fr"): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(lang === "en" ? "en-CA" : "fr-CA", {
    timeZone: TASK_TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
}

export interface CreateInput {
  xid?: unknown;
  target?: unknown;
  type?: unknown;
  target_type?: unknown;
  date?: unknown;
  due_at?: unknown;
  notes?: unknown;
  description?: unknown;
  users_id?: unknown;
  assignee_id?: unknown;
  status?: unknown;
  option?: unknown;
  sync_cal?: unknown;
  sync_calendar?: unknown;
  send_notification?: unknown;
  notification?: unknown;
  is_recurring?: unknown;
  recurrence?: { value?: unknown; pattern?: unknown; on?: unknown } | null;
  recurring_value?: unknown;
  recurring_pattern?: unknown;
  recurring_on?: unknown;
  is_hidden?: unknown;
  update_status?: unknown;
  // Optional notification / scheduling params documented on POST /api/main/tasks
  send_notification_to?: unknown;
  send_notification_client?: unknown;
  send_notification_client_secondary?: unknown;
  send_notification_assistant?: unknown;
  assistant_users_id?: unknown;
  send_notification_from?: unknown;
  notification_users?: unknown;
  scheduled?: unknown;
  scheduled_at?: unknown;
}


export type ValidationResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; error: string; fields: Record<string, string> };

const PATTERNS = new Set(["day", "week", "month", "year"]);

/** Validate + normalize a create payload for POST /api/main/tasks. */
export function buildCreatePayload(input: CreateInput): ValidationResult {
  const fields: Record<string, string> = {};
  const rawXid = input.xid ?? input.target;
  const xid = Number(String(rawXid ?? "").trim());
  if (!rawXid || !Number.isInteger(xid) || xid <= 0) fields.xid = "xid_required_integer";

  const type = String(input.type ?? input.target_type ?? "").trim().toLowerCase();
  if (type !== "user" && type !== "contract") fields.type = "type_must_be_user_or_contract";

  const date = toApiDateTime((input.date ?? input.due_at) as string);
  if (!date) fields.date = "date_required_YYYY-MM-DD_HH:mm:ss";

  const notes = String(input.notes ?? "").trim();
  if (!notes) fields.notes = "notes_required";

  if (Object.keys(fields).length) return { ok: false, error: "validation_failed", fields };

  const payload: Record<string, unknown> = { xid, type, date, notes };

  // Maestro's POST /api/main/tasks rejects (HTTP 500) a body without a
  // description, so always send one — falling back to the note.
  const description = String(input.description ?? "").trim();
  payload.description = description || notes;

  const assignee = input.users_id ?? input.assignee_id;
  if (assignee !== undefined && assignee !== null && String(assignee).trim() !== "") {
    payload.users_id = Number(assignee);
  }
  // The API requires `option` OR `status` (required_without). Default to the
  // "pending" slug so a plain broker task never trips validation.
  if (input.option !== undefined && input.option !== null && String(input.option).trim() !== "") {
    payload.option = input.option;
  } else {
    const status = String(input.status ?? "").trim();
    payload.status = status || "pending";
  }

  // Notifications and calendar sync are OFF unless explicitly enabled by the broker.
  if (input.sync_cal === true || input.sync_calendar === true) payload.sync_cal = 1;
  if (input.send_notification === true || input.notification === true) payload.send_notification = 1;
  if (input.is_hidden === true) payload.is_hidden = 1;
  if (input.update_status === true) payload.update_status = 1;

  // Optional notification / scheduling params (docs: POST /api/main/tasks).
  const intList = (v: unknown): number[] | null => {
    const arr = Array.isArray(v) ? v : v === undefined || v === null || String(v).trim() === "" ? [] : [v];
    const nums = arr.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0);
    return nums.length ? nums : null;
  };
  const posInt = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  const notifyTo = intList(input.send_notification_to);
  if (notifyTo) payload.send_notification_to = notifyTo;
  if (input.send_notification_client === true) payload.send_notification_client = 1;
  if (input.send_notification_client_secondary === true) payload.send_notification_client_secondary = 1;
  if (input.send_notification_assistant === true) payload.send_notification_assistant = 1;
  const assistantId = posInt(input.assistant_users_id);
  if (assistantId) payload.assistant_users_id = assistantId;
  const notifyFrom = posInt(input.send_notification_from);
  if (notifyFrom) payload.send_notification_from = notifyFrom;
  const notifUsers = intList(input.notification_users);
  if (notifUsers) payload.notification_users = notifUsers;
  if (input.scheduled === true) {
    const at = toApiDateTime(input.scheduled_at as string);
    if (!at) return { ok: false, error: "validation_failed", fields: { scheduled_at: "date_required_YYYY-MM-DD_HH:mm:ss" } };
    payload.scheduled = 1;
    payload.scheduled_at = at;
  }
  // The API requires notification_users when the client notification is on.
  if (payload.send_notification_client === 1 && !payload.notification_users) {
    return { ok: false, error: "validation_failed", fields: { notification_users: "required_when_send_notification_client" } };
  }


  const rec = input.recurrence ?? null;
  const recValue = input.recurring_value ?? rec?.value;
  const recPattern = String(input.recurring_pattern ?? rec?.pattern ?? "").trim().toLowerCase();
  const wantsRecurring = input.is_recurring === true || (!!recPattern && recValue != null);
  if (wantsRecurring) {
    if (!PATTERNS.has(recPattern)) {
      return { ok: false, error: "validation_failed", fields: { recurring_pattern: "pattern_must_be_day_week_month_year" } };
    }
    payload.is_recurring = 1;
    payload.recurring_value = Number(recValue ?? 1);
    payload.recurring_pattern = recPattern;
    // `recurring_on` is an array of weekday numbers (0=Sunday … 6=Saturday).
    const rawOn = input.recurring_on ?? rec?.on;
    const list = Array.isArray(rawOn)
      ? rawOn
      : rawOn !== undefined && rawOn !== null && String(rawOn).trim() !== "" ? [rawOn] : [];
    if (list.length) {
      const days = list.map((d) => Number(d));
      if (days.some((n) => !Number.isInteger(n) || n < 0 || n > 6)) {
        return { ok: false, error: "validation_failed", fields: { recurring_on: "must_be_0_to_6" } };
      }
      payload.recurring_on = days;
    } else if (recPattern === "week") {
      const ref = new Date(String(date).replace(" ", "T"));
      payload.recurring_on = [Number.isNaN(ref.getTime()) ? 1 : ref.getDay()];
    }

  }
  return { ok: true, payload };
}

const UPDATABLE = new Set([
  "date", "notes", "description", "status_option_id", "update_status",
  "is_recurring", "recurring_value", "recurring_pattern", "next_send_date", "recurring_on", "users_id",
]);

/** Body for PUT /api/main/tasks/{taskId} — task_id + only the changed fields. */
export function buildUpdateBody(taskId: string | number, changes: Record<string, unknown>): ValidationResult {
  const id = String(taskId ?? "").trim();
  if (!id) return { ok: false, error: "validation_failed", fields: { task_id: "task_id_required" } };
  const body: Record<string, unknown> = { task_id: Number.isNaN(Number(id)) ? id : Number(id) };
  const src: Record<string, unknown> = { ...(changes ?? {}) };
  if (src.due_at && !src.date) src.date = src.due_at;
  for (const [k, v] of Object.entries(src)) {
    if (!UPDATABLE.has(k) || v === undefined || v === null) continue;
    if (k === "date" || k === "next_send_date") {
      const d = toApiDateTime(v as string);
      if (!d) return { ok: false, error: "validation_failed", fields: { [k]: "invalid_datetime" } };
      body[k] = d;
      continue;
    }
    if (k === "recurring_pattern" && !PATTERNS.has(String(v).toLowerCase())) {
      return { ok: false, error: "validation_failed", fields: { recurring_pattern: "pattern_must_be_day_week_month_year" } };
    }
    if (k === "users_id") {
      const assignee = Number(v);
      if (!Number.isInteger(assignee) || assignee <= 0) {
        return { ok: false, error: "validation_failed", fields: { users_id: "users_id_required_integer" } };
      }
      body.users_id = assignee;
      continue;
    }
    if (k === "is_recurring" || k === "update_status") { body[k] = v === true || v === 1 || v === "1" ? 1 : 0; continue; }
    body[k] = v;
  }
  if (Object.keys(body).length < 2) {
    return { ok: false, error: "validation_failed", fields: { changes: "no_updatable_field" } };
  }
  return { ok: true, payload: body };
}

/** Roles allowed to delete a task (assistant is explicitly excluded). */
export function canDeleteTask(role: unknown): boolean {
  const r = String(role ?? "").trim().toLowerCase();
  return r === "admin" || r === "broker" || r === "advisor" || r === "conseiller" || r === "courtier";
}

/** Deterministic idempotency key — same inputs always yield the same key. */
export function idempotencyKey(parts: Array<string | number | null | undefined>): string {
  const s = parts.map((p) => String(p ?? "")).join("|");
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 + c, 2654435761) >>> 0;
  }
  return `pt_${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

const truthy = (v: unknown) => v === true || v === 1 || v === "1" || v === "true";

/**
 * Maestro returns the assignment in several shapes and sometimes returns an
 * EMPTY `users: []` right after a create even though `users_id` was accepted.
 * Read every known source so the app never loses the assignment.
 */
export function readAssignment(raw: any): { ids: string[]; source: "users" | "users_id" | "xid" | "none" } {
  const clean = (v: unknown) =>
    (Array.isArray(v) ? v : v === undefined || v === null || String(v).trim() === "" ? [] : [v])
      .map((u: any) => String(u?.id ?? u?.users_id ?? u?.user_id ?? u ?? "").trim())
      .filter((x) => x && x !== "null" && x !== "undefined");

  const fromUsers = clean(raw?.users);
  if (fromUsers.length) return { ids: fromUsers, source: "users" };
  const fromUsersId = clean(raw?.users_id ?? raw?.delegate_users_id ?? raw?.assignee_id ?? raw?.assigned_to ?? raw?.user_id);
  if (fromUsersId.length) return { ids: fromUsersId, source: "users_id" };
  // Last resort: a `user` task implicitly belongs to its target.
  const type = String(raw?.type ?? raw?.task_type ?? "").toLowerCase();
  const xid = clean(raw?.xid);
  if (type === "user" && xid.length) return { ids: xid, source: "xid" };
  return { ids: [], source: "none" };
}

export function normalizeTask(input: any): NormalizedTask {
  // Re-normalizing an already normalized task must not nest `raw` inside `raw`.
  const raw = input && typeof input === "object" && input.raw && typeof input.raw === "object"
    ? { ...input.raw, ...input, raw: undefined }
    : input;
  // Maestro's Task List API identifies rows as `referral_option_id`, while
  // mutation/readback responses use `id` or `task_id`.
  const id = String(raw?.id ?? raw?.task_id ?? raw?.referral_option_id ?? "");
  const typeRaw = String(raw?.type ?? raw?.task_type ?? "").toLowerCase();
  const assignment = readAssignment(raw);

  return {
    id,
    notes: String(raw?.notes ?? raw?.title ?? raw?.subject ?? "").trim(),
    description: raw?.description ? String(raw.description) : null,
    due_at: fromApiDateTime(raw?.date ?? raw?.due_date ?? raw?.due_at ?? raw?.scheduled_at ?? null),
    status: raw?.status != null ? String(raw.status) : (raw?.status_option_id != null ? String(raw.status_option_id) : null),
    type: typeRaw === "user" || typeRaw === "contract" ? (typeRaw as TaskType) : null,
    xid: raw?.xid != null ? String(raw.xid) : null,
    target_name: raw?.client_name ?? raw?.contact_name ?? raw?.user_name ?? raw?.target_name
      ?? ([raw?.client_first_name, raw?.client_last_name].filter(Boolean).join(" ").trim() || null),
    is_recurring: truthy(raw?.is_recurring),
    recurring_pattern: raw?.recurring_pattern ? String(raw.recurring_pattern) : null,
    created_by_ava: truthy(raw?.created_by_ava) || String(raw?.source ?? "").toLowerCase().includes("ava"),
    assignee_ids: assignment.ids,
    assignment_source: assignment.source,
    ...computeTaskSync(raw, assignment.ids),
    raw,
  };
}

const DONE = new Set(["done", "completed", "complete", "closed", "termine", "terminé", "3", "4"]);
export function isTaskOpen(task: NormalizedTask): boolean {
  return !DONE.has(String(task.status ?? "").toLowerCase());
}

export interface TaskBuckets { overdue: NormalizedTask[]; today: NormalizedTask[]; upcoming: NormalizedTask[] }

/** Split tasks into overdue / today / upcoming using Toronto calendar days. */
export function bucketTasks(tasks: NormalizedTask[], now: Date = new Date()): TaskBuckets {
  const buckets: TaskBuckets = { overdue: [], today: [], upcoming: [] };
  const n = torontoParts(now);
  const todayKey = `${n.y}${pad(n.m)}${pad(n.d)}`;
  for (const t of tasks) {
    if (!isTaskOpen(t)) continue;
    if (!t.due_at) { buckets.upcoming.push(t); continue; }
    const d = new Date(t.due_at);
    const p = torontoParts(d);
    const key = `${p.y}${pad(p.m)}${pad(p.d)}`;
    if (key < todayKey) buckets.overdue.push(t);
    else if (key === todayKey) (d.getTime() < now.getTime() ? buckets.overdue : buckets.today).push(t);
    else buckets.upcoming.push(t);
  }
  const bydue = (a: NormalizedTask, b: NormalizedTask) => (a.due_at ?? "9").localeCompare(b.due_at ?? "9");
  buckets.overdue.sort(bydue); buckets.today.sort(bydue); buckets.upcoming.sort(bydue);
  return buckets;
}

/** Map an upstream HTTP status to a structured, AVA/UI readable error. */
export function mapTaskApiError(status: number, details?: unknown) {
  const base = { success: false as const, status, details };
  if (status === 401) return { ...base, error: "planipret_unauthorized", message: "Session Planiprêt expirée — reconnecte ton compte Maestro." };
  if (status === 403) return { ...base, error: "forbidden", message: "Action non autorisée pour ton rôle." };
  if (status === 422) return { ...base, error: "validation_failed", message: "Données de tâche invalides." };
  if (status === 404 || status === 405 || status === 501) return { ...base, error: "tasks_unavailable", message: "L'API de tâches Planiprêt n'expose pas cette opération." };
  if (status === 408 || status === 504) return { ...base, error: "timeout", message: "L'API Planiprêt n'a pas répondu à temps." };
  if (status >= 500) return { ...base, error: "upstream_error", message: "Erreur serveur Planiprêt — réessaie dans un instant." };
  return { ...base, error: "request_failed", message: "La requête vers Planiprêt a échoué." };
}

// ── Filtering & pagination ────────────────────────────────────────────────
export type TaskFilter = "overdue" | "today" | "upcoming" | "open" | "all";

export const TASK_FILTERS: TaskFilter[] = ["overdue", "today", "upcoming", "open", "all"];

export function normalizeFilter(value: unknown): TaskFilter {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "retard" || v === "late" || v === "overdue") return "overdue";
  if (v === "today" || v === "aujourdhui" || v === "aujourd'hui") return "today";
  if (v === "upcoming" || v === "a_venir" || v === "à venir" || v === "avenir") return "upcoming";
  if (v === "all") return "all";
  return "open";
}

/** Apply an overdue/today/upcoming filter, using the same Toronto buckets. */
export function filterTasks(tasks: NormalizedTask[], filter: TaskFilter = "open", now: Date = new Date()): NormalizedTask[] {
  if (filter === "all") return [...tasks].sort((a, b) => (a.due_at ?? "9").localeCompare(b.due_at ?? "9"));
  const b = bucketTasks(tasks, now);
  if (filter === "overdue") return b.overdue;
  if (filter === "today") return b.today;
  if (filter === "upcoming") return b.upcoming;
  return [...b.overdue, ...b.today, ...b.upcoming];
}

export interface Page<T> { items: T[]; page: number; limit: number; total: number; has_more: boolean }

export function paginate<T>(items: T[], page = 1, limit = 20): Page<T> {
  const size = Math.min(Math.max(Number(limit) || 20, 1), 200);
  const p = Math.max(Number(page) || 1, 1);
  const start = (p - 1) * size;
  const slice = items.slice(start, start + size);
  return { items: slice, page: p, limit: size, total: items.length, has_more: start + slice.length < items.length };
}

/** Counts per bucket — cheap enough to always return alongside a page. */
export function taskCounts(tasks: NormalizedTask[], now: Date = new Date()) {
  const b = bucketTasks(tasks, now);
  return { overdue: b.overdue.length, today: b.today.length, upcoming: b.upcoming.length, open: b.overdue.length + b.today.length + b.upcoming.length, all: tasks.length };
}


/**
 * Calendar/list filter aligned on the real assignment source. A task counts as
 * "mine" when any known assignment field matches — and, when Maestro returns
 * NO assignment at all (`users: []`), we fall back to the task target so the
 * task is never hidden from the broker who owns it.
 */
export function isAssignedTo(task: NormalizedTask, ids: Array<string | number | null | undefined>): boolean {
  const mine = new Set(ids.map((v) => String(v ?? "").trim()).filter(Boolean));
  if (!mine.size) return true;
  if (task.assignee_ids.some((a) => mine.has(a))) return true;
  // Maestro gave us no explicit assignment (`users: []`) — never hide the task.
  if (task.assignment_source === "none" || task.assignment_source === "xid") return true;
  return false;
}

export function filterByAssignee(tasks: NormalizedTask[], ids: Array<string | number | null | undefined>): NormalizedTask[] {
  return tasks.filter((t) => isAssignedTo(t, ids));
}

export interface TaskDiagnostic {
  code: "assignment_not_persisted" | "due_at_shifted";
  message: string;
  expected: string | null;
  actual: string | null;
}

/**
 * Compare what we sent to Maestro with what Maestro returned, so the app can
 * tell the broker immediately what to report (empty `users`, shifted `due_at`).
 */
export function diagnoseTaskResponse(args: {
  sentDate?: unknown;          // "YYYY-MM-DD HH:mm:ss" Toronto wall-clock
  sentAssignee?: unknown;      // users_id we sent
  task: NormalizedTask;
}): { ok: boolean; issues: TaskDiagnostic[] } {
  const issues: TaskDiagnostic[] = [];
  const expectedAssignee = String(args.sentAssignee ?? "").trim();
  const rawTask: any = args.task.raw ?? args.task;
  // Only judge the assignment when Maestro actually returned a `users` array —
  // otherwise we cannot tell "not persisted" from "not echoed".
  if (expectedAssignee && Array.isArray(rawTask?.users)) {
    const persisted = readAssignment(rawTask);
    if (persisted.source !== "users" || !persisted.ids.includes(expectedAssignee)) {
      issues.push({
        code: "assignment_not_persisted",
        message: `Maestro n'a pas enregistré l'assignation (users vide) pour l'utilisateur ${expectedAssignee}.`,
        expected: expectedAssignee,
        actual: persisted.ids.length ? persisted.ids.join(",") : "[]",
      });
    }
  }
  const sent = args.sentDate ? String(args.sentDate) : "";
  if (sent) {
    const expected = fromApiDateTime(sent);
    const actual = args.task.due_at;
    if (expected && actual && Math.abs(new Date(expected).getTime() - new Date(actual).getTime()) > 60_000) {
      issues.push({
        code: "due_at_shifted",
        message: `L'échéance renvoyée par Maestro ne correspond pas à la date demandée (${sent} America/Toronto).`,
        expected,
        actual,
      });
    }
  }
  return { ok: issues.length === 0, issues };
}

/**
 * Maestro rule: a task can only be assigned to yourself, unless the account is
 * set up with team assistants allowed to work under your Maestro profile.
 * Guard applied BEFORE any POST/PUT so we never push an unauthorized users_id.
 */
export function assertAssigneeAllowed(
  assignee: unknown,
  allowed: Array<string | number | null | undefined>,
): { ok: true } | { ok: false; error: string; message: string; fields: Record<string, string>; allowed: string[] } {
  const want = String(assignee ?? "").trim();
  const list = [...new Set(allowed.map((a) => String(a ?? "").trim()).filter(Boolean))];
  if (!want) return { ok: true };
  if (list.includes(want)) return { ok: true };
  return {
    ok: false,
    error: "assignee_not_allowed",
    message:
      "Assignation refusée : dans Maestro, une tâche ne peut être assignée qu'à vous-même ou à un(e) adjoint(e) autorisé(e) sous votre profil. Demandez à Tania d'ajouter cet utilisateur comme adjoint(e) d'équipe.",
    fields: { users_id: "assignee_not_allowed" },
    allowed: list,
  };
}
