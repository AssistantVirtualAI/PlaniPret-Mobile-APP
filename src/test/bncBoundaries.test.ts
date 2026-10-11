import { afterEach, describe, expect, it, vi } from "vitest";
import { metrics, resolveWindow, yoy } from "../../supabase/functions/_shared/commission-engine";
import { bncRow, fmtPct } from "./fixtures/bncGolden";

const BNC = { institution: "BNC" } as const;

describe("BNC percentages on date boundaries", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("year change: on Jan 1 the YTD window is January only on both sides", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T05:00:00Z"));
    const rows = [
      bncRow("2025-01-01", 1_000_000, "B-PY1"),
      bncRow("2025-12-31", 8_000_000, "B-PY2"), // previous December must be excluded
      bncRow("2026-01-01", 1_500_000, "B-CY1"),
    ];
    const { window, priorWindow } = resolveWindow("ytd", 2026, 12);
    expect(window).toEqual({ start: "2026-01-01", end: "2026-01-01" });
    expect(priorWindow).toEqual({ start: "2025-01-01", end: "2025-01-01" });

    const cy = metrics(rows, window, BNC);
    const py = metrics(rows, priorWindow, BNC);
    expect(cy.volume).toBeCloseTo(1_500_000, 2);
    expect(py.volume).toBeCloseTo(1_000_000, 2);
    expect(fmtPct(yoy(cy.volume, py.volume))).toBe("50.0 %");
    expect(fmtPct(yoy(cy.deals, py.deals))).toBe("0.0 %");
  });

  it("month start/end: first and last day are inclusive, neighbours excluded", () => {
    const rows = [
      bncRow("2026-02-28", 5_000_000, "E-PRE"), // day before March
      bncRow("2026-03-01", 1_000_000, "E-CY1"),
      bncRow("2026-03-31", 1_000_000, "E-CY2"),
      bncRow("2026-04-01", 5_000_000, "E-POST"), // day after March
      bncRow("2025-03-01", 800_000, "E-PY1"),
      bncRow("2025-03-31", 800_000, "E-PY2"),
    ];
    const { window, priorWindow } = resolveWindow("month", 2026, 3);
    const cy = metrics(rows, window, BNC);
    const py = metrics(rows, priorWindow, BNC);
    expect(cy.deals).toBe(2);
    expect(py.deals).toBe(2);
    expect(cy.volume).toBeCloseTo(2_000_000, 2);
    expect(py.volume).toBeCloseTo(1_600_000, 2);
    expect(fmtPct(yoy(cy.volume, py.volume))).toBe("25.0 %");
    expect(fmtPct(yoy(cy.commission, py.commission))).toBe("25.0 %");
  });

  it("leap year February and quarter edges keep the exact prior-year twin", () => {
    const feb = resolveWindow("month", 2024, 2);
    expect(feb.window).toEqual({ start: "2024-02-01", end: "2024-02-29" });
    expect(feb.priorWindow).toEqual({ start: "2023-02-01", end: "2023-02-28" });

    const q1 = resolveWindow("quarter", 2026, 1);
    expect(q1.window).toEqual({ start: "2026-01-01", end: "2026-03-31" });
    expect(q1.priorWindow).toEqual({ start: "2025-01-01", end: "2025-03-31" });

    const q4 = resolveWindow("quarter", 2026, 4);
    expect(q4.window).toEqual({ start: "2026-10-01", end: "2026-12-31" });
    expect(q4.priorWindow).toEqual({ start: "2025-10-01", end: "2025-12-31" });
  });

  it("timezone: an evening America/Montreal timestamp on the last day of the month still resolves the same UTC window", () => {
    // 2026-08-31 23:30 in Montreal is 2026-09-01 03:30 UTC. The window must not
    // silently roll to September on machines running in a negative offset.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T23:30:00-04:00"));
    const utcCapped = resolveWindow("ytd", 2026, 12);
    expect(utcCapped.window.start).toBe("2026-01-01");
    // The engine works in UTC, so the cap follows the UTC month deterministically.
    expect(utcCapped.window.end).toBe("2026-08-31");
    expect(utcCapped.priorWindow).toEqual({ start: "2025-01-01", end: "2025-08-31" });

    // Same instant, one hour earlier locally: still inside August in UTC.
    vi.setSystemTime(new Date("2026-08-31T18:30:00-04:00"));
    const august = resolveWindow("ytd", 2026, 12);
    expect(august.window).toEqual({ start: "2026-01-01", end: "2026-08-31" });
    expect(august.priorWindow).toEqual({ start: "2025-01-01", end: "2025-08-31" });
  });

  it("rows dated at a month boundary are attributed by calendar date, not by local time", () => {
    const rows = [
      bncRow("2026-03-31", 1_000_000, "TZ-CY"),
      bncRow("2025-03-31", 500_000, "TZ-PY"),
    ];
    const march = resolveWindow("month", 2026, 3);
    const april = resolveWindow("month", 2026, 4);
    expect(metrics(rows, march.window, BNC).deals).toBe(1);
    expect(metrics(rows, april.window, BNC).deals).toBe(0);
    expect(fmtPct(yoy(metrics(rows, march.window, BNC).volume, metrics(rows, march.priorWindow, BNC).volume)))
      .toBe("100.0 %");
  });
});
