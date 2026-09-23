// Runtime-agnostic core of the Planiprêt Task API gateway.
// All I/O is injected (`TaskDeps`) so the exact same logic runs in the edge
// function AND under Vitest. No Deno / Node globals allowed in this file.
//
// Routes consumed (official docs: https://client.planipret.com/api-docs):
//   POST   /api/main/tasks
//   PUT    /api/main/tasks/{taskId}    (task_id also in body)
//   DELETE /api/main/tasks/{taskId}    (task_id also in body, soft delete)
// GET /api/main/tasks is documented and is the only allowed task read-back.
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
  toApiDateTime,
  type NormalizedTask,
} from "./planipret-tasks.ts";

export interface ApiResponse { status: number; ok: boolean; data: any }

export interface UpstreamList {
  ok: boolean;
  tasks: any[];
  endpoint: string | null;
  status: number;
  /** True only when every reported upstream page has been read. */
  complete?: boolean;
  pages_read?: number;
  truncated?: boolean;
}

export interface TaskDeps {
  admin: any;
  userId: string;
  profile: any;
  token: string | null;
  /** Authenticated call to the official Planiprêt API (`/api/main/...`). */
  apiFetch: (path: string, init: { method: string; body?: string }) => Promise<ApiResponse>;
  /** Documented GET /api/main/tasks read-back. */
  listFetch: (
    telecomId: string,
    opts: { status?: string | null; from?: string | null; to?: string | null; type?: "user" | "contract" | null; findTaskId?: string | null },
  ) => Promise<UpstreamList>;
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
  /** Injectable delay for the bounded post-create Maestro indexing read-back. */
  wait?: (ms: number) => Promise<void>;
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
    // A concurrent request may still succeed upstream, but its read-back is not
    // known here. Never turn this race into a user-visible success claim.
    return {
      status: 200,
      body: {
        success: false,
        pending_confirmation: true,
        error: "mutation_in_flight",
        message: "La demande est encore en cours de vérification dans Maestro. Elle n’est pas déclarée créée.",
        replayed: true,
      },
    };
  }
  const out = await run();
  await admin.from("planipret_task_mutations")
    .update({ response: out.body, http_status: out.status, completed_at: new Date().toISOString() })
    .eq("user_id", userId).eq("idempotency_key", key);
  return out;
}

async function projectionUpsert(admin: any, userId: string, tasks: any[]) {
  if (!tasks.length) return;
  const ids = tasks.map((t) => String(t.id)).filter(Boolean);
  const { data: current } = await admin
    .from("planipret_tasks_projection")
    .select("task_id,due_at,status,payload")
    .eq("user_id", userId)
    .in("task_id", ids);
  const existing = new Map<string, any>((current ?? []).map((row: any) => [String(row.task_id), row]));
  const rows = tasks.filter((t) => {
    const prior: any = existing.get(String(t.id));
    if (!prior) return true;
    return prior.due_at !== t.due_at
      || prior.status !== t.status
      || JSON.stringify(prior.payload ?? null) !== JSON.stringify(t ?? null);
  }).map((t) => ({
    user_id: userId,
    task_id: String(t.id),
    due_at: t.due_at,
    status: t.status,
    payload: t,
    updated_at: new Date().toISOString(),
  }));
  if (rows.length) await admin.from("planipret_tasks_projection").upsert(rows, { onConflict: "user_id,task_id" });
}

/** Compare a documented GET read-back to the actual PUT fields. */
function updateReadBackMatches(task: NormalizedTask, payload: Record<string, unknown>) {
  const raw = task.raw ?? {};
  const issues: string[] = [];
  if (payload.notes !== undefined && String(task.notes ?? "") !== String(payload.notes ?? "")) issues.push("notes_mismatch");
  if (payload.description !== undefined && String(task.description ?? "") !== String(payload.description ?? "")) issues.push("description_mismatch");
  if (payload.date !== undefined) {
    const actual = toApiDateTime(task.due_at ?? "");
    if (!actual || actual !== String(payload.date)) issues.push("date_mismatch");
  }
  if (payload.users_id !== undefined) {
    const assignment = readAssignment(raw);
    if (!assignment.ids.includes(String(payload.users_id))) issues.push("assignment_mismatch");
  }
  if (payload.status_option_id !== undefined
    && String(raw?.status_option_id ?? "") !== String(payload.status_option_id)) {
    issues.push("status_option_mismatch");
  }
  // `update_status` is documented only in conjunction with the selected
  // `status_option_id`; Maestro does not document a textual "completed"
  // value or a global completion-option id. Never guess one.
  if (payload.update_status === 1 && payload.status_option_id === undefined) issues.push("status_unverifiable");
  return { ok: issues.length === 0, issues };
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

/** Admin only: every broker's mirrored tasks (deduped by task id). */
async function loadProjectionAll(admin: any) {
  const { data } = await admin
    .from("planipret_tasks_projection")
    .select("task_id,payload")
    .is("deleted_at", null)
    .order("due_at", { ascending: true })
    .limit(2000);
  const seen = new Set<string>();
  const out: any[] = [];
  for (const r of (data ?? []) as any[]) {
    const id = String(r.task_id ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(normalizeTask(r.payload));
  }
  return out;
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
  // An empty upstream page is almost always a transient Maestro hiccup or a
  // wrong owner id. Never wipe a broker's whole local copy on that signal.
  if (!keep.length) return;
  const q = admin.from("planipret_tasks_projection")
    .update({ deleted_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("deleted_at", null)
    .not("task_id", "in", `(${keep.map((k) => `"${k}"`).join(",")})`);
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
/**
 * Budget de temps: les vérifications amont (annuaire Maestro, périmètre client)
 * ne doivent jamais faire dépasser la durée d'exécution de la fonction, sinon
 * la création échoue au niveau réseau ("Failed to send a request") et la tâche
 * n'arrive jamais dans Maestro.
 */
async function withDeadline<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((resolve) => { t = setTimeout(() => resolve(fallback), ms); }),
    ]);
  } catch {
    return fallback;
  } finally {
    if (t) clearTimeout(t);
  }
}

async function loadClientTargets(deps: any, profile: any, search?: string | null): Promise<ClientTarget[]> {
  if (!deps.clientTargetsFetch) return [];
  let telecomId: string | null = null;
  try {
    telecomId = await deps.resolveTelecomUserId(profile?.maestro_broker_id ? String(profile.maestro_broker_id) : null);
  } catch { /* ignore */ }
  const rows = await deps.clientTargetsFetch(telecomId, search ?? null).catch(() => []);
  // Maestro only exposes `task_targets` on part of its client list. Clients
  // without that metadata are still legitimate targets (their own user id), so
  // they must stay visible in the picker instead of silently disappearing.
  const out: ClientTarget[] = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const normalized = normalizeClientTarget(row);
    if (normalized) { out.push(normalized); continue; }
    const id = String((row as any)?.user?.id ?? (row as any)?.user_id ?? (row as any)?.id ?? "").trim();
    if (!id) continue;
    out.push({
      client_id: String((row as any)?.id ?? id),
      name: clientLabel(row),
      email: (row as any)?.email ? String((row as any).email) : null,
      user: { id, eligible_broker_ids: [] },
      contracts: [],
    });
  }
  return out;
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
  // First pass: default client page. Second pass: targeted search on the xid,
  // because the Client List API is paginated and the client may not be on it.
  let targets = await loadClientTargets(deps, profile);
  let hasScope = targets.length > 0;
  if (!targetAllowed(targets, type, xid, ownIds) && !targets.some((t) => t.client_id === xid)) {
    const searched = await loadClientTargets(deps, profile, xid);
    if (searched.length) {
      hasScope = true;
      const seen = new Set(targets.map((t) => t.client_id));
      targets = [...targets, ...searched.filter((t) => !seen.has(t.client_id))];
    }
  }
  const available = {
    users: targets.map((t) => t.user?.id).filter(Boolean) as string[],
    contracts: targets.flatMap((t) => t.contracts.map((c) => c.id)),
  };
  const targets_source: "clients_api" | "unavailable" = deps.clientTargetsFetch && hasScope ? "clients_api" : "unavailable";
  if (targetAllowed(targets, type, xid, ownIds)) {
    const hit = targets.find((t) => (type === "user" ? t.user?.id === xid : t.contracts.some((c) => c.id === xid)));
    return { ok: true, type, xid, reason: `task_targets.${type}`, available, targets_source, matched: hit ? { client_id: hit.client_id, name: hit.name } : null };
  }
  // The Maestro client id itself is a valid `user` target.
  const byClient = targets.find((t) => t.client_id === xid);
  if (type === "user" && byClient) {
    return { ok: true, type, xid, reason: "client_id_match", available, targets_source, matched: { client_id: byClient.client_id, name: byClient.name } };
  }
  if (type === "contract" && await contractIsMapped(admin, userId, xid)) {
    return { ok: true, type, xid, reason: "locally_mapped_contract", available, targets_source, matched: null };
  }
  // No scope information available (API down, empty page, missing telecom id):
  // fail closed for an explicit client/contract target. Personal tasks already
  // passed above through `ownIds`; an arbitrary xid must never cross tenants.
  if (targets_source === "unavailable") {
    return type === "user"
      ? {
          ...base, available, targets_source,
          error: "xid_out_of_scope",
          reason: "scope_unavailable_fail_closed",
          message: "Le périmètre client n'a pas pu être vérifié. Réessayez avant de créer la tâche.",
        }
      : {
          ...base, available, targets_source,
          error: "target_mapping_required",
          reason: "scope_unavailable_fail_closed",
          message: "Le contrat n'a pas pu être vérifié. Réessayez avant de créer la tâche.",
        };
  }
  return type === "user"
    ? {
        ...base, available, targets_source,
        error: "xid_out_of_scope",
        reason: "no_matching_task_targets_user",
        message: "Cette cible n'appartient pas à ton périmètre (task_targets.user).",
      }
    : {
        ...base, available, targets_source,
        error: "target_mapping_required",
        reason: "no_matching_task_targets_contract",
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
    const allBrokers = isAdminRole && requestedBroker.toLowerCase() === "all";
    const overrideBroker = isAdminRole && /^\d+$/.test(requestedBroker) ? requestedBroker : null;

    if (allBrokers) {
      const all = await loadProjectionAll(admin);
      const now = nowFn();
      const counts = taskCounts(all, now);
      const filtered = filterTasks(all, filter, now);
      const pageOut = paginate(filtered, page, limit);
      return {
        status: 200,
        body: {
          success: true,
          source: all.length ? "projection" : "unavailable",
          maestro_user_id: null,
          scoped_broker_id: "all",
          telecom_user_id: null,
          endpoint: null,
          filter,
          tasks: pageOut.items,
          buckets: bucketTasks(pageOut.items, now),
          counts,
          overdue_count: counts.overdue,
          page: pageOut.page,
          limit,
          total: pageOut.total,
          has_more: pageOut.has_more,
          correlation_id,
        },
      };
    }

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

    // The documented Task List filters (`delegate_users_id` / `target_id`)
    // expect the internal Maestro user id.  `maestro_broker_id` is the CRM
    // OAuth identity and can be a different numeric namespace: using it first
    // makes the list appear empty even though the task was accepted and is
    // visible in Maestro.  Prefer the directory-resolved internal id.
    // A broker can carry two numeric identities (directory/telecom id and CRM
    // OAuth id). Listing with the wrong one returns an empty page even though
    // Maestro holds tasks, so try every known id until one answers.
    // A task created from Contacts is assigned with the INTERNAL Maestro
    // directory id (`resolveTaskAssigneeId`). Listing without that id queries a
    // different namespace, so a freshly created task is reported as created but
    // never shows up in the task list. Always include it here.
    const internalAssigneeId = overrideBroker
      ? null
      : await withDeadline(
          Promise.resolve(deps.resolveTaskAssigneeId?.()).catch(() => null),
          5000,
          null,
        );
    const ownerCandidates = [...new Set(
      (overrideBroker
        ? [overrideBroker]
        : [internalAssigneeId, telecomId, maestroId, profile?.maestro_telecom_user_id, profile?.maestro_broker_id])
        .map((v) => String(v ?? "").trim())
        .filter(Boolean),
    )];
    const assigneeIds = overrideBroker
      ? [maestroId, telecomId]
      : [internalAssigneeId, maestroId, telecomId, profile?.maestro_telecom_user_id, profile?.maestro_broker_id];

    let upstream: UpstreamList = { ok: false, tasks: [], endpoint: null, status: 0 };
    let all: any[] = [];
    if (token) {
      for (const candidate of ownerCandidates) {
        const attempt = await deps.listFetch(candidate, { status, from, to });
        if (!attempt.ok) continue;
        const rows = filterByAssignee(
          (attempt.tasks ?? []).map((t: any) => normalizeTask(t)),
          assigneeIds,
        );
        if (!upstream.ok) { upstream = attempt; all = rows; }
        if (rows.length) { upstream = attempt; all = rows; break; }
      }
    }

    let src: "api" | "projection" | "unavailable";
    if (upstream.ok) {
      src = "api";
      // Never write another broker's tasks into the caller's local projection.
      // When an admin inspects a broker, mirror them under THAT broker's own
      // local user id so the admin task board reflects the real Maestro data.
      if (!overrideBroker) {
        await syncProjection(admin, userId, all, { full: Boolean(upstream.complete) && !from && !to });
      } else {
        try {
          const { data: owner } = await admin
            .from("planipret_profiles").select("user_id")
            .eq("maestro_broker_id", overrideBroker).not("user_id", "is", null).limit(1);
          const ownerId = owner?.[0]?.user_id ? String(owner[0].user_id) : null;
          if (ownerId) await syncProjection(admin, ownerId, all, { full: Boolean(upstream.complete) && !from && !to });
        } catch { /* mirroring is best effort */ }
      }
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
          upstream_pages_read: upstream.pages_read ?? null,
          upstream_truncated: upstream.truncated ?? false,
          ...(src === "unavailable"
            ? { error: "tasks_unavailable", message: "Liste des tâches indisponible pour le moment." }
            : src === "projection"
              ? { message: "Dernier état connu (liste live indisponible)." }
              : upstream.truncated
                ? { message: "Liste Maestro partielle : actualisation en cours." }
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

    // 1) Authoritative source: documented list connector only.
    try {
      const maestroId: string | null = profile?.maestro_broker_id ? String(profile.maestro_broker_id) : null;
      const telecomId = await deps.resolveTelecomUserId(maestroId);
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

    if (telecomId && token) {
      const up = await deps.listFetch(telecomId, { status: null, from: null, to: null, findTaskId: taskId }).catch(() => null);
      if (up?.ok) {
        const hit = (up.tasks ?? []).map((t: any) => normalizeTask(t)).find((t: any) => String(t.id) === taskId);
        if (hit) { task = hit; endpoint = up.endpoint; readBack = true; }
      }
    }
    if (task) await projectionUpsert(admin, userId, [task]);

    // A projection is a cache, never proof that Maestro created the task.
    const created = readBack;

    const assignment = task ? readAssignment(task.raw ?? task) : { ids: [], source: "none" as const };
    const visible = readBack
      ? filterByAssignee([task], [maestroId, telecomId, profile?.maestro_telecom_user_id]).length > 0
      : false;

    return {
      status: 200,
      body: {
        success: readBack,
        task_id: taskId,
        created,
        read_back: readBack,
        visible_in_maestro: visible,
        source: readBack ? "api" : "unavailable",
        endpoint,
        assignment_source: assignment.source,
        returned_assignees: assignment.ids,
        maestro_task_url: `https://client.planipret.com/main/tasks?task_id=${encodeURIComponent(taskId)}`,
        task: task ?? null,
        pending_confirmation: !readBack,
        message: readBack
          ? "Tâche relue dans Maestro."
          : "La création n’est pas confirmée par Maestro : aucune tâche n’est déclarée créée.",
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
      return { status: 200, body: { success: false, steps, ...guard, correlation_id } };
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
      return { status: 200, body: { ok: false, steps, ...mapTaskApiError(res.status, res.data), correlation_id } };
    }
    const raw = res.data?.data ?? res.data?.task ?? res.data ?? {};
    const created = normalizeTask({ ...built.payload, ...raw });
    steps.push({ step: "create", ok: !!created.id, detail: created.id ? `tâche #${created.id} créée dans Maestro` : "aucun id retourné" });
    if (created.id) await projectionUpsert(admin, userId, [created]);

    // Read-back: documented GET /api/main/tasks only.
    let readback: any = null;
    let readSource = "none";
    if (created.id) {
      let telecomId: string | null = null;
      try { telecomId = await deps.resolveTelecomUserId(ownXid || null); } catch { /* ignore */ }
      if (telecomId) {
        const up = await deps.listFetch(telecomId, { status: null, from: null, to: null });
        const hit = (up.tasks ?? []).find((t: any) => String(normalizeTask(t).id) === String(created.id));
        if (hit) { readback = (hit as any).raw ?? hit; readSource = up.endpoint ?? "GET /api/main/tasks"; }
      }
    }
    const assignment = readback ? readAssignment(readback) : { ids: [], source: "none" as const };
    const usersOk = assignment.source === "users" && assignment.ids.includes(String(internal));
    steps.push({
      step: "readback",
      ok: !!readback,
      detail: readback ? `lu via ${readSource}` : "absente de la liste officielle GET /api/main/tasks",
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
      // task never appears in the assignee's Maestro calendar. Do not POST an
      // ambiguously assigned task: resolving this internal id is mandatory.
      const internalAssignee = await withDeadline(
        Promise.resolve(deps.resolveTaskAssigneeId?.()).catch(() => null),
        5000,
        null,
      );
      if (!internalAssignee) {
        await audit(admin, {
          action: "task_create_denied", user_id: userId, source, session_id: sessionId,
          correlation_id, result: "assignee_mapping_required",
        });
        return {
          status: 200,
          body: {
            success: false,
            error: "assignee_mapping_required",
            message: "Votre identifiant interne Maestro n’a pas pu être vérifié. Le rappel n’a pas été créé; reconnectez Maestro puis réessayez.",
            correlation_id,
          },
        };
      }
      createInput.users_id = internalAssignee;
    }
    const built = buildCreatePayload(createInput);

    if (!built.ok) return { status: 200, body: { success: false, ...built, correlation_id } };
    const payload = built.payload;

    // Assignment scope: self or authorized team assistants only (Maestro rule).
    if (payload.users_id !== undefined && payload.users_id !== null) {
      const allowedIds = await withDeadline(
        Promise.resolve(resolveAllowedAssignees(deps, profile)).catch(() => [] as string[]),
        5000,
        [] as string[],
      );
      // Périmètre inconnu (annuaire lent/indisponible) : ne pas bloquer.
      const check = allowedIds.length ? assertAssigneeAllowed(payload.users_id, allowedIds) : { ok: true as const };
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
      const check = await withDeadline(
        validateTaskTarget(deps, admin, profile, userId, payload.type, payload.xid, ownIds),
        8000,
        // A timeout must not turn an unverified client or contract into an
        // authorized target. A retry is safe; cross-broker task creation is not.
        payload.type === "user"
          ? {
              ok: false,
              type: "user" as const,
              xid: String(payload.xid ?? ""),
              error: "xid_out_of_scope" as const,
              reason: "scope_check_timeout_fail_closed",
              message: "Le périmètre client n'a pas pu être vérifié à temps. Réessayez avant de créer la tâche.",
            }
          : {
              ok: false,
              type: "contract" as const,
              xid: String(payload.xid ?? ""),
              error: "target_mapping_required" as const,
              reason: "scope_check_timeout_fail_closed",
              message: "Le périmètre du contrat n'a pas pu être vérifié à temps. Réessayez avant de créer la tâche.",
            },
      );
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
      if (!res.ok || res.data?.success === false) {
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
        if (rep.ok && rep.data?.success !== false) {
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
      // A POST receipt and the local projection are not proof that the task is
      // visible in Maestro. Confirm with the documented GET /api/main/tasks.
      let readBack: NormalizedTask | null = null;
      let readBackEndpoint: string | null = null;
      let listStatus = 0;
      // The documented `delegate_users_id` / `target_id` filters use the same
      // internal Maestro directory id as `users_id`.  A telecom device id can
      // differ and produces a valid but unrelated list, which made a just
      // created Contacts follow-up look absent from Maestro.
      const listAssigneeId = wantedAssignee || await withDeadline(
        Promise.resolve(deps.resolveTaskAssigneeId?.()).catch(() => null),
        5000,
        null,
      );
      try {
        if (task.id && listAssigneeId) {
          const readBackType = payload.type === "user" || payload.type === "contract"
            ? payload.type
            : null;
          // Maestro can acknowledge POST before its task index serves the new
          // row.  Retry only this documented GET and only for a short bounded
          // window.  It never changes the task, repeats the POST, or weakens
          // the fail-closed confirmation rule.
          const retryDelays = [0, 500, 1200];
          for (let attempt = 0; attempt < retryDelays.length && !readBack; attempt += 1) {
            if (attempt > 0) {
              await (deps.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))))(retryDelays[attempt]);
            }
            const upstream = await deps.listFetch(String(listAssigneeId), {
              // Only the documented statuses are queried (`pending`, `open`,
              // `complete`) — never the legacy pseudo-value `all`, which can
              // return an empty page on some Maestro tenants.
              status: null,
              type: readBackType,
              from: null,
              to: null,
              findTaskId: String(task.id),
            });
            listStatus = upstream.status;
            if (upstream.ok) {
              const found = (upstream.tasks ?? []).map((item: any) => normalizeTask(item))
                .find((item: NormalizedTask) => String(item.id) === String(task.id));
              if (found) {
                readBack = found;
                readBackEndpoint = upstream.endpoint;
              }
            }
          }
        }
      } catch { /* result stays unconfirmed and therefore fail-closed */ }

      if (readBack) {
        task = readBack;
        await projectionUpsert(admin, userId, [task]);
      }
      const readBackAssignment = readBack ? readAssignment(readBack.raw ?? readBack) : { ids: [], source: "none" as const };
      const assignmentConfirmed = !!readBack && (!wantedAssignee || readBackAssignment.ids.includes(wantedAssignee));
      const confirmed = !!readBack && assignmentConfirmed;
      await audit(admin, {
        action: "task_created", user_id: userId, task_id: task.id, source, session_id: sessionId,
        status: res.status, correlation_id, result: confirmed ? (diag.ok ? "confirmed" : "confirmed_with_warnings") : (readBack ? "assignment_unconfirmed" : "pending_confirmation"),
      });
      if (!diag.ok) console.warn("[task-create-diagnostics]", correlation_id, JSON.stringify(diag.issues));
      return {
        status: 200,
        body: {
          success: confirmed,
          ...(confirmed ? {} : { error: readBack ? "maestro_assignment_unconfirmed" : "maestro_readback_unconfirmed" }),
          task: confirmed ? task : null,
          task_id: task.id,
          pending_confirmation: !confirmed,
          read_back: confirmed,
          visible_in_maestro: confirmed,
          endpoint: readBackEndpoint,
          message: confirmed
            ? "Tâche créée et relue dans Maestro."
            : readBack
              ? "Maestro affiche la tâche, mais l’assignation n’est pas confirmée. Elle n’est pas déclarée créée; reconnectez Maestro puis réessayez."
              : "Maestro a accepté la demande, mais la tâche n’est pas encore visible dans sa liste. Elle n’est pas déclarée créée; réessayez après actualisation.",
          diagnostics: {
            ok: diag.ok,
            issues: diag.issues,
            assignment_repair,
            expected_assignee: wantedAssignee || null,
            returned_assignees: readBackAssignment.ids,
            assignment_source: readBackAssignment.source,
            sent_date_toronto: payload.date ?? null,
            returned_due_at_utc: task.due_at,
            maestro_list_status: listStatus,
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
      if (!res.ok || res.data?.success === false) {
        await audit(admin, { action: "task_update_failed", user_id: userId, task_id: taskId, source, session_id: sessionId, status: res.status, correlation_id, result: "error" });
        return { status: 200, body: { ...mapTaskApiError(res.status, res.data), correlation_id } };
      }
      const expectedAssignee = built.payload.users_id !== undefined ? String(built.payload.users_id) : null;
      const listAssigneeId = expectedAssignee || await withDeadline(
        Promise.resolve(deps.resolveTaskAssigneeId?.()).catch(() => null),
        5000,
        null,
      );
      let readBack: NormalizedTask | null = null;
      let readBackEndpoint: string | null = null;
      let readBackComplete = false;
      if (listAssigneeId) {
        try {
          const upstream = await deps.listFetch(String(listAssigneeId), {
            status: null, type: null, from: null, to: null, findTaskId: taskId,
          });
          readBackComplete = upstream.complete === true;
          if (upstream.ok) {
            const found = (upstream.tasks ?? []).map((item: any) => normalizeTask(item))
              .find((item: NormalizedTask) => String(item.id) === taskId);
            if (found) {
              readBack = found;
              readBackEndpoint = upstream.endpoint;
            }
          }
        } catch { /* an accepted PUT is still not confirmed without a GET read-back */ }
      }
      const comparison = readBack ? updateReadBackMatches(readBack, built.payload) : { ok: false, issues: ["maestro_readback_unconfirmed"] };
      if (!readBack || !comparison.ok) {
        await audit(admin, {
          action: "task_update_pending_confirmation", user_id: userId, task_id: taskId, source, session_id: sessionId,
          status: res.status, correlation_id, result: readBack ? "readback_mismatch" : "pending_confirmation",
        });
        return {
          status: 200,
          body: {
            success: false,
            pending_confirmation: true,
            error: readBack ? "maestro_update_readback_mismatch" : "maestro_readback_unconfirmed",
            task: null,
            task_id: taskId,
            read_back: false,
            visible_in_maestro: false,
            endpoint: readBackEndpoint,
            message: readBack
              ? "Maestro affiche la tâche, mais les modifications demandées ne sont pas encore confirmées."
              : "Maestro a accepté la demande, mais la modification n’est pas encore relue dans sa liste.",
            diagnostics: { issues: comparison.issues, list_complete: readBackComplete, expected_assignee: expectedAssignee },
            correlation_id,
          },
        };
      }
      const confirmed = { ...readBack, maestro_read_back: true, raw: { ...(readBack.raw ?? {}), maestro_read_back: true } };
      await projectionUpsert(admin, userId, [confirmed]);
      await audit(admin, { action: "task_updated", user_id: userId, task_id: taskId, source, session_id: sessionId, status: res.status, correlation_id, result: "confirmed" });
      return {
        status: 200,
        body: { success: true, task: confirmed, task_id: taskId, read_back: true, visible_in_maestro: true, endpoint: readBackEndpoint, correlation_id },
      };
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
      if (!res.ok || res.data?.success === false) {
        await audit(admin, { action: "task_delete_failed", user_id: userId, task_id: taskId, source, session_id: sessionId, status: res.status, correlation_id, result: "error" });
        return { status: 200, body: { ...mapTaskApiError(res.status, res.data), correlation_id } };
      }
      const assigneeId = await withDeadline(
        Promise.resolve(deps.resolveTaskAssigneeId?.()).catch(() => null),
        5000,
        null,
      );
      let deletedReadBack = false;
      let readBackEndpoint: string | null = null;
      if (assigneeId) {
        try {
          const upstream = await deps.listFetch(String(assigneeId), {
            status: null, type: null, from: null, to: null, findTaskId: taskId,
          });
          readBackEndpoint = upstream.endpoint;
          const stillPresent = (upstream.tasks ?? []).some((item: any) => String(normalizeTask(item).id) === taskId);
          // Absence proves a deletion only after the bounded, documented list
          // completed every candidate/status page.
          deletedReadBack = upstream.ok && upstream.complete === true && !stillPresent;
        } catch { /* DELETE acceptance alone is not confirmation */ }
      }
      if (!deletedReadBack) {
        await audit(admin, { action: "task_delete_pending_confirmation", user_id: userId, task_id: taskId, source, session_id: sessionId, status: res.status, correlation_id, result: "pending_confirmation" });
        return {
          status: 200,
          body: {
            success: false,
            pending_confirmation: true,
            error: "maestro_delete_readback_unconfirmed",
            task_id: taskId,
            deleted: false,
            read_back: false,
            endpoint: readBackEndpoint,
            message: "Maestro a accepté la suppression, mais son absence n’est pas encore confirmée par relecture.",
            correlation_id,
          },
        };
      }
      await admin.from("planipret_tasks_projection")
        .update({ deleted_at: new Date().toISOString() })
        .eq("user_id", userId).eq("task_id", taskId);
      await audit(admin, { action: "task_deleted", user_id: userId, task_id: taskId, source, session_id: sessionId, status: res.status, correlation_id, result: "confirmed" });
      return { status: 200, body: { success: true, task_id: taskId, deleted: true, read_back: true, correlation_id } };
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
