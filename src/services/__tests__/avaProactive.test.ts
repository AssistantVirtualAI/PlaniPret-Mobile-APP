import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();
const insert = vi.fn(() => Promise.resolve({ error: null }));
const from = vi.fn((_table: string) => ({ insert }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (name: string, opts?: any) => invoke(name, opts) },
    from: (table: string) => from(table),
  },
}));

import { callAva, applyAvaSuggestion } from "../avaProactive";

describe("callAva", () => {
  beforeEach(() => {
    invoke.mockReset();
    insert.mockClear();
    from.mockClear();
  });

  it("returns normalized response", async () => {
    invoke.mockResolvedValue({ data: { reply: "hi", suggestions: [{ id: "1", label: "x", kind: "call" }] }, error: null });
    const r = await callAva({ message: "hello" });
    expect(r.reply).toBe("hi");
    expect(r.suggestions).toHaveLength(1);
  });

  it("returns fallback on error", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "boom" } });
    const r = await callAva({ message: "hello" });
    expect(r.reply).toMatch(/problème/i);
    expect(r.suggestions).toEqual([]);
  });
});

describe("applyAvaSuggestion", () => {
  const ctx = {
    openDialer: vi.fn(),
    openAva: vi.fn(),
    openCoach: vi.fn(),
    navigateSms: vi.fn(),
    userId: "user-1",
  };
  beforeEach(() => {
    Object.values(ctx).forEach((v: any) => v.mockReset?.());
    invoke.mockReset();
    insert.mockClear();
  });

  it("routes call → openDialer", async () => {
    const r = await applyAvaSuggestion({ id: "1", label: "Appeler", kind: "call", payload: { number: "+15145551234" } }, ctx);
    expect(ctx.openDialer).toHaveBeenCalledWith("+15145551234");
    expect(r.ok).toBe(true);
  });

  it("routes sms → navigateSms", async () => {
    await applyAvaSuggestion({ id: "1", label: "SMS", kind: "sms", payload: { number: "+1", text: "hi" } }, ctx);
    expect(ctx.navigateSms).toHaveBeenCalledWith("+1", "hi");
  });

  it("creates reminder via supabase insert", async () => {
    const r = await applyAvaSuggestion({ id: "1", label: "R", kind: "reminder", payload: { title: "Rappeler client" } }, ctx);
    expect(insert).toHaveBeenCalled();
    expect(r.ok).toBe(true);
  });

  it("rejects call without number", async () => {
    const r = await applyAvaSuggestion({ id: "1", label: "x", kind: "call", payload: {} }, ctx);
    expect(r.ok).toBe(false);
  });

  it("routes maestro_action via invoke", async () => {
    invoke.mockResolvedValue({ data: { message: "ok" }, error: null });
    const r = await applyAvaSuggestion({ id: "1", label: "M", kind: "maestro_action", payload: { action: "x" } }, ctx);
    expect(invoke).toHaveBeenCalledWith("maestro-pipeline-orchestrator", expect.any(Object));
    expect(r.ok).toBe(true);
  });
});
