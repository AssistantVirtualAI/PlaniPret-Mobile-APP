import { describe, expect, it, vi } from "vitest";
import {
  periodVolume,
  periodDeals,
  periodCommission,
  volumeTranches,
  metrics,
  helperFlags,
  yoy,
  yearWindow,
  resolveWindow,
  type RegisterRow,
} from "../../supabase/functions/_shared/commission-engine";

const window = { start: "2026-01-01", end: "2026-12-31" };

const row = (overrides: Partial<RegisterRow>): RegisterRow => ({
  number: "PLPR-1",
  loan_amt: 300_000,
  institution: "Prêteur A",
  amount: 2_000,
  mortgage_type: "Renouvellement",
  term: "5 ans",
  agent_name: "Courtier",
  date_trans: "2026-04-10",
  commission_type: "base",
  source_row: 1,
  broker_user_id: "broker-1",
  ...overrides,
});

describe("commission volume rules", () => {
  it("includes a transaction timestamp on the final calendar day", () => {
    expect(periodVolume([row({ date_trans: "2026-12-31 23:59:59" })], window)).toBe(300000);
  });
  it("counts distinct loans of one contract once each, and the contract once", () => {
    const rows = [
      row({ source_row: 1, loan_amt: 200_000 }),
      row({ source_row: 2, mortgage_type: "Marge Hypothécaire", loan_amt: 100_000 }),
    ];
    expect(periodVolume(rows, window)).toBe(300_000);
    expect(periodDeals(rows, window)).toBe(1);
  });

  it("never double-counts the same contract+loan repeated in base rows", () => {
    const rows = [
      row({ source_row: 1, loan_amt: 300_000, amount: 1_000 }),
      row({ source_row: 2, date_trans: "2026-06-02", loan_amt: 300_000, amount: 500 }),
    ];
    expect(periodVolume(rows, window)).toBe(300_000);
    expect(periodDeals(rows, window)).toBe(1);
    expect(periodCommission(rows, window)).toBe(1_500);
  });

  it("excludes adjustment rows from volume and deals but keeps them in commissions", () => {
    const rows = [
      row({ source_row: 1, loan_amt: 200_000, amount: 1_000 }),
      row({ source_row: 2, number: "PLPR-2", loan_amt: 150_000, amount: 800, is_adjustment: "1" }),
    ];
    expect(periodVolume(rows, window)).toBe(200_000);
    expect(periodDeals(rows, window)).toBe(1);
    expect(periodCommission(rows, window)).toBe(1_800);
  });

  it("excludes insurance payouts everywhere", () => {
    const rows = [
      row({ source_row: 1, loan_amt: 200_000, amount: 1_000 }),
      row({ source_row: 2, number: "PLPR-3", loan_amt: 0, amount: 158.86, institution: "Lepelco Assurances Inc" }),
    ];
    expect(periodVolume(rows, window)).toBe(200_000);
    expect(periodCommission(rows, window)).toBe(1_000);
  });

  it("never dedupes two brokers with same contract, lender, product and amount, even with the same name", () => {
    const rows = [
      row({ source_row: 1, broker_user_id: "broker-1", agent_name: "Jean Tremblay" }),
      row({ source_row: 2, broker_user_id: "broker-2", agent_name: "Jean Tremblay" }),
    ];
    expect(periodVolume(rows, window)).toBe(600_000);
    expect(periodDeals(rows, window)).toBe(2);
  });

  it("keeps clawback rows out of volume without removing the funded twin", () => {
    const rows = [
      row({ source_row: 3, number: "PLPR-9", loan_amt: 250_000, amount: 500 }),
      row({ source_row: 4, number: "PLPR-9", loan_amt: -250_000, amount: 0 }),
    ];
    expect(periodVolume(rows, window)).toBe(250_000);
    expect(periodDeals(rows, window)).toBe(1);
  });

  it("ignores undated rows in KPIs", () => {
    expect(periodVolume([row({ date_trans: null as any })], window)).toBe(0);
  });
});

describe("workbook spec conformance", () => {
  it("stops the current year and YTD on today's Toronto date, with the same prior-year day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T01:00:00Z"));
    try {
      for (const granularity of ["year", "ytd"] as const) {
        const result = resolveWindow(granularity, 2026, 10);
        expect(result.window).toEqual({ start: "2026-01-01", end: "2026-10-09" });
        expect(result.priorWindow).toEqual({ start: "2025-01-01", end: "2025-10-09" });
      }
    } finally { vi.useRealTimers(); }
  });
  it("uses a calendar fiscal year (Jan 1 - Dec 31) with CY/PY twins", () => {
    expect(yearWindow(2026)).toEqual({ start: "2026-01-01", end: "2026-12-31" });
    const r = resolveWindow("ytd", 2026, 7);
    expect(r.window).toEqual({ start: "2026-01-01", end: "2026-07-31" });
    expect(r.priorWindow).toEqual({ start: "2025-01-01", end: "2025-07-31" });
  });

  it("applies the YoY rule IF(PY=0, IF(CY=0,'—','New'), (CY-PY)/PY)", () => {
    expect(yoy(0, 0)).toBe("—");
    expect(yoy(10, 0)).toBe("New");
    expect(yoy(150, 100)).toBeCloseTo(0.5);
  });

  it("computes BPS as commission / volume x 10000 and flags W/X columns", () => {
    const rows = [
      row({ source_row: 1, loan_amt: 500_000, amount: 5_000 }),
      row({ source_row: 2, commission_type: "bonus", loan_amt: 0, amount: 1_000 }),
    ];
    const m = metrics(rows, window);
    expect(m.volume).toBe(500_000);
    expect(m.deals).toBe(1);
    expect(m.commission).toBe(6_000);
    expect(m.bps).toBeCloseTo(120);
    const flags = helperFlags(rows, window);
    expect(flags[0].unique_volume).toBe(1);
    expect(flags[0].unique_deal).toBe(1);
    expect(flags[1].unique_volume).toBe(0);
  });
});
