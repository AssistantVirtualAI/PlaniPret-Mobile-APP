import { describe, it, expect, beforeEach, vi } from "vitest";
import { handleTaskRequest, type TaskDeps } from "../../supabase/functions/_shared/planipret-task-handler";
import { createMockAdmin } from "./mockSupabaseAdmin";

const USER = "user-1";
const OTHER = "user-2";

function makeDeps(over: Partial<TaskDeps> & { apiResponses?: any[] } = {}) {
  const admin = over.admin ?? createMockAdmin();
  const calls: Array<{ path: string; init: any }> = [];
  const queue = over.apiResponses ?? [{ status: 200, ok: true, data: { data: { id: 946044 } } }];
  const apiFetch = vi.fn(async (path: string, init: any) => {
    calls.push({ path, init });
    return queue.length > 1 ? queue.shift() : queue[0];
  });
  const deps: TaskDeps = {
    admin,
    userId: USER,
    profile: { id: "profile-1", role: "broker", maestro_broker_id: "387460525" },
    token: "tok",
    apiFetch: apiFetch as any,
    listFetch: async () => ({
      ok: true,
      tasks: [{ id: 946044, users: [{ id: 93135 }], xid: 387460525, type: "user" }],
      endpoint: "/api/main/tasks",
      status: 200,
    }),
    resolveTelecomUserId: async () => "387460525",
    resolveTaskAssigneeId: async () => "93135",
    ...over,
  };
  return { deps, admin, apiFetch, calls };
}

const validCreate = {
  action: "create",
  xid: 387460525,
  type: "user",
  date: "2026-09-01 10:00:00",
  notes: "Appeler Jean",
};

describe("planipret task handler — create", () => {
  it("posts a valid payload to POST /api/main/tasks", async () => {
    const listFetch = vi.fn(async () => ({
      ok: true,
      tasks: [{ id: 946044, users: [{ id: 93135 }], xid: 387460525, type: "user" }],
      endpoint: "/api/main/tasks",
      status: 200,
    }));
    const { deps, calls } = makeDeps({ listFetch });
    const out = await handleTaskRequest(validCreate, deps);
    expect(out.body.success).toBe(true);
    expect(out.body.task_id).toBe("946044");
    expect(calls[0].path).toBe("/api/main/tasks");
    expect(calls[0].init.method).toBe("POST");
    const payload = JSON.parse(calls[0].init.body);
    expect(payload).toMatchObject({ xid: 387460525, type: "user", date: "2026-09-01 10:00:00", notes: "Appeler Jean" });
    expect(payload.users_id).toBe(93135);
    // Notifications / calendar sync are opt-in only and must be explicitly off
    // because Maestro otherwise enables some notification defaults server-side.
    expect(payload.send_notification).toBe(0);
    expect(payload.sync_cal).toBe(0);
    expect(listFetch).toHaveBeenCalledWith("93135", expect.objectContaining({
      status: null, type: "user", findTaskId: "946044",
    }));
  });

  it("retries the documented list with the sent assignee while Maestro indexes a new task", async () => {
    const listFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        tasks: [{ id: 111, users: [{ id: 93135 }], xid: 123, type: "user" }],
        endpoint: "/api/main/tasks",
        status: 200,
      })
      .mockResolvedValueOnce({
        ok: true,
        tasks: [{ id: 946044, users: [{ id: 93135 }], xid: 387460525, type: "user" }],
        endpoint: "/api/main/tasks",
        status: 200,
      });
    const wait = vi.fn(async () => undefined);
    const { deps } = makeDeps({ listFetch, wait });

    const out = await handleTaskRequest(validCreate, deps);

    expect(out.body).toMatchObject({ success: true, read_back: true, visible_in_maestro: true });
    expect(listFetch).toHaveBeenCalledTimes(2);
    expect(listFetch).toHaveBeenNthCalledWith(1, "93135", expect.objectContaining({ findTaskId: "946044" }));
    expect(wait).toHaveBeenCalledWith(800);
  });

  it("reads every documented status so an immediately-open task is confirmed", async () => {
    const listFetch = vi.fn(async (_assignee: string, options: any) => {
      // The Task API adapter receives no fixed status and is therefore required
      // to query pending, open and complete rather than the undocumented `all`.
      expect(options).toMatchObject({ status: null, type: "user", findTaskId: "946044" });
      return {
        ok: true,
        tasks: [{
          referral_option_id: 946044,
          type: "user",
          xid: 387460525,
          delegate_users_id: 93135,
          status: "open",
        }],
        endpoint: "/api/main/tasks",
        status: 200,
      };
    });
    const { deps } = makeDeps({ listFetch });

    const out = await handleTaskRequest(validCreate, deps);

    expect(out.body).toMatchObject({ success: true, read_back: true, visible_in_maestro: true });
    expect((out.body as any).diagnostics.returned_assignees).toContain("93135");
  });

  it("returns validation_failed (422 equivalent) when notes are missing", async () => {
    const { deps, apiFetch } = makeDeps();
    const out = await handleTaskRequest({ ...validCreate, notes: "" }, deps);
    expect(out.body.success).toBe(false);
    expect(out.body.error).toBe("validation_failed");
    expect((out.body as any).fields.notes).toBe("notes_required");
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("maps an upstream 422 to a readable error", async () => {
    const { deps } = makeDeps({ apiResponses: [{ status: 422, ok: false, data: { message: "invalid" } }] });
    const out = await handleTaskRequest(validCreate, deps);
    expect(out.body).toMatchObject({ success: false, error: "validation_failed", status: 422 });
  });

  it("preserves an explicitly selected assignee when it is an authorized assistant", async () => {
    const { deps, calls } = makeDeps({ listAllowedAssignees: async () => ["387460525", "77"] } as any);
    await handleTaskRequest({ ...validCreate, users_id: 77 }, deps);
    expect(JSON.parse(calls[0].init.body).users_id).toBe(77);
  });

  it("refuses an assignee that is neither the broker nor an authorized assistant", async () => {
    const { deps, apiFetch } = makeDeps({ listAllowedAssignees: async () => ["387460525"] } as any);
    const out = await handleTaskRequest({ ...validCreate, users_id: 999999 }, deps);
    expect(out.body).toMatchObject({ success: false, error: "assignee_not_allowed" });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("still allows self-assignment when no assistant resolver is configured", async () => {
    const { deps, calls } = makeDeps({ listAllowedAssignees: undefined } as any);
    const out = await handleTaskRequest({ ...validCreate, users_id: "93135" }, deps);
    expect(out.body.success).toBe(true);
    expect(String(JSON.parse(calls[0].init.body).users_id)).toBe("93135");
  });

  it("refuses an xid outside the broker scope", async () => {
    const admin = createMockAdmin({
      planipret_profiles: [{ id: "profile-1", maestro_broker_id: "387460525", maestro_telecom_user_id: "93135" }],
    });
    const { deps, apiFetch } = makeDeps({ admin });
    const out = await handleTaskRequest({ ...validCreate, xid: 999999 }, deps);
    expect(out.body.error).toBe("xid_out_of_scope");
    expect(apiFetch).not.toHaveBeenCalled();
    expect(admin.db.planipret_audit_log?.[0].action).toBe("task_create_denied");
  });

  it("rejects mutations when the Planiprêt token is missing/expired", async () => {
    const { deps } = makeDeps({ token: null });
    const out = await handleTaskRequest(validCreate, deps);
    expect(out.body.error).toBe("planipret_unauthorized");
  });
});

describe("planipret task handler — list scope", () => {
  it("queries tasks with the internal Maestro telecom id", async () => {
    const listFetch = vi.fn(async () => ({ ok: true as const, tasks: [], endpoint: "/api/main/tasks", status: 200 }));
    const { deps } = makeDeps({
      listFetch,
      resolveTelecomUserId: async () => "93135",
    });
    await handleTaskRequest({ action: "list", filter: "all" }, deps);
    expect(listFetch).toHaveBeenCalledWith("93135", expect.any(Object));
  });
});

describe("planipret task handler — idempotency", () => {
  it("double tap / retry creates the task only once", async () => {
    const { deps, apiFetch } = makeDeps();
    const a = await handleTaskRequest(validCreate, deps);
    const b = await handleTaskRequest(validCreate, deps);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(a.body.task_id).toBe(b.body.task_id);
    expect((b.body as any).replayed).toBe(true);
  });

  it("replayed AVA tool-call deletes only once", async () => {
    const { deps, apiFetch } = makeDeps();
    const body = { action: "delete", task_id: "946044", source: "ava_voice" };
    const a = await handleTaskRequest(body, deps);
    const b = await handleTaskRequest(body, deps);
    expect(a.body).toMatchObject({ success: true, deleted: true });
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect((b.body as any).replayed).toBe(true);
  });

  it("concurrent requests with the same key do not double-post", async () => {
    const { deps, apiFetch } = makeDeps();
    const [a, b] = await Promise.all([
      handleTaskRequest(validCreate, deps),
      handleTaskRequest(validCreate, deps),
    ]);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect([a.body.success, b.body.success]).toEqual([true, false]);
    expect((b.body as any).error).toBe("mutation_in_flight");
  });
});

describe("planipret task handler — update & delete", () => {
  it("puts task_id in the URL and in the body", async () => {
    const { deps, calls } = makeDeps();
    const out = await handleTaskRequest(
      { action: "update", task_id: "946044", changes: { date: "2026-09-05 09:30:00", notes: "Déplacée" } },
      deps,
    );
    expect(out.body.success).toBe(true);
    expect(calls[0].path).toBe("/api/main/tasks/946044");
    expect(calls[0].init.method).toBe("PUT");
    expect(JSON.parse(calls[0].init.body)).toMatchObject({ task_id: 946044, date: "2026-09-05 09:30:00", notes: "Déplacée" });
  });

  it("rejects an update with no updatable field", async () => {
    const { deps } = makeDeps();
    const out = await handleTaskRequest({ action: "update", task_id: "1", changes: { foo: "bar" } }, deps);
    expect(out.body.error).toBe("validation_failed");
  });

  it("allows delete for a broker and soft-deletes the projection row", async () => {
    const admin = createMockAdmin({
      planipret_tasks_projection: [{ user_id: USER, task_id: "946044", deleted_at: null, payload: { id: "946044" } }],
    });
    const { deps, calls } = makeDeps({ admin });
    const out = await handleTaskRequest({ action: "delete", task_id: "946044" }, deps);
    expect(out.body).toMatchObject({ success: true, deleted: true });
    expect(calls[0].init.method).toBe("DELETE");
    expect(JSON.parse(calls[0].init.body)).toEqual({ task_id: 946044 });
    expect(admin.db.planipret_tasks_projection[0].deleted_at).toBeTruthy();
  });

  it("forbids delete for the assistant role", async () => {
    const { deps, apiFetch } = makeDeps({
      profile: { id: "profile-1", role: "assistant", maestro_broker_id: "387460525" },
    });
    const out = await handleTaskRequest({ action: "delete", task_id: "946044" }, deps);
    expect(out.body.error).toBe("role_forbidden");
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe("planipret task handler — list & isolation", () => {
  let admin: ReturnType<typeof createMockAdmin>;
  beforeEach(() => {
    admin = createMockAdmin({
      planipret_tasks_projection: [
        { user_id: USER, task_id: "1", deleted_at: null, payload: { id: "1", notes: "Mine", date: "2026-09-01 10:00:00", status: "pending" } },
        { user_id: OTHER, task_id: "2", deleted_at: null, payload: { id: "2", notes: "Theirs", date: "2026-09-01 10:00:00", status: "pending" } },
      ],
    });
  });

  it("falls back to the projection when the upstream list is unavailable", async () => {
    const { deps } = makeDeps({
      admin,
      listFetch: async () => ({ ok: false, tasks: [], endpoint: null, status: 503 }),
    });
    const out = await handleTaskRequest({ action: "list", filter: "all" }, deps);
    expect(out.body.source).toBe("projection");
    expect((out.body as any).tasks).toHaveLength(1);
    expect((out.body as any).tasks[0].notes).toBe("Mine"); // multi-tenant isolation
    expect(out.body.message).toBeTruthy();
  });

  it("reports tasks_unavailable when neither API nor projection has data", async () => {
    const { deps } = makeDeps({
      admin: createMockAdmin(),
      listFetch: async () => ({ ok: false, tasks: [], endpoint: null, status: 503 }),
    });
    const out = await handleTaskRequest({ action: "list" }, deps);
    expect(out.body.source).toBe("unavailable");
    expect(out.body.error).toBe("tasks_unavailable");
  });

  it("uses the API and mirrors it into the projection when the list works", async () => {
    const { deps } = makeDeps({
      admin,
      listFetch: async () => ({
        ok: true,
        endpoint: "/telecom/api/v1/users/387460525/tasks",
        status: 200,
        tasks: [{ id: "9", notes: "Live", date: "2026-09-02 10:00:00", status: "pending" }],
      }),
    });
    const out = await handleTaskRequest({ action: "list", filter: "all" }, deps);
    expect(out.body.source).toBe("api");
    expect((out.body as any).tasks[0].id).toBe("9");
  });

  it("buckets and paginates", async () => {
    const now = new Date("2026-09-02T15:00:00Z");
    const { deps } = makeDeps({
      now: () => now,
      listFetch: async () => ({
        ok: true, endpoint: "x", status: 200,
        tasks: [
          { id: "a", notes: "late", date: "2026-08-30 10:00:00", status: "pending" },
          { id: "b", notes: "today", date: "2026-09-02 18:00:00", status: "pending" },
          { id: "c", notes: "later", date: "2026-09-20 10:00:00", status: "pending" },
        ],
      }),
    });
    const out = await handleTaskRequest({ action: "list", filter: "all", limit: 2 }, deps);
    expect((out.body as any).counts).toMatchObject({ overdue: 1, today: 1, upcoming: 1, open: 3 });
    expect((out.body as any).tasks).toHaveLength(2);
    expect(out.body.has_more).toBe(true);
  });

  it("get only returns a task owned by the caller", async () => {
    const { deps } = makeDeps({ admin });
    const mine = await handleTaskRequest({ action: "get", task_id: "1" }, deps);
    const theirs = await handleTaskRequest({ action: "get", task_id: "2" }, deps);
    expect(mine.body.success).toBe(true);
    expect(theirs.body.error).toBe("task_not_found");
  });
});

describe("planipret task handler — audit", () => {
  it("never writes task notes into the audit metadata", async () => {
    const admin = createMockAdmin();
    const { deps } = makeDeps({ admin });
    await handleTaskRequest(validCreate, deps);
    const log = admin.db.planipret_audit_log ?? [];
    expect(log.length).toBeGreaterThan(0);
    expect(JSON.stringify(log)).not.toContain("Appeler Jean");
  });
});

describe("planipret task handler — contract scope + live get", () => {
  it("refuses a contract task whose xid is not mapped to the broker", async () => {
    const { deps, apiFetch } = makeDeps();
    const out = await handleTaskRequest(
      { action: "create", xid: 999111, type: "contract", date: "2026-09-01 10:00:00", notes: "Suivi contrat" },
      deps,
    );
    expect(out.body.success).toBe(false);
    expect(out.body.error).toBe("target_mapping_required");
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("allows a contract task when the contract is in the broker's pipeline", async () => {
    const admin = createMockAdmin({
      planipret_pipeline: [{ id: "p1", user_id: USER, maestro_contact_id: "999111" }],
    });
    const { deps, apiFetch } = makeDeps({ admin });
    const out = await handleTaskRequest(
      { action: "create", xid: 999111, type: "contract", date: "2026-09-01 10:00:00", notes: "Suivi contrat" },
      deps,
    );
    expect(out.body.success).toBe(true);
    expect(apiFetch).toHaveBeenCalled();
  });

  it("get reads the live source first and falls back to the projection", async () => {
    const live = { deps: null as any };
    const { deps } = makeDeps({
      listFetch: async () => ({
        ok: true,
        tasks: [{ id: 555, notes: "Live task", date: "2026-09-02 09:00:00", type: "user", xid: 387460525 }],
        endpoint: "/users/387460525/tasks",
        status: 200,
      }),
    });
    void live;
    const out = await handleTaskRequest({ action: "get", task_id: "555" }, deps);
    expect(out.body.success).toBe(true);
    expect(out.body.source).toBe("api");

    const offline = makeDeps({
      admin: createMockAdmin({
        planipret_tasks_projection: [
          { user_id: USER, task_id: "777", deleted_at: null, payload: { id: 777, notes: "Cached", type: "user" } },
        ],
      }),
      listFetch: async () => ({ ok: false, tasks: [], endpoint: null, status: 500 }),
    });
    const out2 = await handleTaskRequest({ action: "get", task_id: "777" }, offline.deps);
    expect(out2.body.success).toBe(true);
    expect(out2.body.source).toBe("projection");
  });
});
