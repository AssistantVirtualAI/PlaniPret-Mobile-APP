// Shared, allowlisted client for the OFFICIAL Planiprêt Commission Reports API.
//   GET /api/main/commissions/reports/deposits
//   GET /api/main/commissions/reports/agents
//   GET /api/main/financial-institutions
//
// Read-only. Never mutates a commission. The Bearer token stays server-side.
import { helperFlags, type RegisterRow } from "./commission-engine.ts";

export const COMMISSION_API_BASE = (
  (globalThis as any).Deno?.env?.get("PLANIPRET_API_BASE_URL") ?? "https://client.planipret.com"
).replace(/\/$/, "");


export const COMMISSION_TYPES = ["base", "bonus", "bonus2", "perform"] as const;
export const PAID_COMMISSION_PATH = "/api/main/commissions/reports/deposits";
export const PENDING_COMMISSION_PATH = "/api/main/commissions/reports/pending-commissions";
export const SPLIT_TYPES = ["planipret", "planipret_override", "planipret_external"] as const;
export const ORDER_BY = [
  "number", "loan_amt", "institution", "points", "amount", "date_trans",
  "commission_type", "split_type", "agent_name", "target_name",
] as const;
export const SORTS = ["asc", "desc"] as const;

export interface CommissionDepositRow {
  number: string | null;
  loan_amt: string | number | null;
  primary_client_name: string | null;
  secondary_client_name: string | null;
  institution: string | null;
  financial_inst_id: number | null;
  is_adjustment: number | null;
  points: string | number | null;
  buy_down: string | number | null;
  amount: string | number | null;
  mortgage_type: string | null;
  term: string | number | null;
  agent_name_id: number | null;
  agent_name: string | null;
  target_name_id: number | null;
  target_name: string | null;
  date_trans: string | null;
  commission_type: string | null;
  split_type: string | null;
  agent_company: string | null;
  cabinet: string | null;
}

export interface NormalizedFilters {
  users_id?: string;
  financial_inst_id?: string;
  commission_type?: string;
  split_type?: string;
  date_from?: string;
  date_to?: string;
  number_prefix?: string;
  order_by?: string;
  sort?: string;
  page?: number;
  per_page?: number;
}

export type FieldErrors = Record<string, string>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2})?$/;

/** Strict allowlist. Returns `{ filters }` or `{ errors }` (→ HTTP 422). */
export function normalizeFilters(input: any): { filters: NormalizedFilters; errors: FieldErrors } {
  const f: NormalizedFilters = {};
  const errors: FieldErrors = {};
  const raw = input && typeof input === "object" ? input : {};

  if (raw.users_id != null && String(raw.users_id).trim() !== "") {
    const v = String(raw.users_id).trim();
    if (!/^\d+$/.test(v)) errors.users_id = "Identifiant de courtier invalide.";
    else f.users_id = v;
  }
  if (raw.financial_inst_id != null && String(raw.financial_inst_id).trim() !== "") {
    const v = String(raw.financial_inst_id).trim();
    if (!/^\d+$/.test(v)) errors.financial_inst_id = "Institution financière invalide.";
    else f.financial_inst_id = v;
  }
  if (raw.commission_type != null && String(raw.commission_type).trim() !== "") {
    const v = String(raw.commission_type).trim();
    if (!(COMMISSION_TYPES as readonly string[]).includes(v)) errors.commission_type = "Type de commission invalide.";
    else f.commission_type = v;
  }
  if (raw.split_type != null && String(raw.split_type).trim() !== "") {
    const v = String(raw.split_type).trim();
    if (!(SPLIT_TYPES as readonly string[]).includes(v)) errors.split_type = "Type de partage invalide.";
    else f.split_type = v;
  }

  const df = raw.date_from != null && String(raw.date_from).trim() !== "" ? String(raw.date_from).trim() : null;
  const dt = raw.date_to != null && String(raw.date_to).trim() !== "" ? String(raw.date_to).trim() : null;
  if (df && !DATE_RE.test(df)) errors.date_from = "Format de date invalide (AAAA-MM-JJ).";
  if (dt && !DATE_RE.test(dt)) errors.date_to = "Format de date invalide (AAAA-MM-JJ).";
  if (df && !dt) errors.date_to = "date_to est requis avec date_from.";
  if (dt && !df) errors.date_from = "date_from est requis avec date_to.";
  if (df && dt && !errors.date_from && !errors.date_to) {
    const a = df.slice(0, 10), b = dt.slice(0, 10);
    if (b < a) errors.date_to = "date_to doit être postérieure ou égale à date_from.";
    else {
      f.date_from = df.length === 10 ? `${df} 00:00:00` : df;
      f.date_to = dt.length === 10 ? `${dt} 23:59:59` : dt;
    }
  }

  if (raw.number_prefix != null && String(raw.number_prefix).trim() !== "") {
    const v = String(raw.number_prefix).trim().slice(0, 40);
    if (!/^[A-Za-z0-9\-_.]+$/.test(v)) errors.number_prefix = "Préfixe de contrat invalide.";
    else f.number_prefix = v;
  }
  if (raw.order_by != null && String(raw.order_by).trim() !== "") {
    const v = String(raw.order_by).trim();
    if (!(ORDER_BY as readonly string[]).includes(v)) errors.order_by = "Tri invalide.";
    else f.order_by = v;
  }
  if (raw.sort != null && String(raw.sort).trim() !== "") {
    const v = String(raw.sort).trim().toLowerCase();
    if (!(SORTS as readonly string[]).includes(v)) errors.sort = "Direction de tri invalide.";
    else f.sort = v;
  }
  if (raw.page != null && String(raw.page).trim() !== "") {
    const n = Number(raw.page);
    if (!Number.isInteger(n) || n < 1) errors.page = "page doit être un entier >= 1.";
    else f.page = n;
  }
  if (raw.per_page != null && String(raw.per_page).trim() !== "") {
    const n = Number(raw.per_page);
    if (!Number.isInteger(n) || n < 1) errors.per_page = "per_page doit être un entier >= 1.";
    // Some installed clients predate the server-side 200-row ceiling and ask
    // for 250 or 500 rows. Clamp at the gateway rather than treating a valid
    // Maestro query as an empty report; pagination metadata remains truthful.
    else f.per_page = Math.min(n, 200);
  }
  return { filters: f, errors };
}

export function buildDepositQuery(f: NormalizedFilters): URLSearchParams {
  const qs = new URLSearchParams();
  if (f.users_id) qs.set("users_id", f.users_id);
  if (f.financial_inst_id) qs.set("financial_inst_id", f.financial_inst_id);
  qs.set("commission_type", f.commission_type ?? "base");
  if (f.split_type) qs.set("split_type", f.split_type);
  if (f.date_from && f.date_to) { qs.set("date_from", f.date_from); qs.set("date_to", f.date_to); }
  if (f.number_prefix) qs.set("number_prefix", f.number_prefix);
  qs.set("order_by", f.order_by ?? "date_trans");
  qs.set("sort", f.sort ?? "desc");
  qs.set("page", String(f.page ?? 1));
  qs.set("per_page", String(f.per_page ?? 50));
  return qs;
}

export interface ApiCall {
  ok: boolean;
  status: number;
  data: any;
  durationMs: number;
  error?: string;
}

function upstreamMessage(status: number, text: string, contentType: string | null): string {
  const looksHtml = /<\s*(?:!doctype|html|head|body|center|h1)\b/i.test(text)
    || (contentType ?? "").toLowerCase().includes("text/html");
  if (status >= 500 || looksHtml) return "maestro_upstream_unavailable";
  return "maestro_response_invalid";
}

/** GET with 8s timeout and exactly one retry, only for network/5xx. */
export async function commissionGet(path: string, token: string, correlationId: string): Promise<ApiCall> {
  const url = `${COMMISSION_API_BASE}${path}`;
  const started = Date.now();
  let last: ApiCall | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Correlation-Id": correlationId,
        },
        signal: ctrl.signal,
      });
      const text = await res.text();
      let data: any = null;
      try { data = text ? JSON.parse(text) : null; } catch {
        data = { message: upstreamMessage(res.status, text, res.headers.get("content-type")) };
      }
      // The published Maestro contract uses a JSON object with success/data.
      // Never expose an HTML gateway page or accept a business-level failure
      // as an empty list merely because its HTTP status was 2xx.
      const contractFailure = res.ok && (!data || typeof data !== "object" || data.success === false);
      if (contractFailure) {
        last = {
          ok: false,
          status: 502,
          data: { message: "maestro_contract_error" },
          durationMs: Date.now() - started,
          error: "maestro_contract_error",
        };
      } else if (!res.ok && res.status >= 500) {
        last = {
          ok: false,
          status: res.status,
          data: { message: "maestro_upstream_unavailable" },
          durationMs: Date.now() - started,
          error: "maestro_upstream_unavailable",
        };
      } else {
        last = { ok: res.ok, status: res.status, data, durationMs: Date.now() - started };
      }
      if (res.ok) return last;
      // 401/403/422 are terminal — never retry.
      if (res.status < 500) return last;
    } catch (e) {
      const aborted = String(e).includes("Abort");
      last = {
        ok: false,
        status: aborted ? 504 : 502,
        data: { message: aborted ? "timeout" : "network_error" },
        durationMs: Date.now() - started,
        error: aborted ? "timeout" : "network_error",
      };
    } finally {
      clearTimeout(timer);
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 400));
  }
  return last ?? { ok: false, status: 502, data: { message: "network_error" }, durationMs: Date.now() - started };
}

/** Paid deposits only: never substitutes pending rows or treats a failed bucket as zero. */
export async function collectPaidDeposits(token: string, filters: NormalizedFilters, cid: string) {
  const rows: CommissionDepositRow[] = [];
  let truncated = false;
  const types = filters.commission_type ? [filters.commission_type] : [...COMMISSION_TYPES];
  for (const type of types) {
    for (let page = 1; page <= 100; page++) {
      const qs = buildDepositQuery({ ...filters, order_by: "number", sort: "asc", commission_type: type, page, per_page: 200 });
      const result = await commissionGet(`${PAID_COMMISSION_PATH}?${qs}`, token, cid);
      if (!result.ok) return { rows: [], truncated: false, total: 0, fatal: result };
      if (!Array.isArray(result.data?.data)) {
        return { rows: [], truncated: false, total: 0, fatal: { ...result, ok: false, status: 502, data: { message: "maestro_contract_error" } } };
      }
      const batch: CommissionDepositRow[] = result.data.data;
      rows.push(...batch.map((row) => ({
        ...row, commission_type: row.commission_type ?? type,
      })));
      const lastPage = Number(result.data?.meta?.last_page ?? 1);
      if (page >= lastPage || batch.length === 0) break;
      if (page === 100) truncated = true;
    }
  }
  return { rows, truncated, total: rows.length, fatal: null };
}

export const num = (v: unknown): number => {
  if (v == null) return 0;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export interface CommissionSummary {
  total_commission: number;
  deposit_count: number;
  average_commission: number;
  total_loan_volume: number;
  /** Dossiers uniques (contrats distincts sur les lignes "base"). */
  deal_count: number;
  adjustments: number;
  /** Lignes Maestro sans `date_trans` — exclues de tous les totaux ci-dessus. */
  undated: { count: number; amount: number; loan_amt: number };
  top_institutions: { institution: string; amount: number; count: number }[];
  by_date: { date: string; amount: number; count: number }[];
  truncated: boolean;
}

const hasDate = (r: { date_trans?: string | null }) =>
  /^\d{4}-\d{2}-\d{2}/.test(String((r as any).date_trans ?? "").trim());

/** Same funded-tranche and calendar-period unit rules as the portal engine. */
export function paidFlags(allRows: CommissionDepositRow[]) {
  const rows: RegisterRow[] = allRows.map((r, source_row) => ({
    ...r, loan_amt: num(r.loan_amt), amount: num(r.amount),
    term: r.term == null ? null : String(r.term),
    date_trans: r.date_trans?.trim().slice(0, 10) ?? null,
    commission_type: r.commission_type ?? "base", source_row,
    // Identity scoping: unique Maestro broker id, never the display name.
    broker_user_id: (r as any).broker_user_id ?? (r.agent_name_id != null ? String(r.agent_name_id) : null),
  }));
  return helperFlags(rows, { start: "0000-01-01", end: "9999-12-31" });
}

export function paidAnalytics(allRows: CommissionDepositRow[]) {
  const flags = paidFlags(allRows);
  const months = new Map<string, { key: string; volume: number; commission: number; deals: number }>();
  const lenders = new Map<string, { key: string; volume: number; deals: number }>();
  let volume = 0, deals = 0;
  for (const { row, unique_volume, unique_deal } of flags) {
    if (!hasDate(row)) continue;
    const key = String(row.date_trans).slice(0, 7);
    const m = months.get(key) ?? { key, volume: 0, commission: 0, deals: 0 };
    const loan = unique_volume ? num(row.loan_amt) : 0;
    m.volume += loan; m.commission += num(row.amount); m.deals += unique_deal;
    months.set(key, m); volume += loan; deals += unique_deal;
    if (unique_volume) {
      const name = row.institution?.trim() || "—";
      const lender = lenders.get(name) ?? { key: name, volume: 0, deals: 0 };
      lender.volume += loan; lender.deals += unique_deal; lenders.set(name, lender);
    }
  }
  const types = new Map<string, number>();
  for (const r of allRows.filter(hasDate)) {
    const type = r.commission_type ?? "base";
    types.set(type, (types.get(type) ?? 0) + num(r.amount));
  }
  return { volume, deals, months: [...months.values()].sort((a, b) => a.key.localeCompare(b.key)),
    lenders: [...lenders.values()].sort((a, b) => b.volume - a.volume),
    types: [...types].map(([type, amount]) => ({ type, amount })) };
}

export function summarize(allRows: CommissionDepositRow[], truncated = false): CommissionSummary {
  // Undated rows are excluded from every metric and reported separately.
  const rows = allRows.filter(hasDate);
  const undatedRows = allRows.filter((r) => !hasDate(r));
  const undated = {
    count: undatedRows.length,
    amount: Math.round(undatedRows.reduce((s, r) => s + num(r.amount), 0) * 100) / 100,
    loan_amt: Math.round(undatedRows.reduce((s, r) => s + num(r.loan_amt), 0) * 100) / 100,
  };
  let total = 0, adjustments = 0;
  const analytics = paidAnalytics(rows);
  const inst = new Map<string, { amount: number; count: number }>();
  const byDate = new Map<string, { amount: number; count: number }>();
  for (const r of rows) {
    const amt = num(r.amount);
    total += amt;
    if (Number(r.is_adjustment) === 1) adjustments += 1;
    const key = String(r.institution ?? "—").trim() || "—";
    const i = inst.get(key) ?? { amount: 0, count: 0 };
    i.amount += amt; i.count += 1; inst.set(key, i);
    const d = r.date_trans ? String(r.date_trans).slice(0, 10) : "—";
    const b = byDate.get(d) ?? { amount: 0, count: 0 };
    b.amount += amt; b.count += 1; byDate.set(d, b);
  }
  return {
    total_commission: Math.round(total * 100) / 100,
    deposit_count: rows.length,
    average_commission: rows.length ? Math.round((total / rows.length) * 100) / 100 : 0,
    total_loan_volume: Math.round(analytics.volume * 100) / 100,
    deal_count: analytics.deals,
    adjustments,
    undated,
    top_institutions: [...inst.entries()]
      .map(([institution, v]) => ({ institution, amount: Math.round(v.amount * 100) / 100, count: v.count }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8),
    by_date: [...byDate.entries()]
      .filter(([d]) => d !== "—")
      .map(([date, v]) => ({ date, amount: Math.round(v.amount * 100) / 100, count: v.count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    truncated,
  };
}

/** Institution display label — French first, per the product spec. */
export function institutionLabel(i: any): string {
  return String(i?.company_fr ?? i?.company ?? i?.name ?? "—").trim() || "—";
}

/** Pending-commission rows mapped onto the deposit shape (tolerant field names). */
export function normalizePendingRow(r: any): CommissionDepositRow {
  const pick = (...k: string[]) => { for (const x of k) if (r?.[x] != null && r[x] !== "") return r[x]; return null; };
  return {
    ...r,
    institution: pick("institution", "financial_institution", "lender"),
    amount: pick("commission_amount", "amount", "pending_amount", "commission"),
    date_trans: pick("date_trans", "date_closing", "closing_date", "date", "funding_date", "created_at"),
    commission_type: String(pick("commission_type") ?? "base").toLowerCase(),
    // Volume counted once per contract (base row only) to avoid 4x duplication.
    loan_amt: String(pick("commission_type") ?? "base").toLowerCase() === "base" ? pick("loan_amt", "loan_amount") : 0,
    number: pick("number", "filogix", "contract_id", "file_number"),
  } as CommissionDepositRow;
}
