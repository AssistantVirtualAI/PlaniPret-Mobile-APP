import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(async (_name: string, req: any) => ({
    data: { ok: true, status: 200, data: {}, meta: null, links: null, error: null },
    error: null,
    status: 200,
  })),
}));

vi.mock("@/lib/safeEdgeFunction", () => ({ safeEdgeFunction: invokeMock }));

import {
  MAESTRO_OFFICIAL_ACTIONS,
  addresses,
  clients,
  commissions,
  contracts,
  financialInstitutions,
  tasks,
  telephones,
} from "@/lib/planipret/maestroScribe";

describe("Maestro official API mobile contract", () => {
  beforeEach(() => invokeMock.mockClear());

  it("expose exactement les 20 opérations documentées", () => {
    expect(MAESTRO_OFFICIAL_ACTIONS).toHaveLength(20);
    expect(new Set(MAESTRO_OFFICIAL_ACTIONS).size).toBe(20);
  });

  it("route chaque opération via pp-maestro-scribe sans préfixe client", async () => {
    await clients.get(1);
    await clients.create({ first_name: "Test" });
    await clients.update(1, { first_name: "Test" });
    await addresses.create(1, {});
    await addresses.update(1, 2, {});
    await addresses.remove(1, 2);
    await telephones.create(1, {});
    await telephones.update(1, 2, {});
    await telephones.remove(1, 2);
    await contracts.list();
    await contracts.create({});
    await contracts.update(1, {});
    await contracts.remove(1);
    await financialInstitutions.list();
    await commissions.deposits();
    await commissions.agents();
    await tasks.list();
    await tasks.create({});
    await tasks.update(1, {});
    await tasks.remove(1);

    expect(invokeMock).toHaveBeenCalledTimes(20);
    const actions = invokeMock.mock.calls.map(([, req]) => req.body.action);
    expect(actions).toEqual([...MAESTRO_OFFICIAL_ACTIONS]);
    for (const [, req] of invokeMock.mock.calls) {
      expect(req.body).not.toHaveProperty("prefix");
    }
  });
});
