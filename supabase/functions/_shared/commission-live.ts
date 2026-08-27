// Live Maestro deposits merged into the register-based dashboards.
//
// The official Commission Reports API is strictly token-owner scoped: a token
// only ever returns its own broker's deposits (verified — passing another
// broker's `users_id` returns zero rows). So the only way to widen the live
// view is to fan out over every broker who connected their Maestro account.
// Whatever the API can't cover stays covered by the imported register.


export type LiveRegisterRow = {
  number: string | null;
  loan_amt: number | null;
  institution: string | null;
  amount: number | null;
  mortgage_type: string | null;
  term: string | null;
  agent_name: string | null;
  target_name: string | null;
  date_trans: string | null;
  commission_type: string | null;
  is_adjustment: unknown;
  source_row: number;
  broker_user_id: string | null;
  maestro_broker_id: string | null;
  cabinet: string | null;
  fiscal_year: number | null;
  agent_key: string | null;
  first_name: string | null;
  last_name: string | null;
  sheet_name: string;
  provenance: "maestro";
};

export type LiveResult = {
  rows: LiveRegisterRow[];
  coverage: { connected: number; total: number };
  failures: { broker: string; status: number; message: string }[];
  brokers: string[];
  syncedAt?: string | null;
};

/** `number|date|amount|type` — stable across the register and the API. */
export const dedupeKey = (r: {
  number?: string | null;
  date_trans?: string | null;
  amount?: unknown;
  commission_type?: string | null;
}) =>
  [
    String(r.number ?? "").trim().toUpperCase(),
    String(r.date_trans ?? "").slice(0, 10),
    Number(
      typeof r.amount === "number" ? r.amount : parseFloat(String(r.amount ?? "").replace(/[^0-9.-]/g, "")),
    ).toFixed(2),
    String(r.commission_type ?? "").trim().toLowerCase(),
  ].join("|");

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Pulls live deposits for the caller (and, for admins, every broker with a
 * connected Maestro account) and shapes them like register rows.
 */
/**
 * Reads the asynchronously synced Maestro deposits from
 * `planipret_commission_live_cache` (filled by `pp-commission-live-sync`) and
 * shapes them like register rows. Reading a cache keeps the dashboards fast
 * and makes every broker visible as soon as the sweeper covered them.
 */
export async function fetchLiveRegisterRows(
  admin: any,
  userId: string,
  isAdmin: boolean,
  years: number[],
  _cid: string,
  agentFilter?: string | null,
): Promise<LiveResult> {
  const out: LiveRegisterRow[] = [];
  const failures: LiveResult["failures"] = [];
  const brokers = new Set<string>();

  let q = admin
    .from("planipret_commission_live_cache")
    .select("broker_user_id, broker_label, maestro_broker_id, agent_name, date_trans, fiscal_year, row_data, synced_at")
    .in("fiscal_year", years)
    .limit(20000);
  if (!isAdmin) q = q.eq("broker_user_id", userId);
  if (agentFilter) q = q.ilike("agent_name", agentFilter);

  const { data: cached, error } = await q;
  if (error) failures.push({ broker: "cache", status: 500, message: error.message });

  let seq = -1;
  let syncedAt: string | null = null;
  for (const c of (cached ?? []) as any[]) {
    const d = c.row_data ?? {};
    const name = String(c.agent_name ?? c.broker_label ?? "").trim();
    brokers.add(name || String(c.broker_label ?? ""));
    if (!syncedAt || (c.synced_at && c.synced_at > syncedAt)) syncedAt = c.synced_at ?? syncedAt;
    out.push({
      number: d.number ?? null,
      loan_amt: num(d.loan_amt),
      institution: d.institution ?? null,
      amount: num(d.amount),
      mortgage_type: d.mortgage_type ?? null,
      term: d.term != null ? String(d.term) : null,
      agent_name: name || null,
      target_name: d.target_name ?? null,
      date_trans: c.date_trans ?? null,
      commission_type: d.commission_type ?? "base",
      is_adjustment: d.is_adjustment ?? null,
      source_row: seq--,
      broker_user_id: c.broker_user_id ?? null,
      maestro_broker_id: c.maestro_broker_id ?? null,
      cabinet: d.cabinet ?? null,
      fiscal_year: c.fiscal_year ?? null,
      agent_key: null,
      first_name: null,
      last_name: null,
      sheet_name: "maestro",
      provenance: "maestro",
    });
  }

  // Coverage comes from the per-broker diagnostics written by the sweeper.
  let connected = 0;
  let total = 1;
  const { data: diag } = await admin
    .from("planipret_commission_sync_diag")
    .select("broker_label, connected, status, reason, http_status")
    .limit(1000);
  const { count } = await admin.from("planipret_profiles").select("id", { count: "exact", head: true });
  total = Number(count ?? 0) || 1;
  for (const d of (diag ?? []) as any[]) {
    if (d.connected) connected += 1;
    if (isAdmin && d.status === "error") {
      failures.push({ broker: String(d.broker_label ?? "?"), status: Number(d.http_status ?? 0), message: String(d.reason ?? "") });
    }
  }
  if (!isAdmin) { connected = Math.min(connected, 1); total = 1; }

  return { rows: out, coverage: { connected, total: Math.max(total, connected) }, failures, brokers: [...brokers], syncedAt };
}
