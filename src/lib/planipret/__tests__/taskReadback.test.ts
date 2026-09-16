import { describe, expect, it, vi } from "vitest";
import { handleTaskRequest } from "../../../../supabase/functions/_shared/planipret-task-handler";

function mockAdmin() {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    in: () => chain,
    not: () => chain,
    order: () => chain,
    limit: () => chain,
    update: () => chain,
    upsert: () => chain,
    insert: () => ({ error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  };
  return { from: vi.fn(() => chain) };
}

function depsWithList(tasks: any[]) {
  return {
    admin: mockAdmin(),
    userId: "user-1",
    profile: { id: "profile-1", maestro_broker_id: "67", maestro_telecom_user_id: "67", role: "broker" },
    token: "session-token",
    apiFetch: vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      data: { success: true, data: { task_id: 781150, xid: 67, referral_status: "pending" } },
    }),
    listFetch: vi.fn().mockResolvedValue({ ok: true, status: 200, endpoint: "https://client.planipret.com/api/main/tasks", tasks }),
    resolveTelecomUserId: vi.fn().mockResolvedValue("67"),
    resolveTaskAssigneeId: vi.fn().mockResolvedValue("67"),
    listAllowedAssignees: vi.fn().mockResolvedValue(["67"]),
    clientTargetsFetch: vi.fn().mockResolvedValue([]),
    now: () => new Date("2026-09-16T14:00:00.000Z"),
  };
}

const createBody = {
  action: "create",
  source: "ava",
  xid: "67",
  type: "user",
  notes: "Rappeler le client",
  due_at: "2026-09-17T14:00:00.000Z",
  idempotency_key: "test-readback-key",
};

describe("authoritative Maestro task confirmation", () => {
  it("does not declare a POST receipt as a created reminder without list read-back", async () => {
    const result = await handleTaskRequest(createBody, depsWithList([]));

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      success: false,
      error: "maestro_readback_unconfirmed",
      pending_confirmation: true,
      read_back: false,
      visible_in_maestro: false,
      task_id: "781150",
    });
  });

  it("confirms the reminder only when documented GET /api/main/tasks returns referral_option_id", async () => {
    const result = await handleTaskRequest(createBody, depsWithList([{
      referral_option_id: 781150,
      xid: 67,
      type: "user",
      delegate_users_id: 67,
      notes: "Rappeler le client",
      date: "2026-09-17 10:00:00",
      status: "pending",
    }]));

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      success: true,
      pending_confirmation: false,
      read_back: true,
      visible_in_maestro: true,
      task_id: "781150",
      task: { id: "781150" },
    });
  });
});
