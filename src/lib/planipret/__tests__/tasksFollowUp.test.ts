import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeEdgeMock } = vi.hoisted(() => ({
  invokeEdgeMock: vi.fn(),
}));

vi.mock("@/lib/planipret/edgeAuth", () => ({ invokeEdge: invokeEdgeMock }));

import { createClientFollowUpTask } from "@/lib/planipret/tasks";

describe("createClientFollowUpTask", () => {
  beforeEach(() => invokeEdgeMock.mockReset());

  it("résout la cible user officielle avant de créer", async () => {
    invokeEdgeMock
      .mockResolvedValueOnce({
        data: { targets: [{ client_id: "123", name: "Jane Doe", user: { id: "511", eligible_broker_ids: [] }, contracts: [] }] },
        error: null,
        unauthorized: false,
      })
      .mockResolvedValueOnce({ data: { success: true, task_id: "781150" }, error: null, unauthorized: false });

    const result = await createClientFollowUpTask({
      maestro_client_id: "123",
      client_name: "Jane Doe",
      notes: "Faire un suivi",
      due_at: "2026-09-16T13:00:00.000Z",
    });

    expect(result.success).toBe(true);
    expect(invokeEdgeMock).toHaveBeenNthCalledWith(1, "planipret-task-api", { action: "client_targets", search: "Jane Doe" });
    expect(invokeEdgeMock).toHaveBeenNthCalledWith(2, "planipret-task-api", expect.objectContaining({
      action: "create",
      xid: "511",
      type: "user",
      notes: "Faire un suivi",
    }));
  });

  it("utilise un contrat quand aucune cible user n’existe", async () => {
    invokeEdgeMock
      .mockResolvedValueOnce({
        data: { targets: [{ client_id: "123", name: "Jane Doe", user: null, contracts: [{ id: "288984", number: "P-1" }] }] },
        error: null,
        unauthorized: false,
      })
      .mockResolvedValueOnce({ data: { success: true }, error: null, unauthorized: false });

    await createClientFollowUpTask({ maestro_client_id: "123", notes: "Relancer" });
    expect(invokeEdgeMock).toHaveBeenNthCalledWith(2, "planipret-task-api", expect.objectContaining({ xid: "288984", type: "contract" }));
  });

  it("refuse un id client sans cible Maestro autorisée", async () => {
    invokeEdgeMock.mockResolvedValueOnce({ data: { targets: [] }, error: null, unauthorized: false });
    const result = await createClientFollowUpTask({ maestro_client_id: "123", notes: "Relancer" });
    expect(result).toMatchObject({ success: false, error: "task_target_not_found" });
    expect(invokeEdgeMock).toHaveBeenCalledTimes(1);
  });
});
