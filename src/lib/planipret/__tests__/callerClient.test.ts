import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, getSession } = vi.hoisted(() => ({
  invoke: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke },
    auth: { getSession },
  },
}));

describe("callerClient — isolation par session", () => {
  beforeEach(() => {
    vi.resetModules();
    invoke.mockReset();
    getSession.mockReset();
  });

  it("never reuses broker A's caller result for broker B", async () => {
    getSession.mockResolvedValueOnce({ data: { session: { user: { id: "broker-a" } } } });
    invoke.mockResolvedValueOnce({ data: { found: true, client_id: "101", name: "Client A" }, error: null });

    const mod = await import("../callerClient");
    await expect(mod.resolveCallerClient("+1 514 555 0101")).resolves.toEqual({
      found: true, maestroClientId: "101", name: "Client A",
    });

    getSession.mockResolvedValueOnce({ data: { session: { user: { id: "broker-b" } } } });
    invoke.mockResolvedValueOnce({ data: { found: true, client_id: "202", name: "Client B" }, error: null });

    await expect(mod.resolveCallerClient("+1 514 555 0101")).resolves.toEqual({
      found: true, maestroClientId: "202", name: "Client B",
    });
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("does not expose any cached caller result without an authenticated session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const mod = await import("../callerClient");

    await expect(mod.resolveCallerClient("+1 514 555 0101")).resolves.toEqual({
      found: false, maestroClientId: null, name: null,
    });
    expect(invoke).not.toHaveBeenCalled();
  });
});
