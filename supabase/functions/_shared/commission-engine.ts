// Commission engine — implements the authoritative broker analytics logic.
// Reference: Maestro "Broker Analytics Dashboard".
// EXCLUDED EVERYWHERE: insurance payouts (institution containing "assurance").
// VOLUME: base rows, loan_amt > 0, in window, excluding adjustment rows (is_adjustment = 1).
// DEALS:  distinct contract number over those same base rows.
// COMMISSION: sum of `amount` for every row in window, all commission types,
//             adjustments included, no dedup.

export interface RegisterRow {
  number: string | null;
  loan_amt: number | null;
  institution: string | null;
  amount: number | null;
  mortgage_type: string | null;
  term: string | null;
  agent_name: string | null;
  date_trans: string | null;
  commission_type: string | null;
  source_row: number;
  broker_user_id?: string | null;
  is_adjustment?: unknown;
}

export interface Window { start: string; end: string } // inclusive yyyy-mm-dd

const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0)) || 0;
const isBase = (r: RegisterRow) => (r.commission_type ?? "").trim().toLowerCase() === "base";

/** Maestro flags reversals/corrections with `is_adjustment = 1`; they never count as volume or deals. */
export const isAdjustment = (r: RegisterRow) => {
  const v = r.is_adjustment;
  if (v === null || v === undefined || v === "") return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "y" || s === "yes" || s === "oui";
};

/** Insurance payouts (Lepelco, Desjardins Assurances, ...) are outside broker analytics. */
export const isInsurance = (r: RegisterRow) => /assurance/i.test(r.institution ?? "");

/**
 * A row is only usable for KPIs when Maestro gave it a transaction date.
 * Undated rows (adjustments pushed without `date_trans`) are excluded from
 * volume, deals, commissions and YoY everywhere.
 */
export function hasTransactionDate(r: { date_trans?: string | null }): boolean {
  const d = (r.date_trans ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}/.test(d);
}

/** Splits rows into the dated ones (used in calculations) and the undated ones. */
export function splitUndated<T extends { date_trans?: string | null }>(rows: T[]): { dated: T[]; undated: T[] } {
  const dated: T[] = []; const undated: T[] = [];
  for (const r of rows) (hasTransactionDate(r) ? dated : undated).push(r);
  return { dated, undated };
}

export function inWindow(r: RegisterRow, w: Window): boolean {
  if (!hasTransactionDate(r)) return false;
  const d = r.date_trans;
  if (!d) return false;
  return d >= w.start && d <= w.end;
}

export function sortSource<T extends { source_row: number }>(rows: T[]): T[] {
  const cached = sortedCache.get(rows as unknown as object[]);
  if (cached) return cached as unknown as T[];
  const sorted = [...rows].sort((a, b) => a.source_row - b.source_row);
  sortedCache.set(rows as unknown as object[], sorted as unknown as object[]);
  return sorted;
}

/** Sorted-array memo: the same input array is re-sorted many times per request. */
const sortedCache = new WeakMap<object[], object[]>();

export interface Criteria {
  institution?: string;
  mortgage_type?: string;
  term?: string;
  broker?: string; // agent_name
}

function matches(r: RegisterRow, c: Criteria): boolean {
  if (c.institution !== undefined && (r.institution ?? "") !== c.institution) return false;
  if (c.mortgage_type !== undefined && (r.mortgage_type ?? "") !== c.mortgage_type) return false;
  if (c.term !== undefined && (r.term ?? "") !== c.term) return false;
  if (c.broker !== undefined && (r.agent_name ?? "") !== c.broker) return false;
  return true;
}

const normalizedKeyPart = (value: string | null | undefined) => (value ?? "").trim().toLocaleLowerCase("fr-CA");

/** Volume uniqueness key: contract + lender + mortgage type + loan amount (absolute). */
const volumeKey = (r: RegisterRow) =>
  [
    normalizedKeyPart(r.number),
    normalizedKeyPart(r.institution),
    normalizedKeyPart(r.mortgage_type),
    Math.abs(n(r.loan_amt)).toFixed(2),
  ].join("|");

/** Per-row classification memo (regex + string work done once per row, not per period). */
interface RowFlags { base: boolean; adjustment: boolean; insurance: boolean; loan: number; vKey: string; dKey: string }
const flagCache = new WeakMap<RegisterRow, RowFlags>();
function flags(r: RegisterRow): RowFlags {
  let f = flagCache.get(r);
  if (!f) {
    f = {
      base: isBase(r),
      adjustment: isAdjustment(r),
      insurance: isInsurance(r),
      loan: n(r.loan_amt),
      vKey: volumeKey(r),
      dKey: normalizedKeyPart(r.number),
    };
    flagCache.set(r, f);
  }
  return f;
}

export type ExclusionReason =
  | "duplicate_amount"
  | "reversal_cancelled"
  | "reversal_row"
  | "adjustment"
  | "insurance"
  | "non_base"
  | "no_loan_amount";

export interface ExcludedRow { row: RegisterRow; reason: ExclusionReason }

interface WindowComputation {
  windowRows: RegisterRow[];
  volume: RegisterRow[];
  deals: RegisterRow[];
  excluded: ExcludedRow[];
}

/**
 * Single pass per (rows, window): volume tranches, deal contracts, window rows and
 * exclusion reasons are computed together and memoized, so switching the selected
 * month / YTD period only recomputes the windows that actually changed.
 */
const computeCache = new WeakMap<RegisterRow[], Map<string, WindowComputation>>();



function computeWindow(rows: RegisterRow[], w: Window): WindowComputation {
  let byWindow = computeCache.get(rows);
  if (!byWindow) { byWindow = new Map(); computeCache.set(rows, byWindow); }
  const key = `${w.start}..${w.end}`;
  const hit = byWindow.get(key);
  if (hit) return hit;

  const sorted = sortSource(rows);
  const windowRows: RegisterRow[] = [];
  const candidates: RegisterRow[] = [];
  const excluded: ExcludedRow[] = [];

  for (const r of sorted) {
    if (!inWindow(r, w)) continue;
    windowRows.push(r);
    const f = flags(r);
    if (f.insurance) { excluded.push({ row: r, reason: "insurance" }); continue; }
    if (!f.base) { if (f.loan !== 0) excluded.push({ row: r, reason: "non_base" }); continue; }
    if (f.adjustment) { excluded.push({ row: r, reason: "adjustment" }); continue; }
    if (f.loan === 0) { candidates.push(r); continue; } // zero-amount base row: deal only
    candidates.push(r);
  }

  // Negative base rows are commission clawbacks: they never remove the funded
  // volume of their positive twin, they simply do not add volume themselves.
  const seen = new Set<string>();
  const volume: RegisterRow[] = [];
  const zeroLoanBase: RegisterRow[] = [];
  for (const r of candidates) {
    const f = flags(r);
    if (f.loan === 0) { zeroLoanBase.push(r); continue; }
    if (f.loan < 0) { excluded.push({ row: r, reason: "reversal_row" }); continue; }
    if (seen.has(f.vKey)) { excluded.push({ row: r, reason: "duplicate_amount" }); continue; }
    seen.add(f.vKey);
    volume.push(r);
  }

  // Deals = distinct contract numbers among the retained base rows of the period
  // (calendar-year rule: a contract counts once per period, never twice).
  const seenDeal = new Set<string>();
  const deals: RegisterRow[] = [];
  for (const r of [...volume, ...zeroLoanBase]) {
    const k = flags(r).dKey;
    if (seenDeal.has(k)) continue;
    seenDeal.add(k);
    deals.push(r);
  }



  const out: WindowComputation = { windowRows, volume, deals, excluded };
  byWindow.set(key, out);
  return out;
}

/**
 * VOLUME rows = base rows, in window, no adjustments, no insurance, positive loan amounts.
 * Uniqueness = contract + lender + mortgage type + loan amount:
 *   - exact repeated amounts count once,
 *   - a negative reversal cancels its matching positive row.
 */
export function volumeTranches(rows: RegisterRow[], w: Window): RegisterRow[] {
  return computeWindow(rows, w).volume;
}

/** Rows of the window that never reach the volume, with the rule that excluded them. */
export function excludedRows(rows: RegisterRow[], w: Window): ExcludedRow[] {
  return computeWindow(rows, w).excluded;
}

/** Dashboard grouping key for volume breakdowns: contract + lender + mortgage type. */
export const dashboardVolumeKey = (r: RegisterRow) =>
  [normalizedKeyPart(r.number), normalizedKeyPart(r.institution), normalizedKeyPart(r.mortgage_type)].join("|");

/** Dashboard deals key: contract number only. */
export const dashboardDealKey = (r: RegisterRow) => normalizedKeyPart(r.number);

/**
 * Workbook helper columns W/X for the selected period:
 *   unique_volume = 1 on rows retained by the volume uniqueness rule,
 *   unique_deal   = 1 on the first base row of each contract number.
 */
export function helperFlags(
  rows: RegisterRow[],
  w: Window,
): Array<{ row: RegisterRow; unique_volume: 0 | 1; unique_deal: 0 | 1 }> {
  const c = computeWindow(rows, w);
  const volume = new Set(c.volume);
  const deals = new Set(c.deals);
  return sortSource(rows).map((row) => ({
    row,
    unique_volume: volume.has(row) ? 1 : 0,
    unique_deal: deals.has(row) ? 1 : 0,
  }));
}

/**
 * DEALS = count of base rows flagged unique_deal = 1, keyed on the contract number only.
 * Base rows in window (no adjustments, no insurance); rows cancelled by a negative
 * reversal or exact repeats never create a deal. Zero-amount base rows still count
 * as a contract, per the workbook definition (deals key = contract number only).
 */
export function dealContracts(rows: RegisterRow[], w: Window): RegisterRow[] {
  return computeWindow(rows, w).deals;
}

/** Rows of the window (dated, inside the period) — memoized alongside the KPIs. */
export function windowRows(rows: RegisterRow[], w: Window): RegisterRow[] {
  return computeWindow(rows, w).windowRows;
}

export function periodVolume(rows: RegisterRow[], w: Window, c: Criteria = {}): number {
  let sum = 0;
  for (const r of volumeTranches(rows, w)) if (matches(r, c)) sum += flags(r).loan;
  return sum;
}

export function periodDeals(rows: RegisterRow[], w: Window, c: Criteria = {}): number {
  let count = 0;
  for (const r of dealContracts(rows, w)) if (matches(r, c)) count += 1;
  return count;
}

export function periodCommission(rows: RegisterRow[], w: Window, c: Criteria = {}): number {
  let sum = 0;
  for (const r of windowRows(rows, w)) if (!flags(r).insurance && matches(r, c)) sum += n(r.amount);
  return sum;
}

export interface Metrics {
  volume: number;
  deals: number;
  commission: number;
  avgDeal: number;
  bps: number;
  commissionPerDeal: number;
}

export function metrics(rows: RegisterRow[], w: Window, c: Criteria = {}): Metrics {
  const volume = periodVolume(rows, w, c);
  const deals = periodDeals(rows, w, c);
  const commission = periodCommission(rows, w, c);
  return {
    volume,
    deals,
    commission,
    avgDeal: deals ? volume / deals : 0,
    bps: volume ? (commission / volume) * 10000 : 0,
    commissionPerDeal: deals ? commission / deals : 0,
  };
}

export function yoy(cy: number, py: number): number | "—" | "New" {
  if (!py) return cy ? "New" : "—";
  return (cy - py) / py;
}

const pad = (x: number) => String(x).padStart(2, "0");
export const dstr = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
export const monthEndDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const monthWindow = (y: number, m: number): Window => ({
  start: dstr(y, m, 1),
  end: dstr(y, m, monthEndDay(y, m)),
});
export const ytdWindow = (y: number, throughMonth: number): Window => ({
  start: dstr(y, 1, 1),
  end: dstr(y, throughMonth, monthEndDay(y, throughMonth)),
});
export const quarterWindow = (y: number, q: number): Window => ({
  start: dstr(y, q * 3 - 2, 1),
  end: dstr(y, q * 3, monthEndDay(y, q * 3)),
});
/** Club Excellence season: Aug 1 (y) -> Jul 31 (y+1) */
export const seasonWindow = (y: number): Window => ({ start: dstr(y, 8, 1), end: dstr(y + 1, 7, 31) });

export const yearWindow = (y: number): Window => ({ start: dstr(y, 1, 1), end: dstr(y, 12, 31) });

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Monday of ISO week `w` of year `y`. */
function isoWeekMonday(y: number, w: number): Date {
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const dow = jan4.getUTCDay() || 7; // 1..7 (Mon..Sun)
  const week1Mon = new Date(jan4.getTime() - (dow - 1) * 86400000);
  return new Date(week1Mon.getTime() + (w - 1) * 7 * 86400000);
}

/** ISO week window (Mon → Sun). */
export function weekWindow(y: number, w: number): Window {
  const mon = isoWeekMonday(y, w);
  const sun = new Date(mon.getTime() + 6 * 86400000);
  return { start: iso(mon), end: iso(sun) };
}

/** Number of ISO weeks in a year (52 or 53). */
export function isoWeeksInYear(y: number): number {
  const dec28 = new Date(Date.UTC(y, 11, 28));
  const dow = dec28.getUTCDay() || 7;
  const thu = new Date(dec28.getTime() + (4 - dow) * 86400000);
  const jan1 = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
  return Math.ceil(((thu.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
}

export type Granularity = "week" | "month" | "quarter" | "year" | "ytd";

/** Resolve the analysis window for a granularity + index, plus its prior-year twin. */
export function resolveWindow(
  granularity: Granularity,
  year: number,
  index: number,
): { window: Window; priorWindow: Window; label: string } {
  switch (granularity) {
    case "week": {
      const w = Math.min(isoWeeksInYear(year), Math.max(1, index));
      const pyW = Math.min(isoWeeksInYear(year - 1), w);
      return { window: weekWindow(year, w), priorWindow: weekWindow(year - 1, pyW), label: `S${w}` };
    }
    case "month": {
      const m = Math.min(12, Math.max(1, index));
      return { window: monthWindow(year, m), priorWindow: monthWindow(year - 1, m), label: `M${m}` };
    }
    case "quarter": {
      const q = Math.min(4, Math.max(1, index));
      return { window: quarterWindow(year, q), priorWindow: quarterWindow(year - 1, q), label: `Q${q}` };
    }
    case "year": {
      // "Same period last year": for the year in progress, the prior-year twin stops
      // at the same calendar day, otherwise the comparison mixes a partial year with
      // a full one (that is what produced the wrong negative deltas).
      const today = new Date();
      const cy = today.getUTCFullYear();
      const priorEnd = year === cy
        ? dstr(year - 1, today.getUTCMonth() + 1, monthEndDay(year - 1, today.getUTCMonth() + 1))
        : dstr(year - 1, 12, 31);
      return {
        window: year === cy
          ? { start: dstr(year, 1, 1), end: dstr(year, today.getUTCMonth() + 1, monthEndDay(year, today.getUTCMonth() + 1)) }
          : yearWindow(year),
        priorWindow: { start: dstr(year - 1, 1, 1), end: priorEnd },
        label: String(year),
      };
    }

    default: {
      // For the year in progress, YTD never runs past the current month: comparing
      // Jan→Dec of a partial year with a full prior year produced wrong PY figures.
      const today = new Date();
      const cap = year === today.getUTCFullYear() ? today.getUTCMonth() + 1 : 12;
      const m = Math.min(cap, Math.max(1, index || cap));
      // Same period last year, month-end aligned: 2026-01-01→2026-08-31 vs 2025-01-01→2025-08-31.
      return { window: ytdWindow(year, m), priorWindow: ytdWindow(year - 1, m), label: `YTD ${m}` };
    }
  }
}

