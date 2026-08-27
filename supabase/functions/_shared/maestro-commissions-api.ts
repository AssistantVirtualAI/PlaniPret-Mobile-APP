// Shared client for the official Maestro Commission Reports API.
// Docs: https://client.planipret.com/api-docs/index.html
//   GET /api/main/commissions/reports/deposits
//   GET /api/main/commissions/reports/agents
//   GET /api/main/financial-institutions
//
// Authenticated with the broker's Maestro OAuth access token (Bearer).
// The `users_id` filter scopes every row to one broker (their internal
// Maestro user id, e.g. 93135).

const API_BASE = (Deno.env.get("PLANIPRET_API_BASE_URL") ?? "https://client.planipret.com").replace(/\/$/, "");

/** One row from /commissions/reports/deposits — field names per the official spec. */
export interface CommissionDeposit {
  number: string | null;
  loan_amt: string | number | null;
  primary_client_name: string | null;
  secondary_client_name: string | null;
  institution: string | null;
  financial_inst_id: number | null;
  is_adjustment: number | null;
  points: string | number | null;
  buy_down: string | number | null;
  amount: string | number | null;     // the commission amount
  mortgage_type: string | null;
  term: string | number | null;
  agent_name_id: number | null;
  agent_name: string | null;
  target_name_id: number | null;
  target_name: string | null;
  date_trans: string | null;          // "YYYY-MM-DD"
  commission_type: string | null;
  split_type: string | null;
  agent_company: string | null;
  cabinet: string | null;
}

export interface FetchDepositsOpts {
  token: string;
  usersId: string;
  dateFrom?: string;   // "YYYY-MM-DD HH:MM:SS"
  dateTo?: string;
  perPage?: number;
  maxPages?: number;
  timeoutMs?: number;
  /** Maestro defaults to "base" when omitted — always be explicit. */
  commissionType?: CommissionTypeId;
}

/** The four commission buckets that make up a broker's gross commission. */
export const COMMISSION_TYPE_IDS = ["base", "bonus", "bonus2", "perform"] as const;
export type CommissionTypeId = typeof COMMISSION_TYPE_IDS[number];

export interface FetchDepositsResult {
  ok: boolean;
  status: number;
  rows: CommissionDeposit[];
  error?: string;
  meta?: any;
  pages?: number;
  /** true when pagination stopped at maxPages before reaching last_page */
  truncated?: boolean;
}

async function fetchJson(url: string, token: string, timeoutMs: number): Promise<{ ok: boolean; status: number; data: any }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 500) }; }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    const aborted = String(e).includes("Abort");
    return { ok: false, status: aborted ? 408 : 599, data: { message: aborted ? "timeout" : String(e) } };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Paginated fetch of a broker's commission deposit rows.
 * Walks `page` until `meta.last_page` is reached (bounded by `maxPages`).
 */
export async function fetchCommissionDeposits(opts: FetchDepositsOpts): Promise<FetchDepositsResult> {
  const { token, usersId, dateFrom, dateTo, perPage = 100, maxPages = 60, timeoutMs = 20_000, commissionType = "base" } = opts;
  if (!token) return { ok: false, status: 401, rows: [], error: "no_token" };
  if (!usersId || !/^\d+$/.test(usersId)) return { ok: false, status: 400, rows: [], error: "invalid_users_id" };

  const out: CommissionDeposit[] = [];
  let meta: any = null;
  let truncatedPages = false;
  let page = 1;
  while (page <= maxPages) {
    const qs = new URLSearchParams({
      users_id: usersId,
      per_page: String(perPage),
      page: String(page),
      order_by: "date_trans",
      sort: "desc",
      commission_type: commissionType,
    });
    if (dateFrom) qs.set("date_from", dateFrom);
    if (dateTo) qs.set("date_to", dateTo);

    const r = await fetchJson(`${API_BASE}/api/main/commissions/reports/deposits?${qs}`, token, timeoutMs);
    if (!r.ok) {
      return { ok: false, status: r.status, rows: out, error: r.data?.message ?? r.data?.error ?? `HTTP ${r.status}`, meta: r.data };
    }
    const rows: any[] = Array.isArray(r.data?.data) ? r.data.data : [];
    out.push(...(rows as CommissionDeposit[]));
    meta = r.data?.meta ?? null;
    const lastPage = Number(meta?.last_page ?? 1);
    if (rows.length === 0 || page >= lastPage) break;
    if (page >= maxPages) { truncatedPages = true; break; }
    page++;
  }
  return { ok: true, status: 200, rows: out, meta, pages: page, truncated: truncatedPages };
}

/**
 * Gross commission = base + bonus + bonus2 + perform.
 * Maestro only ever returns ONE bucket per call (default "base"), so a broker's
 * real gross commission requires walking every bucket. Each returned row keeps
 * its bucket in `commission_type`.
 */
export async function fetchAllCommissionDeposits(
  opts: Omit<FetchDepositsOpts, "commissionType">,
): Promise<FetchDepositsResult & { byType: Record<string, number>; okTypes: string[]; failedTypes: string[]; truncated: boolean }> {
  const rows: CommissionDeposit[] = [];
  const byType: Record<string, number> = {};
  let anyOk = false;
  const okTypes: string[] = [];
  const failedTypes: string[] = [];
  let truncated = false;
  let lastError: { status: number; error?: string; meta?: any } | null = null;

  for (const type of COMMISSION_TYPE_IDS) {
    const r = await fetchCommissionDeposits({ ...opts, commissionType: type });
    if (!r.ok) { lastError = { status: r.status, error: r.error, meta: r.meta }; failedTypes.push(type); continue; }
    anyOk = true;
    okTypes.push(type);
    if (r.truncated) truncated = true;
    byType[type] = r.rows.length;
    for (const row of r.rows) rows.push({ ...row, commission_type: row.commission_type ?? type });
  }

  if (!anyOk) {
    return { ok: false, status: lastError?.status ?? 599, rows: [], error: lastError?.error ?? "no_data", meta: lastError?.meta, byType, okTypes: [], failedTypes: [...COMMISSION_TYPE_IDS], truncated: false };
  }
  return { ok: true, status: 200, rows, byType, okTypes, failedTypes, truncated };
}

/** List of agents available for commission reports (admin discovery). */
export async function fetchCommissionAgents(token: string, timeoutMs = 15_000): Promise<{ ok: boolean; status: number; agents: any[]; error?: string }> {
  if (!token) return { ok: false, status: 401, agents: [], error: "no_token" };
  const r = await fetchJson(`${API_BASE}/api/main/commissions/reports/agents`, token, timeoutMs);
  if (!r.ok) return { ok: false, status: r.status, agents: [], error: r.data?.message ?? `HTTP ${r.status}` };
  const agents = Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : []);
  return { ok: true, status: 200, agents };
}

/** Lender directory. */
export async function fetchFinancialInstitutions(token: string, timeoutMs = 15_000): Promise<{ ok: boolean; status: number; institutions: any[]; error?: string }> {
  if (!token) return { ok: false, status: 401, institutions: [], error: "no_token" };
  const r = await fetchJson(`${API_BASE}/api/main/financial-institutions`, token, timeoutMs);
  if (!r.ok) return { ok: false, status: r.status, institutions: [], error: r.data?.message ?? `HTTP ${r.status}` };
  const list = Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : []);
  return { ok: true, status: 200, institutions: list };
}

export const commissionApiBase = API_BASE;
