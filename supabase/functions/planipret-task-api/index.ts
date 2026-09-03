// Planiprêt Task API gateway — the ONLY path the mobile app and AVA use to
// read/write tasks. Never expose the Planiprêt bearer token to the client.
//
// Routes consumed (official docs: https://client.planipret.com/api-docs):
//   POST   /api/main/tasks
//   PUT    /api/main/tasks/{taskId}    (task_id also in body)
//   DELETE /api/main/tasks/{taskId}    (task_id also in body, soft delete)
// Listing is NOT officially documented: we best-effort the internal
// `GET /telecom/api/v1/users/{telecomUserId}/tasks` and degrade to the local
// projection (`planipret_tasks_projection`) or `tasks_unavailable`.
//
// All business logic lives in ../_shared/planipret-task-handler.ts (unit tested).
// Body: { action: "list" | "get" | "create" | "update" | "delete", ... }
import { authBroker, corsHeaders, jsonResponse, supaAdmin } from "../_shared/ns-broker.ts";
import { getUserMaestroAccessToken } from "../_shared/maestro-oauth.ts";
import { resolveMaestroIdForUser, resolveTelecomUserId } from "../_shared/maestro-broker-directory.ts";
import { normalizeTask } from "../_shared/planipret-tasks.ts";
import { handleTaskRequest, newCorrelationId, type UpstreamList } from "../_shared/planipret-task-handler.ts";

const API_BASE = (Deno.env.get("PLANIPRET_API_BASE_URL") ?? "https://client.planipret.com").replace(/\/$/, "");
const TELECOM_BASE = (Deno.env.get("MAESTRO_TELECOM_BASE_URL") ?? "https://client.planipret.com/telecom/api/v1").replace(/\/$/, "");
const TIMEOUT_MS = 15_000;

type Admin = ReturnType<typeof supaAdmin>;

async function planipretToken(admin: Admin, userId: string): Promise<string | null> {
  const oauth = await getUserMaestroAccessToken(admin, userId).catch(() => null);
  if (oauth) return oauth;
  const env = Deno.env.get("PLANIPRET_ACCESS_TOKEN") ?? "";
  return env || null;
}

function makeApiFetch(token: string | null) {
  return async (path: string, init: { method: string; body?: string }) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: init.method,
        body: init.body,
        signal: ctrl.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      });
      const text = await res.text();
      let data: any = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 500) }; }
      return { status: res.status, ok: res.ok, data };
    } catch (e) {
      const aborted = String(e).includes("Abort");
      return { status: aborted ? 408 : 599, ok: false, data: { message: aborted ? "timeout" : String(e) } };
    } finally {
      clearTimeout(timer);
    }
  };
}

/**
 * Listing by maestro id. Planiprêt documents no public GET, so we walk the
 * known internal read paths in order and keep the first one that answers.
 */
let noUpstreamListUntil = 0; // negative cache: upstream exposes no GET (404/405)

/** Maestro may return a plain array or a Laravel-style paginated envelope. */
function extractTaskRows(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const candidates = [
    payload.tasks,
    payload.items,
    payload.results,
    payload.data,
    payload.data?.tasks,
    payload.data?.items,
    payload.data?.results,
    payload.data?.data,
    payload.response?.data,
    payload.response?.tasks,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  // Some Maestro deployments wrap paginator data more than once
  // (`data.data`, `data.tasks.data`, `response.data.items`, ...). Walk only
  // conventional envelope keys so unrelated metadata arrays cannot be tasks.
  const envelopeKeys = ["data", "tasks", "items", "results", "response", "payload"];
  const seen = new Set<any>();
  const walk = (value: any, depth: number): any[] => {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== "object" || depth > 5 || seen.has(value)) return [];
    seen.add(value);
    for (const key of envelopeKeys) {
      const found = walk(value[key], depth + 1);
      if (found.length) return found;
    }
    return [];
  };
  const nested = walk(payload, 0);
  if (nested.length) return nested;
  return [];
}

function makeListFetch(token: string | null) {
  return async (
    maestroId: string,
    opts: { status?: string | null; from?: string | null; to?: string | null },
  ): Promise<UpstreamList> => {
    const qs = new URLSearchParams();
    if (opts.status) qs.set("status", opts.status);
    if (opts.from) qs.set("from", opts.from);
    if (opts.to) qs.set("to", opts.to);
    qs.set("limit", "200");
    const suffix = qs.toString() ? `?${qs.toString()}` : "";

    // Measured on production (broker 393): the Task List API scopes reads with
    // singular `user_id`. `users_id` is used by task writes but returns an empty
    // page on GET, as does `xid=&type=user`; empty 200s must not short-circuit.
    const candidates = [
      `${API_BASE}/api/main/tasks${suffix}${suffix ? "&" : "?"}user_id=${maestroId}`,
      `${API_BASE}/api/main/tasks${suffix}${suffix ? "&" : "?"}users_id=${maestroId}`,
      `${TELECOM_BASE}/users/${maestroId}/tasks${suffix}`,
      `${API_BASE}/telecom/api/v1/users/${maestroId}/tasks${suffix}`,
      `${API_BASE}/api/main/tasks${suffix}${suffix ? "&" : "?"}xid=${maestroId}&type=user`,
      `${API_BASE}/api/main/users/${maestroId}/tasks${suffix}`,
    ];


    if (Date.now() < noUpstreamListUntil) {
      return { ok: false, tasks: [], endpoint: null, status: 405 };
    }

    let lastStatus = 0;
    let allMissing = true;
    let emptyOk: UpstreamList | null = null;
    for (const url of candidates) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          signal: ctrl.signal,
        });
        lastStatus = res.status;
        if (!res.ok) {
          if (res.status !== 404 && res.status !== 405 && res.status !== 501) allMissing = false;
          continue;
        }
        allMissing = false;
        const j = await res.json().catch(() => null);
        const tasks = extractTaskRows(j).map(normalizeTask).filter((t: any) => t.id);
        console.info("[planipret-task-api] list probe", {
          endpoint: url.split("?")[0],
          maestroId,
          status: res.status,
          topLevelKeys: j && typeof j === "object" && !Array.isArray(j) ? Object.keys(j).slice(0, 20) : [],
          extracted: tasks.length,
        });
        const out = { ok: true, tasks, endpoint: url.split("?")[0], status: res.status };
        if (tasks.length) return out;
        // 200 but empty: remember it and keep probing the other shapes.
        emptyOk = emptyOk ?? out;
      } catch {
        lastStatus = 599;
        allMissing = false;
      } finally {
        clearTimeout(timer);
      }
    }
    if (emptyOk) return emptyOk;
    // Every documented/known read route answered 404/405 → stop hammering
    // Planiprêt for 10 minutes and serve the local mirror instead.
    if (allMissing) noUpstreamListUntil = Date.now() + 10 * 60 * 1000;
    return { ok: false, tasks: [], endpoint: null, status: lastStatus };

  };
}

/**
 * Single-task read. Maestro exposes no documented GET, so we walk every known
 * shape and report which one answered (used by the "visible dans Maestro" badge).
 */
function makeSingleFetch(token: string | null, telecomBase: string) {
  return async (taskId: string, telecomId: string | null) => {
    const paths = [
      `${API_BASE}/api/main/tasks/${encodeURIComponent(taskId)}`,
      `${API_BASE}/api/main/task/${encodeURIComponent(taskId)}`,
      `${API_BASE}/api/main/tasks?task_id=${encodeURIComponent(taskId)}`,
      ...(telecomId
        ? [
            `${telecomBase}/users/${telecomId}/tasks/${encodeURIComponent(taskId)}`,
            `${telecomBase}/tasks/${encodeURIComponent(taskId)}`,
          ]
        : []),
    ];
    let lastStatus = 0;
    for (const url of paths) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          signal: ctrl.signal,
        });
        lastStatus = res.status;
        if (!res.ok) continue;
        const j = await res.json().catch(() => null);
        const raw = Array.isArray(j) ? j[0] : (j?.data ?? j?.task ?? j);
        const row = Array.isArray(raw) ? raw[0] : raw;
        if (row && (row.id || row.task_id)) {
          return { ok: true, task: normalizeTask(row), endpoint: url.split("?")[0], status: res.status };
        }
      } catch {
        lastStatus = 599;
      } finally {
        clearTimeout(timer);
      }
    }
    return { ok: false, task: null, endpoint: null, status: lastStatus };
  };
}



/**
 * Client List API — the only source of truth for valid task targets
 * (`task_targets.user` and `task_targets.contracts`).
 */
function makeClientTargetsFetch(token: string | null) {
  return async (telecomId: string | null, search?: string | null): Promise<any[]> => {
    if (!telecomId) return [];
    const q = search ? `?search=${encodeURIComponent(search)}&limit=200` : "?limit=200";
    const urls = [
      `${TELECOM_BASE}/users/${telecomId}/clients${q}`,
      `${API_BASE}/telecom/api/v1/users/${telecomId}/clients${q}`,
    ];
    for (const url of urls) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          signal: ctrl.signal,
        });
        if (!res.ok) continue;
        const j = await res.json().catch(() => null);
        const raw = Array.isArray(j) ? j : (j?.clients ?? j?.data ?? j?.items ?? j?.results ?? []);
        if (Array.isArray(raw)) return raw;
      } catch { /* try next */ } finally { clearTimeout(timer); }
    }
    return [];
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse({ success: false, error: "method_not_allowed" }, 405);
  }

  const auth = await authBroker(req);
  if ("error" in auth) return auth.error;
  const { admin, userId, profile } = auth as { admin: Admin; userId: string; profile: any };

  // GET is the read-only listing surface:
  //   GET ?maestro_id=387460525&filter=today&page=1&limit=20&status=pending
  let body: any = {};
  if (req.method === "GET") {
    const q = new URL(req.url).searchParams;
    body = Object.fromEntries(q.entries());
    body.action = body.action ?? "list";
  } else {
    body = await req.json().catch(() => ({} as any));
  }
  const correlation_id = String(body?.correlation_id ?? newCorrelationId());

  try {
    const token = await planipretToken(admin, userId);
    const out = await handleTaskRequest({ ...body, correlation_id }, {
      admin,
      userId,
      profile,
      token,
      apiFetch: makeApiFetch(token),
      listFetch: makeListFetch(token),
      singleFetch: makeSingleFetch(token, TELECOM_BASE),
      clientTargetsFetch: makeClientTargetsFetch(token),
      resolveTelecomUserId: async (candidate) => {
        const r = await resolveTelecomUserId(admin, userId, { candidate });
        return r?.id ?? null;
      },
      listAllowedAssignees: async () => {
        // Maestro rule: self only, plus assistants explicitly authorized to
        // work under this broker's profile.
        const ids = new Set<string>();
        const { data: full } = await admin.from("planipret_profiles")
          .select("maestro_broker_id, maestro_telecom_user_id").eq("id", profile?.id).maybeSingle();
        for (const v of [profile?.maestro_broker_id, (full as any)?.maestro_broker_id, (full as any)?.maestro_telecom_user_id]) {
          const s = String(v ?? "").trim();
          if (s) ids.add(s);
        }
        try {
          const r = await resolveMaestroIdForUser(admin, userId, {});
          if (r?.maestro_broker_id) ids.add(String(r.maestro_broker_id));
        } catch { /* ignore */ }
        try {
          const { data: rows } = await admin.from("planipret_task_assistants")
            .select("assistant_maestro_id").eq("owner_user_id", userId).eq("active", true);
          for (const row of rows ?? []) {
            const s = String((row as any).assistant_maestro_id ?? "").trim();
            if (s) ids.add(s);
          }
        } catch { /* table may be empty */ }
        return [...ids];
      },
      resolveTaskAssigneeId: async () => {
        // Force an email-backed directory match instead of trusting the CRM id
        // previously copied into maestro_telecom_user_id.
        const r = await resolveMaestroIdForUser(admin, userId, { force: true });
        return r?.maestro_broker_id ?? null;
      },
    });
    return jsonResponse(out.body, out.status);
  } catch (e) {
    console.error("[planipret-task-api]", correlation_id, e);
    return jsonResponse({ success: false, error: "server_error", message: String(e), correlation_id }, 200);
  }
});
