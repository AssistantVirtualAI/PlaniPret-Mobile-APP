/**
 * Reference fixtures + golden values for the BNC commission percentages.
 *
 * These numbers are the contract: if the commission engine evolves, the tests
 * that consume this file must keep producing exactly these values. Update a
 * golden only when the business rule itself deliberately changes.
 */
import type { RegisterRow } from "../../../supabase/functions/_shared/commission-engine";

/** Frozen "now" used by every golden test (Aug 26 2026, UTC). */
export const GOLDEN_NOW = "2026-08-31T16:00:00Z";
export const GOLDEN_YEAR = 2026;

let seq = 1000;

/** Build a BNC base row. Commission is deliberately volume/100 for readable goldens. */
export function bncRow(
  date_trans: string,
  loan_amt: number,
  number: string,
  overrides: Partial<RegisterRow> = {},
): RegisterRow {
  seq += 1;
  return {
    number,
    loan_amt,
    institution: "BNC",
    amount: loan_amt / 100,
    mortgage_type: "Conventionnel",
    term: "5 ans",
    agent_name: "Jean-Éric Gagnon",
    date_trans,
    commission_type: "base",
    source_row: seq,
    ...overrides,
  };
}

/**
 * Reference dataset covering YTD, month (March) and quarter (Q2) windows on
 * both the current and prior year, plus rows that must stay out of every
 * window (November PY, October CY, and a non-BNC lender).
 */
export const BNC_FIXTURE_ROWS: RegisterRow[] = [
  // ---- Prior year (2025), inside Jan→Aug YTD ----
  bncRow("2025-01-15", 1_000_000, "PY-01"),
  bncRow("2025-03-10", 1_500_000, "PY-02"),
  bncRow("2025-03-25", 500_000, "PY-03"),
  bncRow("2025-05-05", 1_200_000, "PY-04"),
  bncRow("2025-06-30", 800_000, "PY-05"),
  bncRow("2025-08-31", 2_000_000, "PY-06"),
  // ---- Prior year, outside the Jan→Aug YTD window ----
  bncRow("2025-11-10", 9_000_000, "PY-90"),
  bncRow("2025-12-31", 4_000_000, "PY-91"),

  // ---- Current year (2026), inside Jan→Aug YTD ----
  bncRow("2026-01-01", 1_250_000, "CY-01"),
  bncRow("2026-03-01", 2_000_000, "CY-02"),
  bncRow("2026-03-31", 1_000_000, "CY-03"),
  bncRow("2026-04-15", 1_500_000, "CY-04"),
  bncRow("2026-06-30", 1_500_000, "CY-05"),
  bncRow("2026-08-26", 1_500_000, "CY-06"),
  // ---- Current year, after the capped YTD window ----
  bncRow("2026-10-05", 7_000_000, "CY-90"),

  // ---- Another lender: must never leak into BNC figures ----
  bncRow("2026-03-15", 5_000_000, "OT-01", { institution: "Desjardins" }),
  bncRow("2025-03-15", 5_000_000, "OT-02", { institution: "Desjardins" }),
];

export interface GoldenPeriod {
  granularity: "ytd" | "month" | "quarter";
  index: number;
  window: { start: string; end: string };
  priorWindow: { start: string; end: string };
  cy: { volume: number; deals: number; commission: number };
  py: { volume: number; deals: number; commission: number };
  /** Formatted exactly like the dashboard: `${(v*100).toFixed(1)} %`. */
  formatted: { volume: string; deals: string; commission: string };
}

/** Golden expectations derived from BNC_FIXTURE_ROWS at GOLDEN_NOW. */
export const BNC_GOLDEN: GoldenPeriod[] = [
  {
    granularity: "ytd",
    index: 12,
    window: { start: "2026-01-01", end: "2026-08-31" },
    priorWindow: { start: "2025-01-01", end: "2025-08-31" },
    cy: { volume: 8_750_000, deals: 6, commission: 87_500 },
    py: { volume: 7_000_000, deals: 6, commission: 70_000 },
    formatted: { volume: "25.0 %", deals: "0.0 %", commission: "25.0 %" },
  },
  {
    granularity: "month",
    index: 3,
    window: { start: "2026-03-01", end: "2026-03-31" },
    priorWindow: { start: "2025-03-01", end: "2025-03-31" },
    cy: { volume: 3_000_000, deals: 2, commission: 30_000 },
    py: { volume: 2_000_000, deals: 2, commission: 20_000 },
    formatted: { volume: "50.0 %", deals: "0.0 %", commission: "50.0 %" },
  },
  {
    granularity: "quarter",
    index: 2,
    window: { start: "2026-04-01", end: "2026-06-30" },
    priorWindow: { start: "2025-04-01", end: "2025-06-30" },
    cy: { volume: 3_000_000, deals: 2, commission: 30_000 },
    py: { volume: 2_000_000, deals: 2, commission: 20_000 },
    formatted: { volume: "50.0 %", deals: "0.0 %", commission: "50.0 %" },
  },
];

/** Same formatter as the commissions dashboard. */
export const fmtPct = (v: number | string) =>
  typeof v === "number" ? `${(v * 100).toFixed(1)} %` : String(v ?? "—");
