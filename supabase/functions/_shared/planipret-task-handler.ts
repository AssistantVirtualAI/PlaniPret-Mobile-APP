// Runtime-agnostic core of the Planiprêt Task API gateway.
// All I/O is injected (`TaskDeps`) so the exact same logic runs in the edge
// function AND under Vitest. No Deno / Node globals allowed in this file.
//
// Routes consumed (official docs: https://client.planipret.com/api-docs):
//   POST   /api/main/tasks
//   PUT    /api/main/tasks/{taskId}    (task_id also in body)
//   DELETE /api/main/tasks/{taskId}    (task_id also in body, soft delete)
// Listing is NOT officially documented — see `listFetch` in TaskDeps.
import {
  bucketTasks,
  buildCreatePayload,
  buildUpdateBody,
  assertAssigneeAllowed,
  canDeleteTask,
  filterTasks,
  idempotencyKey,
  mapTaskApiError,
  diagnoseTaskResponse,
  filterByAssignee,
  normalizeFilter,
  normalizeTask,
  readAssignment,
  paginate,
  taskCounts,
} from "./planipret-tasks.ts";

export interface ApiResponse { status: number; ok: boolean; data: any }

export interface UpstreamList {
  ok: boolean;
  tasks: any[];
  endpoint: string | null;
  status: number;
}

export interface TaskDeps {
  admin: any;
  userId: string;
  profile: any;
  token: string | null;
  /** Authenticated call to the official Planiprêt API (`/api/main/...`). */
  apiFetch: (path: string, init: { method: string; body?: string }) => Promise<ApiResponse>;
  /** Best-effort listing (undocumented upstream). */
  listFetch: (
    telecomId: string,
    opts: { status?: string | null; from?: string | null; to?: string | null },
  ) => Promise<UpstreamList>;
  /** Best-effort single-task read (undocumented upstream). */
  singleFetch?: (
    taskId: string,
    telecomId: string | null,
  ) => Promise<{ ok: boolean; task: any | null; endpoint: string | null; status: number }>;

  /**
   * Client List API (`GET /users/{telecomId}/clients`). Each row may carry a
   * `task_targets` object describing the ONLY valid task targets:
   *   task_targets.user      → { id, eligible_broker_ids[] }  (type: "user")
   *   task_targets.contracts → [{ id, number }]               (type: "contract")
   */
  clientTargetsFetch?: (
    telecomId: string | null,
    search?: string | null,
  ) => Promise<any[]>;

  resolveTelecomUserId: (candidate: string | null) => Promise<string | null>;
  /** Resolve the numeric internal Maestro user id accepted by `users_id`. */
  resolveTaskAssigneeId?: () => Promise<string | null>;
  /** Ids this broker may assign a task to: self + authorized team assistants. */
  listAllowedAssignees?: () => Promise<string[]>;
  now?: () => Date;
}

export function newCorrelationId() {
  return `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function audit(admin: any, row: Record<string, unknown>) {
  try {
    await admin.from("planipret_audit_log").insert({
      action: String(row.action ?? "task"),
      resource_type: "planipret_task",
      resource_id: row.task_id ? String(row.task_id) : null,
      user_id: (row.user_id as string) ?? null,
      // Never log full task notes — only structural metadata.
      metadata: {
        tool: row.tool ?? null,
        source: row.source ?? "app",
        session_id: row.session_id ?? null,
        status: row.status ?? null,
        result: row.result ?? null,
        correlation_id: row.correlation_id ?? null,
      },
    });
  } catch (_) { /* audit must never break the request */ }
}

/** Replay protection: the same idempotency key always returns the first result. */
export async function withIdempotency(
  admin: any,
  userId: string,
  key: string,
  action: string,
  run: () => Promise<{ status: number; body: Record<string, unknown> }>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { data: existing } = await admin
    .from("planipret_task_mutations")
    .select("response, http_status")
    .eq("user_id", userId)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (existing?.response) {
    return { status: existing.http_status ?? 200, body: { ...(existing.response as any), replayed: true } };
  }
  const ins = await admin.from("planipret_task_mutations")
    .insert({ user_id: userId, idempotency_key: key, action, http_status: null, response: null });
  if (ins?.error) {
    // Concurrent double-tap: the winner is already running/finished.
    const { data: row } = await admin
      .from("planipret_task_mutations")
      .select("response, http_status")
      .eq("user_id", userId).eq("idempotency_key", key).maybeSingle();
    if (row?.response) return { status: row.http_status ?? 200, body: { ...(row.response as any), replayed: true } };
    return { status: 200, body: { success: true, in_flight: true, replayed: true } };
  }
  const out = await run();
  await admin.from("planipret_task_mutations")
    .update({ response: out.body, http_status: out.status, completed_at: new Date().toISOString() })
    .eq("user_id", userId).eq("idempotency_key", key);
  return out;
}

async function projectionUpsert(admin: any, userId: string, tasks: any[]) {
  if (!tasks.length) return;
  const rows = tasks.map((t) => ({
    user_id: userId,
    task_id: String(t.id),
    due_at: t.due_at,
    status: t.status,
    payload: t,
    updated_at: new Date().toISOString(),
  }));
  await admin.from("planipret_tasks_projection").upsert(rows, { onConflict: "user_id,task_id" });
}

async function loadProjection(admin: any, userId: string) {
  const { data } = await admin
    .from("planipret_tasks_projection")
    .select("payload")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("due_at", { ascending: true })
    .limit(200);
  return (data ?? []).map((r: any) => normalizeTask(r.payload));
}

/**
 * Full mirror of the upstream list into the projection. On an unfiltered sync
 * we also soft-delete rows the API no longer returns, so the projection stays
 * a faithful (offline-only) copy of the single source of truth.
 */
async function syncProjection(admin: any, userId: string, tasks: any[], opts: { full: boolean }) {
  await projectionUpsert(admin, userId, tasks);
  if (!opts.full) return;
  const keep = tasks.map((t) => String(t.id)).filter(Boolean);
  let q = admin.from("planipret_tasks_projection")
    .update({ deleted_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("deleted_at", null);
  if (keep.length) q = q.not("task_id", "in", `(${keep.map((k) => `"${k}"`).join(",")})`);
  await q;
}

/**
 * A `contract` task may only target a contract that is officially mapped to
 * this broker (pipeline entry, synced Maestro contact, or an existing task).
 */
async function contractIsMapped(admin: any, userId: string, xid: string): Promise<boolean> {
  if (!xid) return false;
  try {
    const { data: pipe } = await admin.from("planipret_pipeline")
      .select("id").eq("user_id", userId).eq("maestro_contact_id", xid).limit(1);
    if (pipe?.length) return true;
  } catch { /* ignore */ }
  try {
    const { data: contact } = await admin.from("planipret_contacts")
      .select("id").eq("user_id", userId).eq("external_id", xid).limit(1);
    if (contact?.length) return true;
  } catch { /* ignore */ }
  try {
    const { data: known } = await admin.from("planipret_tasks_projection")
      .select("payload").eq("user_id", userId).is("deleted_at", null).limit(200);
    return (known ?? []).some((r: any) => String(r?.payload?.xid ?? "") === xid);
  } catch { /* ignore */ }
  return false;
}

export interface ClientTarget {
  client_id: string;
  name: string;
  email: string | null;
  /** `type: "user"` target (task shows on the client's Maestro Tasks page). */
  user: { id: string; eligible_broker_ids: string[] } | null;
  /** `type: "contract"` targets. */
  contracts: Array<{ id: string; number: string | null }>;
}

const clientLabel = (c: any): string =>
  String(
    c?.display_name || c?.name ||
    [c?.first_name, c?.last_name].filter(Boolean).join(" ") ||
    c?.email || `#${c?.id ?? ""}`,
  ).trim();

/** Read the `task_targets` metadata exposed by the Client List API. */
export function normalizeClientTarget(row: any): ClientTarget | null {
  if (!row || typeof row !== "object") return null;
  const tt = row.task_targets ?? row.taskTargets ?? null;
  const userRaw = tt?.user ?? null;
  const contractsRaw = Array.isArray(tt?.contracts) ? tt.contracts : [];
  const user = userRaw?.id
    ? {
        id: String(userRaw.id),
        eligible_broker_ids: (Array.isArray(userRaw.eligible_broker_ids) ? userRaw.eligible_broker_ids : [])
          .map((v: any) => String(v)).filter(Boolean),
      }
    : null;
  const contracts = contractsRaw
    .filter((c: any) => c?.id !== undefined && c?.id !== null)
    .map((c: any) => ({ id: String(c.id), number: c?.number != null ? String(c.number) : null }));
  if (!user && !contracts.length) return null;
  return {
    client_id: String(row.id ?? user?.id ?? ""),
    name: clientLabel(row),
    email: row.email ? String(row.email) : null,
    user,
    contracts,
  };
}

/** All task targets this broker may legitimately use, from the Client List API. */
async function loadClientTargets(deps: any, profile: any, search?: string | null): Promise<ClientTarget[]> {
  if (!deps.clientTargetsFetch) return [];
  let telecomId: string | null = null;
  try {
    telecomId = await deps.resolveTelecomUserId(profile?.maestro_broker_id ? String(profile.maestro_broker_id) : null);
  } catch { /* ignore */ }
  const rows = await deps.clientTargetsFetch(telecomId, search ?? null).catch(() => []);
  return (Array.isArray(rows) ? rows : []).map(normalizeClientTarget).filter(Boolean) as ClientTarget[];
}

/** Is `xid` a valid target of the given type according to `task_targets`? */
export function targetAllowed(
  targets: ClientTarget[],
  type: "user" | "contract",
  xid: string,
  brokerIds: string[],
): boolean {
  const id = String(xid ?? "");
  if (!id) return false;
  for (const t of targets) {
    if (type === "user") {
      if (t.user && t.user.id === id) {
        if (!t.user.eligible_broker_ids.length) return true;
        if (!brokerIds.length) return true;
        if (t.user.eligible_broker_ids.some((b) => brokerIds.includes(b))) return true;
      }
    } else if (t.contracts.some((c) => c.id === id)) {
      return true;
    }
  }
  return false;
}




/**
 * Allowed assignees = whatever the caller-provided resolver returns, always
 * merged with the broker's own identifiers (CRM id, telecom id and the
 * internal Maestro directory id). Without this merge a self-assignment could
 * be rejected when the resolver is unavailable or returns a different id space.
 */
async function resolveAllowedAssignees(deps: any, profile: any): Promise<string[]> {
  const ids = new Set<string>();
  const list = (await deps.listAllowedAssignees?.().catch(() => [])) ?? [];
  for (const v of list) {
    const s = String(v ?? "").trim();
    if (s) ids.add(s);
  }
  for (const v of [profile?.maestro_broker_id, profile?.maestro_telecom_user_id]) {
    const s = String(v ?? "").trim();
    if (s) ids.add(s);
  }
  try {
    const internal = await deps.resolveTaskAssigneeId?.();
    const s = String(internal ?? "").trim();
    if (s) ids.add(s);
  } catch { /* optional */ }
  return [...ids];
}

export interface TargetValidation {
  ok: boolean;
  type: "user" | "contract";
  xid: string;
  error?: "xid_out_of_scope" | "target_mapping_required" | "validation_failed";
  message?: string;
  reason?: string;
  /** What the Client List API exposes for this broker, for troubleshooting. */
  available?: { users: string[]; contracts: string[] };
  targets_source?: "clients_api" | "unavailable";
  matched?: { client_id: string; name: string } | null;
}

/**
 * Single source of truth for the Maestro `task_targets` scope rule, shared by
 * the `create` action and the dedicated `validate_target` endpoint.
 */
async function validateTaskTarget(
  deps: any,
  admin: any,
  profile: any,
  userId: string,
  type: "user" | "contract",
  xidIn: unknown,
  ownIds: string[],
): Promise<TargetValidation> {
  const xid = String(xidIn ?? "").trim();
  const base: TargetValidation = { ok: false, type, xid };
  if (!xid) {
    return { ...base, error: "validation_failed", reason: "xid_required", message: "Aucune cible (xid) fournie." };
  }
  if (type === "user" && ownIds.includes(xid)) {
    return { ok: true, type, xid, reason: "own_broker_id", matched: null };
  }
  const targets = await loadClientTargets(deps, profile);
  const available = {
    users: targets.map((t) => t.user?.id).filter(Boolean) as string[],
    contracts: targets.flatMap((t) => t.contracts.map((c) => c.id)),
  };
  const targets_source: "clients_api" | "unavailable" = deps.clientTargetsFetch ? "clients_api" : "unavailable";
  if (targetAllowed(targets, type, xid, ownIds)) {
    const hit = targets.find((t) => (type === "user" ? t.user?.id === xid : t.contracts.some((c) => c.id === xid)));
    return { ok: true, type, xid, reason: `task_targets.${type}`, available, targets_source, matched: hit ? { client_id: hit.client_id, name: hit.name } : null };
  }
  if (type === "contract" && await contractIsMapped(admin, userId, xid)) {
    return { ok: true, type, xid, reason: "locally_mapped_contract", available, targets_source, matched: null };
  }
  return type === "user"
    ? {
        ...base, available, targets_source,
        error: "xid_out_of_scope",
        reason: targets_source === "unavailable" ? "clients_api_unavailable" : "no_matching_task_targets_user",
        message: "Cette cible n'appartient pas à ton périmètre (task_targets.user).",
      }
    : {
        ...base, available, targets_source,
        error: "target_mapping_required",
        reason: targets_source === "unavailable" ? "clients_api_unavailable" : "no_matching_task_targets_contract",
        message: "Ce contrat n'est pas une cible valide (task_targets.contracts) pour ton compte.",
      };
}

export async function handleTaskRequest(

  body: any,
  deps: TaskDeps,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { admin, userId, profile, token } = deps;
  const nowFn = deps.now ?? (() => new Date());
  const action = String(body?.action ?? "list");
  const source = String(body?.source ?? "app");
  const sessionId = body?.session_id ?? null;
  const correlation_id = String(body?.correlation_id ?? newCorrelationId());
  const role = profile?.role ?? "broker";

  if (!token && action !== "list") {
    return {
      status: 200,
      body: { success: false, error: "planipret_unauthorized", message: "Compte Maestro non connecté.", correlation_id },
    };
  }

  // ── LIST (listing by maestro id, filtered + paginated) ────────────────────
  if (action === "list") {
    const filter = normalizeFilter(body?.filter);
    const page = Math.max(Number(body?.page ?? 1) || 1, 1);
    const limit = Math.min(Math.max(Number(body?.limit ?? 20) || 20, 1), 200);
    // Do not impose Maestro's English `pending` slug. Production accounts use
    // localized/custom statuses, and that upstream filter can incorrectly
    // return an empty list. Open/overdue/today filtering is applied below.
    const status = body?.status ? String(body.status) : null;
    const from = body?.from ? String(body.from) : null;
    const to = body?.to ? String(body.to) : null;

    // Admins may inspect another broker's tasks (portal broker toggle).
    // Brokers are always locked to their own Maestro id.
    const isAdminRole = role === "admin" || role === "planipret_admin" || role === "super_admin";
    const requestedBroker = String(body?.broker_id ?? "").trim();
    const overrideBroker = isAdminRole && /^\d+$/.test(requestedBroker) ? requestedBroker : null;

    let maestroId: string | null = profile?.maestro_broker_id ? String(profile.maestro_broker_id) : null;
    let telecomId: string | null = null;
    if (overrideBroker) {
      maestroId = overrideBroker;
      telecomId = overrideBroker;
    } else {
      try {
        telecomId = await deps.resolveTelecomUserId(maestroId);
        maestroId = maestroId ?? telecomId;
      } catch { /* keep null */ }
    }

    // The official Task List endpoint scopes `user_id` with the Maestro CRM
    // broker id. `maestro_telecom_user_id` is only a legacy fallback for
    // accounts that have no broker id yet (the two values often differ).
    const listOwnerId = maestroId ?? telecomId;
    const upstream = listOwnerId && token
      ? await deps.listFetch(listOwnerId, { status, from, to })
      : { ok: false as const, tasks: [] as any[], endpoint: null, status: 0 };

    let all: any[];
    let src: "api" | "projection" | "unavailable";
    if (upstream.ok) {
      all = (upstream.tasks ?? []).map((t: any) => normalizeTask(t));
      // Align the calendar/list on the real assignment source: keep tasks
      // assigned to this broker AND tasks whose assignment Maestro returned
      // empty but which target him (otherwise they vanish from the calendar).
      all = filterByAssignee(all, overrideBroker
        ? [maestroId, telecomId]
        : [maestroId, telecomId, profile?.maestro_telecom_user_id]);
      src = "api";
      // Never write another broker's tasks into the caller's local projection.
      if (!overrideBroker) await syncProjection(admin, userId, all, { full: !from && !to });
    } else if (overrideBroker) {
      all = [];
      src = "unavailable";
    } else {
      all = await loadProjection(admin, userId);
      src = all.length ? "projection" : "unavailable";
    }

    const now = nowFn();
    const counts = taskCounts(all, now);
    const filtered = filterTasks(all, filter, now);
    const pageOut = paginate(filtered, page, limit);
    const buckets = bucketTasks(pageOut.items, now);

    return {
      status: 200,
      body: {
        success: true,
        source: src,
        maestro_user_id: maestroId,
        scoped_broker_id: overrideBroker,
        telecom_user_id: telecomId,
        endpoint: upstream.endpoint,
        filter,
        tasks: pageOut.items,
        buckets,
        counts,
        overdue_count: counts.overdue,
        page: pageOut.page,
        limit: pageOut.limit,
        total: pageOut.total,
        has_more: pageOut.has_more,
        ...(src === "unavailable"
          ? { error: "tasks_unavailable", message: "Liste des tâches indisponible pour le moment." }
          : src === "projection"
            ? { message: "Dernier état connu (liste live indisponible)." }
            : {}),
        correlation_id,
      },
    };
  }

  // ── GET (live first, projection fallback) ─────────────────────────────────
  if (action === "get") {
    const taskId = String(body?.task_id ?? "").trim();
    if (!taskId) {
      return { status: 200, body: { success: false, error: "validation_failed", fields: { task_id: "task_id_required" }, correlation_id } };
    }

    // 1) Authoritative source: direct single read, then the list connector.
    try {
      const maestroId: string | null = profile?.maestro_broker_id ? String(profile.maestro_broker_id) : null;
      const telecomId = await deps.resolveTelecomUserId(maestroId);
      if (token && deps.singleFetch) {
        const one = await deps.singleFetch(taskId, telecomId);
        if (one.ok && one.task) {
          await projectionUpsert(admin, userId, [one.task]);
          return { status: 200, body: { success: true, source: "api", endpoint: one.endpoint, task: one.task, correlation_id } };
        }
      }
      if (telecomId && token) {
        const upstream = await deps.listFetch(telecomId, { status: null, from: null, to: null });
        if (upstream.ok) {
          const all = (upstream.tasks ?? []).map((t: any) => normalizeTask(t));
          await projectionUpsert(admin, userId, all);
          const hit = all.find((t: any) => String(t.id) === taskId);
          if (hit) return { status: 200, body: { success: true, source: "api", endpoint: upstream.endpoint, task: hit, correlation_id } };
        }
      }
    } catch { /* fall through to projection */ }

    // 2) Offline fallback.
    const { data: row } = await admin
      .from("planipret_tasks_projection")
      .select("payload")
      .eq("user_id", userId).eq("task_id", taskId).is("deleted_at", null)
      .maybeSingle();
    if (!row) return { status: 200, body: { success: false, error: "task_not_found", correlation_id } };
    return { status: 200, body: { success: true, source: "projection", task: normalizeTask(row.payload), correlation_id } };
  }

  // ── VERIFY (created / read back / visible in Maestro) ─────────────────────
  if (action === "verify") {
    const taskId = String(body?.task_id ?? "").trim();
    if (!taskId) {
      return { status: 200, body: { success: false, error: "validation_failed", fields: { task_id: "task_id_required" }, correlation_id } };
    }
    const maestroId: string | null = profile?.maestro_broker_id ? String(profile.maestro_broker_id) : null;
    let telecomId: string | null = null;
    try { telecomId = await deps.resolveTelecomUserId(maestroId); } catch { /* keep null */ }

    let task: any = null;
    let endpoint: string | null = null;
    let readBack = false;

    if (token && deps.singleFetch) {
      const one = await deps.singleFetch(taskId, telecomId).catch(() => null);
      if (one?.ok && one.task) { task = one.task; endpoint = one.endpoint; readBack = true; }
    }
    if (!task && telecomId && token) {
      const up = await deps.listFetch(telecomId, { status: null, from: null, to: null }).catch(() => null);
      if (up?.ok) {
        const hit = (up.tasks ?? []).map((t: any) => normalizeTask(t)).find((t: any) => String(t.id) === taskId);
        if (hit) { task = hit; endpoint = up.endpoint; readBack = true; }
      }
    }
    if (task) await projectionUpsert(admin, userId, [task]);

    let created = readBack;
    if (!task) {
      const { data: row } = await admin
        .from("planipret_tasks_projection")
        .select("payload")
        .eq("user_id", userId).eq("task_id", taskId).is("deleted_at", null)
        .maybeSingle();
      if (row) { task = normalizeTask(row.payload); created = true; }
    }

    const assignment = task ? readAssignment(task.raw ?? task) : { ids: [], source: "none" as const };
    const visible = readBack
      ? filterByAssignee([task], [maestroId, telecomId, profile?.maestro_telecom_user_id]).length > 0
      : false;

    return {
      status: 200,
      body: {
        success: true,
        task_id: taskId,
        created,
        read_back: readBack,
        visible_in_maestro: visible,
        source: readBack ? "api" : task ? "projection" : "unavailable",
        endpoint,
        assignment_source: assignment.source,
        returned_assignees: assignment.ids,
        maestro_task_url: `https://client.planipret.com/main/tasks?task_id=${encodeURIComponent(taskId)}`,
        task,
        correlation_id,
      },
    };
  }


  // ── DIAGNOSE (raw upstream read, for visibility troubleshooting) ──────────
  // GET ?action=diagnose[&task_id=946257] → what Maestro really stores.
  if (action === "diagnose") {
    const taskId = String(body?.task_id ?? "").trim();
    let maestroId: string | null = profile?.maestro_broker_id ? String(profile.maestro_broker_id) : null;
    let telecomId: string | null = null;
    try { telecomId = await deps.resolveTelecomUserId(maestroId); } catch { /* keep null */ }
    const upstream = telecomId && token
      ? await deps.listFetch(telecomId, { status: null, from: null, to: null })
      : { ok: false as const, tasks: [] as any[], endpoint: null, status: 0 };
    const all = (upstream.tasks ?? []).map((t: any) => normalizeTask(t));
    const mine = filterByAssignee(all, [maestroId, telecomId]);
    const hit = taskId ? all.find((t: any) => String(t.id) === taskId) ?? null : null;
    return {
      status: 200,
      body: {
        success: true,
        maestro_user_id: maestroId,
        telecom_user_id: telecomId,
        endpoint: upstream.endpoint,
        upstream_ok: upstream.ok,
        upstream_status: upstream.status,
        total_upstream: all.length,
        total_mine: mine.length,
        task: hit,
        assignment: hit ? readAssignment(hit.raw ?? hit) : null,
        visible_in_my_calendar: hit ? filterByAssignee([hit], [maestroId, telecomId]).length > 0 : null,
        tasks: taskId ? undefined : mine,
        correlation_id,
      },
    };
  }

  // ── ASSIGNMENT SELF-TEST ──────────────────────────────────────────────────
  // Creates a real task in the Maestro Task module assigned to the caller (or
  // an authorized assistant), reads it back and reports whether `users` is
  // populated. The task is KEPT by default so it can be seen in Maestro.
  if (action === "assignment_selftest") {
    const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
    const cleanup = body?.cleanup === true;
    const ownXid = profile?.maestro_broker_id ? String(profile.maestro_broker_id) : "";

    const allowedIds = await resolveAllowedAssignees(deps, profile);
    steps.push({
      step: "allowed_assignees",
      ok: allowedIds.length > 0,
      detail: allowedIds.length ? allowedIds.join(", ") : "aucun id autorisé résolu",
    });

    const requested = String(body?.users_id ?? "").trim();
    const guard = assertAssigneeAllowed(requested, allowedIds);
    if (guard.ok === false) {
      steps.push({ step: "assignee_guard", ok: false, detail: guard.message });
      return { status: 200, body: { success: false, ok: false, steps, ...guard, correlation_id } };
    }
    steps.push({ step: "assignee_guard", ok: true, detail: requested ? `users_id ${requested} autorisé` : "auto-assignation (moi)" });

    const internal = requested || (await deps.resolveTaskAssigneeId?.().catch(() => null)) || ownXid;
    const now = nowFn();
    const stamp = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    const built = buildCreatePayload({
      type: "user",
      xid: ownXid,
      users_id: internal,
      date: stamp,
      notes: String(body?.notes ?? `Diagnostic AVA — vérification d'assignation (${correlation_id})`),
    });
    if (!built.ok) {
      steps.push({ step: "payload", ok: false, detail: JSON.stringify((built as any).fields ?? {}) });
      return { status: 200, body: { success: false, ok: false, steps, correlation_id } };
    }
    steps.push({ step: "payload", ok: true, detail: `users_id=${internal}, date=${built.payload.date}` });

    const res = await deps.apiFetch("/api/main/tasks", { method: "POST", body: JSON.stringify(built.payload) });
    if (!res.ok) {
      steps.push({ step: "create", ok: false, detail: `HTTP ${res.status}` });
      await audit(admin, { action: "task_selftest", user_id: userId, source, session_id: sessionId, status: res.status, correlation_id, result: "create_failed" });
      return { status: 200, body: { success: false, ok: false, steps, ...mapTaskApiError(res.status, res.data), correlation_id } };
    }
    const raw = res.data?.data ?? res.data?.task ?? res.data ?? {};
    const created = normalizeTask({ ...built.payload, ...raw });
    steps.push({ step: "create", ok: !!created.id, detail: created.id ? `tâche #${created.id} créée dans Maestro` : "aucun id retourné" });
    if (created.id) await projectionUpsert(admin, userId, [created]);

    // Read-back: single GET first, then the list connector.
    let readback: any = null;
    let readSource = "none";
    if (created.id) {
      const single = await deps.apiFetch(`/api/main/tasks/${encodeURIComponent(created.id)}`, { method: "GET" });
      if (single.ok) {
        readback = single.data?.data ?? single.data?.task ?? single.data ?? null;
        if (readback) readSource = "GET /api/main/tasks/{id}";
      }
      if (!readback) {
        let telecomId: string | null = null;
        try { telecomId = await deps.resolveTelecomUserId(ownXid || null); } catch { /* ignore */ }
        if (telecomId) {
          const up = await deps.listFetch(telecomId, { status: null, from: null, to: null });
          const hit = (up.tasks ?? []).find((t: any) => String(normalizeTask(t).id) === String(created.id));
          if (hit) { readback = (hit as any).raw ?? hit; readSource = up.endpoint ?? "list"; }
        }
      }
    }
    const assignment = readback ? readAssignment(readback) : { ids: [], source: "none" as const };
    const usersOk = assignment.source === "users" && assignment.ids.includes(String(internal));
    steps.push({
      step: "readback",
      ok: !!readback,
      detail: readback ? `lu via ${readSource}` : "aucune lecture disponible (endpoint GET non exposé)",
    });
    steps.push({
      step: "users_populated",
      ok: usersOk,
      detail: usersOk
        ? `users contient ${internal}`
        : `users=${JSON.stringify(assignment.ids)} (source: ${assignment.source})`,
    });

    if (cleanup && created.id) {
      const del = await deps.apiFetch(`/api/main/tasks/${encodeURIComponent(created.id)}`, {
        method: "DELETE", body: JSON.stringify({ task_id: Number(created.id) || created.id }),
      });
      steps.push({ step: "cleanup", ok: del.ok, detail: del.ok ? "tâche de test supprimée" : `HTTP ${del.status}` });
    }

    const ok = steps.every((s) => s.ok);
    await audit(admin, { action: "task_selftest", user_id: userId, task_id: created.id, source, session_id: sessionId, correlation_id, result: ok ? "ok" : "warnings" });
    return {
      status: 200,
      body: {
        success: true,
        ok,
        steps,
        task: created,
        task_id: created.id,
        expected_assignee: String(internal),
        returned_assignees: assignment.ids,
        assignment_source: assignment.source,
        maestro_task_url: created.id ? `https://client.planipret.com/main/tasks?task_id=${created.id}` : null,
        kept: !cleanup,
        correlation_id,
      },
    };
  }

  // ── CLIENT TASK TARGETS ────────────────────────────────────────────────────
  // Exposes the `task_targets` metadata of the Client List API so the app and
  // AVA can pick a valid xid (client user id or one of its contract ids).
  if (action === "client_targets") {
    const search = body?.search ? String(body.search) : null;
    const targets = await loadClientTargets(deps, profile, search);
    return {
      status: 200,
      body: {
        success: true,
        targets,
        count: targets.length,
        source: deps.clientTargetsFetch ? "clients_api" : "unavailable",
        correlation_id,
      },
    };
  }

  // ── TARGET VALIDATION (dry run) ────────────────────────────────────────────
  // Detailed, non-mutating validation of a would-be task target. Returns the
  // exact error code (`xid_out_of_scope` / `target_mapping_required`) plus the
  // list of valid targets so callers can correct the request.
  if (action === "validate_target") {
    const type = String(body?.type ?? body?.target_type ?? "user").toLowerCase();
    if (type !== "user" && type !== "contract") {
      return { status: 200, body: { success: false, error: "validation_failed", fields: { type: "type_must_be_user_or_contract" }, correlation_id } };
    }
    const { data: fullV } = await admin.from("planipret_profiles")
      .select("maestro_broker_id, maestro_telecom_user_id").eq("id", profile?.id).maybeSingle();
    const ownIdsV = [
      String(profile?.maestro_broker_id ?? ""),
      String(fullV?.maestro_broker_id ?? ""),
      String(fullV?.maestro_telecom_user_id ?? ""),
    ].filter(Boolean);
    const check = await validateTaskTarget(deps, admin, profile, userId, type as "user" | "contract", body?.xid ?? body?.target, ownIdsV);
    return { status: 200, body: { success: true, valid: check.ok, validation: check, own_ids: ownIdsV, correlation_id } };
  }

  // ── CREATE ─────────────────────────────────────────────────────────────────
  if (action === "create") {
    // A `user` task defaults to the broker's own Planiprêt id when the client
    // did not provide a target.
    const createInput = { ...(body ?? {}) } as any;
    const ownXid = profile?.maestro_broker_id ? String(profile.maestro_broker_id) : "";
    const hasTarget = String(createInput.xid ?? createInput.target ?? "").trim() !== "";
    const wantsUser = String(createInput.type ?? createInput.target_type ?? "user").toLowerCase() === "user";
    if (!hasTarget && wantsUser && ownXid) {
      createInput.xid = ownXid;
      createInput.type = "user";
    }
    // Auto-assignment: a task is assigned to its creator unless the broker
    // explicitly assigns it to someone else (users_id / assignee_id).
    const explicitAssignee = createInput.users_id ?? createInput.assignee_id;
    if (explicitAssignee === undefined || explicitAssignee === null || String(explicitAssignee).trim() === "") {
      // `xid` is the CRM/OAuth broker id. Maestro's task `users_id` belongs to
      // its internal user directory and can be different (for example 387… vs
      // 93135). Sending the CRM id is accepted but leaves `users: []`, so the
      // task never appears in the assignee's Maestro calendar.
      const internalAssignee = await deps.resolveTaskAssigneeId?.().catch(() => null);
      if (internalAssignee || ownXid) createInput.users_id = internalAssignee ?? ownXid;
    }
    const built = buildCreatePayload(createInput);

    if (!built.ok) return { status: 200, body: { success: false, ...built, correlation_id } };
    const payload = built.payload;

    // Assignment scope: self or authorized team assistants only (Maestro rule).
    if (payload.users_id !== undefined && payload.users_id !== null) {
      const allowedIds = await resolveAllowedAssignees(deps, profile);
      const check = assertAssigneeAllowed(payload.users_id, allowedIds);
      if (!check.ok) {
        await audit(admin, { action: "task_create_denied", user_id: userId, source, session_id: sessionId, correlation_id, result: "assignee_not_allowed" });
        return { status: 200, body: { success: false, ...check, correlation_id } };
      }
    }

    // Scope check — Maestro rule: a task only shows on the Tasks page when it
    // targets a valid `task_targets` entry from the Client List API. Own-broker
    // ids stay valid for personal tasks.
    const { data: full } = await admin.from("planipret_profiles")
      .select("maestro_broker_id, maestro_telecom_user_id").eq("id", profile?.id).maybeSingle();
    const ownIds = [
      String(profile?.maestro_broker_id ?? ""),
      String(full?.maestro_broker_id ?? ""),
      String(full?.maestro_telecom_user_id ?? ""),
    ].filter(Boolean);

    if (payload.type === "user" || payload.type === "contract") {
      const check = await validateTaskTarget(deps, admin, profile, userId, payload.type, payload.xid, ownIds);
      if (!check.ok) {
        await audit(admin, {
          action: "task_create_denied", user_id: userId, source, session_id: sessionId,
          correlation_id, result: check.error === "xid_out_of_scope" ? "out_of_scope" : String(check.error),
        });
        return {
          status: 200,
          body: { success: false, error: check.error, message: check.message, validation: check, correlation_id },
        };
      }
    }



    const key = String(createInput?.idempotency_key ?? idempotencyKey(["create", userId, payload.xid as any, payload.type as any, payload.date as any, payload.notes as any]));
    const out = await withIdempotency(admin, userId, key, "create", async () => {
      const res = await deps.apiFetch("/api/main/tasks", { method: "POST", body: JSON.stringify(payload) });
      if (!res.ok) {
        await audit(admin, { action: "task_create_failed", user_id: userId, source, session_id: sessionId, status: res.status, correlation_id, result: "error" });
        return { status: 200, body: { ...mapTaskApiError(res.status, res.data), correlation_id } };
      }
      const raw = res.data?.data ?? res.data?.task ?? res.data ?? {};
      let task = normalizeTask({ ...payload, ...raw, created_by_ava: source !== "app" });

      // Maestro sometimes answers 200 with `users: []` even though `users_id`
      // was accepted. Try once to force the link, then report what happened.
      const wantedAssignee = payload.users_id !== undefined ? String(payload.users_id) : "";
      let assignment_repair: "not_needed" | "repaired" | "failed" | "skipped" = "not_needed";
      const usersEchoed = Array.isArray((raw as any)?.users);
      if (wantedAssignee && task.id && usersEchoed && readAssignment(raw).source !== "users") {
        const rep = await deps.apiFetch(`/api/main/tasks/${encodeURIComponent(task.id)}`, {
          method: "PUT",
          body: JSON.stringify({ task_id: Number(task.id) || task.id, users_id: Number(wantedAssignee) }),
        });
        if (rep.ok) {
          const repRaw = rep.data?.data ?? rep.data?.task ?? rep.data ?? {};
          const merged = normalizeTask({ ...payload, ...raw, ...repRaw, created_by_ava: source !== "app" });
          assignment_repair = readAssignment(merged.raw ?? merged).source === "users" ? "repaired" : "failed";
          if (assignment_repair === "repaired") task = merged;
        } else {
          assignment_repair = "failed";
        }
      } else if (!wantedAssignee || !usersEchoed) {
        assignment_repair = "skipped";
      }

      const diag = diagnoseTaskResponse({ sentDate: payload.date, sentAssignee: wantedAssignee, task });
      if (task.id) await projectionUpsert(admin, userId, [task]);
      await audit(admin, {
        action: "task_created", user_id: userId, task_id: task.id, source, session_id: sessionId,
        status: res.status, correlation_id, result: diag.ok ? "ok" : "ok_with_warnings",
      });
      if (!diag.ok) console.warn("[task-create-diagnostics]", correlation_id, JSON.stringify(diag.issues));
      return {
        status: 200,
        body: {
          success: true,
          task,
          task_id: task.id,
          diagnostics: {
            ok: diag.ok,
            issues: diag.issues,
            assignment_repair,
            expected_assignee: wantedAssignee || null,
            returned_assignees: task.assignee_ids,
            assignment_source: task.assignment_source,
            sent_date_toronto: payload.date ?? null,
            returned_due_at_utc: task.due_at,
          },
          correlation_id,
        },
      };
    });
    return { status: 200, body: out.body };
  }

  // ── UPDATE ─────────────────────────────────────────────────────────────────
  if (action === "update") {
    const taskId = String(body?.task_id ?? "").trim();
    const built = buildUpdateBody(taskId, body?.changes ?? {});
    if (!built.ok) return { status: 200, body: { success: false, ...built, correlation_id } };
    if (built.payload.users_id !== undefined && built.payload.users_id !== null) {
      const allowedIds = await resolveAllowedAssignees(deps, profile);
      const check = assertAssigneeAllowed(built.payload.users_id, allowedIds);
      if (!check.ok) {
        await audit(admin, { action: "task_update_denied", user_id: userId, task_id: taskId, source, session_id: sessionId, correlation_id, result: "assignee_not_allowed" });
        return { status: 200, body: { success: false, ...check, correlation_id } };
      }
    }
    const key = String(body?.idempotency_key ?? idempotencyKey(["update", userId, taskId, JSON.stringify(built.payload)]));
    const out = await withIdempotency(admin, userId, key, "update", async () => {
      const res = await deps.apiFetch(`/api/main/tasks/${encodeURIComponent(taskId)}`, {
        method: "PUT", body: JSON.stringify(built.payload),
      });
      if (!res.ok) {
        await audit(admin, { action: "task_update_failed", user_id: userId, task_id: taskId, source, session_id: sessionId, status: res.status, correlation_id, result: "error" });
        return { status: 200, body: { ...mapTaskApiError(res.status, res.data), correlation_id } };
      }
      const { data: row } = await admin.from("planipret_tasks_projection")
        .select("payload").eq("user_id", userId).eq("task_id", taskId).maybeSingle();
      const merged = normalizeTask({ ...(row?.payload ?? { id: taskId }), ...(res.data?.data ?? res.data ?? {}), ...built.payload, id: taskId });
      await projectionUpsert(admin, userId, [merged]);
      await audit(admin, { action: "task_updated", user_id: userId, task_id: taskId, source, session_id: sessionId, status: res.status, correlation_id, result: "ok" });
      return { status: 200, body: { success: true, task: merged, task_id: taskId, correlation_id } };
    });
    return { status: 200, body: out.body };
  }

  // ── DELETE ─────────────────────────────────────────────────────────────────
  if (action === "delete") {
    const taskId = String(body?.task_id ?? "").trim();
    if (!taskId) {
      return { status: 200, body: { success: false, error: "validation_failed", fields: { task_id: "task_id_required" }, correlation_id } };
    }
    if (!canDeleteTask(role)) {
      await audit(admin, { action: "task_delete_denied", user_id: userId, task_id: taskId, source, session_id: sessionId, correlation_id, result: "role_forbidden" });
      return { status: 200, body: { success: false, error: "role_forbidden", message: "Ton rôle ne permet pas de supprimer une tâche.", correlation_id } };
    }
    const key = String(body?.idempotency_key ?? idempotencyKey(["delete", userId, taskId]));
    const out = await withIdempotency(admin, userId, key, "delete", async () => {
      const res = await deps.apiFetch(`/api/main/tasks/${encodeURIComponent(taskId)}`, {
        method: "DELETE", body: JSON.stringify({ task_id: Number.isNaN(Number(taskId)) ? taskId : Number(taskId) }),
      });
      if (!res.ok) {
        await audit(admin, { action: "task_delete_failed", user_id: userId, task_id: taskId, source, session_id: sessionId, status: res.status, correlation_id, result: "error" });
        return { status: 200, body: { ...mapTaskApiError(res.status, res.data), correlation_id } };
      }
      await admin.from("planipret_tasks_projection")
        .update({ deleted_at: new Date().toISOString() })
        .eq("user_id", userId).eq("task_id", taskId);
      await audit(admin, { action: "task_deleted", user_id: userId, task_id: taskId, source, session_id: sessionId, status: res.status, correlation_id, result: "ok" });
      return { status: 200, body: { success: true, task_id: taskId, deleted: true, correlation_id } };
    });
    return { status: 200, body: out.body };
  }

  // ── HISTORY (audit trail of one task) ─────────────────────────────────────
  if (action === "history") {
    const taskId = String(body?.task_id ?? "").trim();
    if (!taskId) {
      return { status: 200, body: { success: false, error: "missing_task_id", correlation_id } };
    }
    const isAdminRole = role === "admin" || role === "planipret_admin" || role === "super_admin";
    let q = admin.from("planipret_audit_log")
      .select("id, action, created_at, user_id, metadata")
      .eq("resource_type", "planipret_task")
      .eq("resource_id", taskId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (!isAdminRole) q = q.eq("user_id", userId);
    const { data, error } = await q;
    if (error) {
      return { status: 200, body: { success: false, error: "history_unavailable", message: error.message, correlation_id } };
    }
    return { status: 200, body: { success: true, task_id: taskId, events: data ?? [], correlation_id } };
  }


  return { status: 200, body: { success: false, error: "unknown_action", action, correlation_id } };
}
