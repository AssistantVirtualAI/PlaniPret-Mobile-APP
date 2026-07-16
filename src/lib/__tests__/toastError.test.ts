import { describe, it, expect, vi, beforeEach } from "vitest";

const toastErr = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...a: any[]) => toastErr(...a) } }));

import { toastError, isAvaBudgetBlocked, noteAvaBudgetError } from "../toastError";

describe("toastError", () => {
  beforeEach(() => toastErr.mockReset());

  it("uses credits message on 402", () => {
    toastError({ status: 402, message: "credits" });
    expect(toastErr.mock.calls[0][0]).toMatch(/Crédits/);
  });

  it("uses rate-limit message on 429", () => {
    toastError({ status: 429, message: "rate" });
    expect(toastErr.mock.calls[0][0]).toMatch(/Trop/);
  });

  it("falls back to generic message", () => {
    toastError(new Error("oops"), "Fallback");
    expect(toastErr.mock.calls[0][0]).toBe("Fallback");
  });
});

describe("ava budget guard", () => {
  it("blocks for 60s after 402", () => {
    noteAvaBudgetError(402);
    expect(isAvaBudgetBlocked()).toBe(true);
  });
});
