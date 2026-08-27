// Shared, allowlisted client for the OFFICIAL Planiprêt Commission Reports API.
//   GET /api/main/commissions/reports/deposits
//   GET /api/main/commissions/reports/agents
//   GET /api/main/financial-institutions
//
// Read-only. Never mutates a commission. The Bearer token stays server-side.

export const COMMISSION_API_BASE = (
  (globalThis as any).Deno?.env?.get("PLANIPRET_API_BASE_URL") ?? "https://client.planipret.com"
).replace(/\/$/, "");


export const COMMISSION_TYPES = ["base", "bonus", "bonus2", "perform"] as const;
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
    if (!Number.isInteger(n) || n < 1 || n > 200) errors.per_page = "per_page doit être entre 1 et 200.";
    else f.per_page = n;
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
      try { data = text ? JSON.parse(text) : null; } catch { data = { message: text.slice(0, 300) }; }
      last = { ok: res.ok, status: res.status, data, durationMs: Date.now() - started };
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
  return last!;
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

const hasDate = (r: CommissionDepositRow) =>
  /^\d{4}-\d{2}-\d{2}/.test(String((r as any).date_trans ?? "").trim());

export function summarize(allRows: CommissionDepositRow[], truncated = false): CommissionSummary {
  // Undated rows are excluded from every metric and reported separately.
  const rows = allRows.filter(hasDate);
  const undatedRows = allRows.filter((r) => !hasDate(r));
  const undated = {
    count: undatedRows.length,
    amount: Math.round(undatedRows.reduce((s, r) => s + num(r.amount), 0) * 100) / 100,
    loan_amt: Math.round(undatedRows.reduce((s, r) => s + num(r.loan_amt), 0) * 100) / 100,
  };
  let total = 0, volume = 0, adjustments = 0;
  const deals = new Set<string>();
  const inst = new Map<string, { amount: number; count: number }>();
  const byDate = new Map<string, { amount: number; count: number }>();
  for (const r of rows) {
    const amt = num(r.amount);
    total += amt;
    volume += num(r.loan_amt);
    const ctype = String((r as any).commission_type ?? "base").trim().toLowerCase() || "base";
    if (ctype === "base" && (r as any).number) deals.add(String((r as any).number));
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
    total_loan_volume: Math.round(volume * 100) / 100,
    deal_count: deals.size,
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
