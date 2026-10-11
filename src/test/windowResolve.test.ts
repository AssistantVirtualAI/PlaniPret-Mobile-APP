import { afterEach, describe, it, expect, vi } from "vitest";
import { metrics, resolveWindow, yoy, type RegisterRow } from "../../supabase/functions/_shared/commission-engine";

const bnc = (date_trans: string, loan_amt: number, number: string): RegisterRow => ({
  number,
  loan_amt,
  institution: "BNC",
  amount: loan_amt / 100,
  mortgage_type: "Conventionnel",
  term: "5 ans",
  agent_name: "Jean-Éric Gagnon",
  date_trans,
  commission_type: "base",
  source_row: Number(number.replace(/\D/g, "")),
});

describe("windows", () => {
  afterEach(() => vi.useRealTimers());

  it("ytd caps to current month and aligns PY", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T16:23:00Z"));
    const r = resolveWindow("ytd", 2026, 12);
    expect(r.window).toEqual({ start: "2026-01-01", end: "2026-08-26" });
    expect(r.priorWindow).toEqual({ start: "2025-01-01", end: "2025-08-26" });
  });

  it("month/quarter compare same period", () => {
    expect(resolveWindow("month", 2026, 3)).toMatchObject({ window: {start:"2026-03-01",end:"2026-03-31"}, priorWindow:{start:"2025-03-01",end:"2025-03-31"} });
    expect(resolveWindow("quarter", 2026, 2)).toMatchObject({ window: {start:"2026-04-01",end:"2026-06-30"}, priorWindow:{start:"2025-04-01",end:"2025-06-30"} });
  });

  it("calculates BNC YTD against Jan through the same current month, not the full prior year", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T16:23:00Z"));
    const rows = [
      bnc("2025-02-10", 3_000_000, "BNC-1"),
      bnc("2025-08-10", 3_960_673.7, "BNC-2"),
      bnc("2025-11-10", 17_279_272.3, "BNC-3"),
      bnc("2026-02-10", 4_000_000, "BNC-4"),
      bnc("2026-08-10", 4_582_985, "BNC-5"),
    ];
    const { window, priorWindow } = resolveWindow("ytd", 2026, 12);
    const cy = metrics(rows, window, { institution: "BNC" }).volume;
    const py = metrics(rows, priorWindow, { institution: "BNC" }).volume;
    expect(py).toBeCloseTo(6_960_673.7, 1);
    expect(yoy(cy, py)).toBeCloseTo((8_582_985 - 6_960_673.7) / 6_960_673.7, 8);
  });

  it.each([
    ["month", 3, "2026-03-01", "2026-03-31", "2025-03-01", "2025-03-31"],
    ["quarter", 2, "2026-04-01", "2026-06-30", "2025-04-01", "2025-06-30"],
  ] as const)("calculates %s percentages from the exact prior-year twin", (granularity, index, cyStart, cyEnd, pyStart, pyEnd) => {
    const rows = [
      bnc(cyStart, 1_250_000, `${index}01`),
      bnc(pyStart, 1_000_000, `${index}02`),
      bnc(granularity === "month" ? "2026-04-01" : "2026-07-01", 9_000_000, `${index}03`),
      bnc(granularity === "month" ? "2025-04-01" : "2025-07-01", 9_000_000, `${index}04`),
    ];
    const resolved = resolveWindow(granularity, 2026, index);
    expect(resolved.window).toEqual({ start: cyStart, end: cyEnd });
    expect(resolved.priorWindow).toEqual({ start: pyStart, end: pyEnd });
    expect(yoy(metrics(rows, resolved.window).volume, metrics(rows, resolved.priorWindow).volume)).toBeCloseTo(0.25);
  });

  it("BNC YTD: dossiers and commission percentages use the same Jan→current-month window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T16:23:00Z"));
    const rows = [
      // PY in-window: 3 dossiers, commission = volume/100
      bnc("2025-02-10", 3_000_000, "BNC-P1"),
      bnc("2025-05-10", 2_000_000, "BNC-P2"),
      bnc("2025-08-10", 1_960_673.7, "BNC-P3"),
      // PY out-of-window (Nov) must be excluded
      bnc("2025-11-10", 17_279_272.3, "BNC-P4"),
      // CY in-window: 4 dossiers
      bnc("2026-01-10", 2_000_000, "BNC-C1"),
      bnc("2026-03-10", 2_000_000, "BNC-C2"),
      bnc("2026-06-10", 2_000_000, "BNC-C3"),
      bnc("2026-08-10", 2_582_985, "BNC-C4"),
    ];
    const { window, priorWindow } = resolveWindow("ytd", 2026, 12);
    const cy = metrics(rows, window, { institution: "BNC" });
    const py = metrics(rows, priorWindow, { institution: "BNC" });

    expect(py.deals).toBe(3);
    expect(cy.deals).toBe(4);
    expect(yoy(cy.deals, py.deals)).toBeCloseTo((4 - 3) / 3, 8);

    expect(py.commission).toBeCloseTo(6_960_673.7 / 100, 4);
    expect(cy.commission).toBeCloseTo(8_582_985 / 100, 4);
    expect(yoy(cy.commission, py.commission)).toBeCloseTo(
      (8_582_985 - 6_960_673.7) / 6_960_673.7,
      8,
    );
  });

  it.each([
    ["month", 3, "2026-03-10", "2025-03-10", "2026-04-10", "2025-04-10"],
    ["quarter", 2, "2026-05-10", "2025-05-10", "2026-07-10", "2025-07-10"],
  ] as const)(
    "BNC %s: dossiers and commission percentages come from the exact prior-year twin",
    (granularity, index, cyIn, pyIn, cyOut, pyOut) => {
      const rows = [
        bnc(cyIn, 2_000_000, `${index}11`),
        bnc(cyIn, 1_000_000, `${index}12`),
        bnc(cyIn, 1_000_000, `${index}13`),
        bnc(pyIn, 2_000_000, `${index}14`),
        bnc(pyIn, 1_200_000, `${index}15`),
        // outside the window on both sides — must not affect the percentages
        bnc(cyOut, 9_000_000, `${index}16`),
        bnc(pyOut, 9_000_000, `${index}17`),
      ];
      const { window, priorWindow } = resolveWindow(granularity, 2026, index);
      const cy = metrics(rows, window, { institution: "BNC" });
      const py = metrics(rows, priorWindow, { institution: "BNC" });

      expect(cy.deals).toBe(3);
      expect(py.deals).toBe(2);
      expect(yoy(cy.deals, py.deals)).toBeCloseTo(0.5, 8);

      expect(cy.commission).toBeCloseTo(40_000, 4);
      expect(py.commission).toBeCloseTo(32_000, 4);
      expect(yoy(cy.commission, py.commission)).toBeCloseTo(0.25, 8);
      expect(cy.commissionPerDeal).toBeCloseTo(40_000 / 3, 6);
      expect(py.commissionPerDeal).toBeCloseTo(16_000, 6);
    },
  );
});
