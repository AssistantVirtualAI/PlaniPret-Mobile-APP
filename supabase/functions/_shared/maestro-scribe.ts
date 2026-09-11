// Planiprêt public API (Scribe docs, 2026-09-09).
//   Base URL : https://client.planipret.com
//   Prefix   : /api/main
//   Auth     : Authorization: Bearer <token>
//
// Documented resources:
//   Clients      POST/GET/PUT   /clients[/{clientId}]
//                POST/PUT/DEL   /clients/{clientId}/addresses[/{addressId}]
//                POST/PUT/DEL   /clients/{clientId}/telephones[/{telephoneId}]
//   Contracts    POST /contracts, GET /contracts, PUT /contracts/{contractId}
//   Institutions GET  /financial-institutions
//   Commissions  GET  /commissions/reports/deposits, /commissions/reports/agents
//   Tasks        POST /tasks, GET /tasks, PUT /tasks/{id}, DELETE /tasks/{id}
import { MaestroConfig } from "./maestro.ts";

const HOST_RE = /^(https?:\/\/[^/]+)/i;

/** Documented route prefix. Override only via MAESTRO_API_PREFIX. */
export const API_PREFIX = (Deno.env.get("MAESTRO_API_PREFIX") ?? "/api/main").replace(/\/$/, "");
export const DEFAULT_HOST = "https://client.planipret.com";

function host(cfg: MaestroConfig): string {
  const raw = (cfg.url || DEFAULT_HOST).trim();
  return (raw.match(HOST_RE)?.[1] ?? DEFAULT_HOST).replace(/\/$/, "");
}

export function apiRoot(cfg: MaestroConfig, prefix?: string | null): { base: string; prefix: string } {
  const pinned = (prefix ?? "").trim();
  if (pinned) {
    const m = pinned.match(HOST_RE);
    return m
      ? { base: m[1], prefix: pinned.slice(m[1].length).replace(/\/$/, "") }
      : { base: host(cfg), prefix: pinned.replace(/\/$/, "") };
  }
  return { base: host(cfg), prefix: API_PREFIX };
}

export interface ScribeResult<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  meta?: any;
  error: string | null;
  errors?: Record<string, string[]> | null;
  endpoint: string;
}

export async function scribeFetch<T = any>(
  cfg: MaestroConfig,
  path: string,
  opts: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined | null>;
    prefix?: string | null;
    token?: string | null;
  } = {},
): Promise<ScribeResult<T>> {
  const token = opts.token ?? cfg.key;
  if (!token) {
    return { ok: false, status: 0, data: null, error: "maestro_not_configured", endpoint: path };
  }
  const root = apiRoot(cfg, opts.prefix ?? null);
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  const endpoint = `${root.base}${root.prefix}${path}${qs.toString() ? `?${qs}` : ""}`;
  try {
    const res = await fetch(endpoint, {
      method: opts.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    let payload: any = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text.slice(0, 800) }; }
    return {
      ok: res.ok && payload?.success !== false,
      status: res.status,
      // The documented envelope is { data, meta?, links?, success }.
      data: payload && Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload,
      meta: payload?.meta ?? null,
      error: res.ok ? null : (payload?.message || payload?.error || `HTTP ${res.status}`),
      errors: payload?.errors ?? null,
      endpoint,
    };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: String((e as Error)?.message ?? e), endpoint };
  }
}

type Opts = { prefix?: string | null; token?: string | null };
const id = (v: string | number) => encodeURIComponent(String(v));

// ── Clients ──────────────────────────────────────────────────────────────
export const getClient = (cfg: MaestroConfig, clientId: string | number, o: Opts = {}) =>
  scribeFetch(cfg, `/clients/${id(clientId)}`, o);
export const createClient_ = (cfg: MaestroConfig, body: Record<string, unknown>, o: Opts = {}) =>
  scribeFetch(cfg, "/clients", { method: "POST", body, ...o });
export const updateClient = (cfg: MaestroConfig, clientId: string | number, body: Record<string, unknown>, o: Opts = {}) =>
  scribeFetch(cfg, `/clients/${id(clientId)}`, { method: "PUT", body: { client_id: Number(clientId), ...body }, ...o });

// ── Client addresses ─────────────────────────────────────────────────────
export const createAddress = (cfg: MaestroConfig, clientId: string | number, body: Record<string, unknown>, o: Opts = {}) =>
  scribeFetch(cfg, `/clients/${id(clientId)}/addresses`, { method: "POST", body, ...o });
export const updateAddress = (cfg: MaestroConfig, clientId: string | number, addressId: string | number, body: Record<string, unknown>, o: Opts = {}) =>
  scribeFetch(cfg, `/clients/${id(clientId)}/addresses/${id(addressId)}`, { method: "PUT", body, ...o });
export const deleteAddress = (cfg: MaestroConfig, clientId: string | number, addressId: string | number, o: Opts = {}) =>
  scribeFetch(cfg, `/clients/${id(clientId)}/addresses/${id(addressId)}`, { method: "DELETE", ...o });

// ── Client telephones ────────────────────────────────────────────────────
export const createTelephone = (cfg: MaestroConfig, clientId: string | number, body: Record<string, unknown>, o: Opts = {}) =>
  scribeFetch(cfg, `/clients/${id(clientId)}/telephones`, { method: "POST", body, ...o });
export const updateTelephone = (cfg: MaestroConfig, clientId: string | number, telephoneId: string | number, body: Record<string, unknown>, o: Opts = {}) =>
  scribeFetch(cfg, `/clients/${id(clientId)}/telephones/${id(telephoneId)}`, { method: "PUT", body, ...o });
export const deleteTelephone = (cfg: MaestroConfig, clientId: string | number, telephoneId: string | number, o: Opts = {}) =>
  scribeFetch(cfg, `/clients/${id(clientId)}/telephones/${id(telephoneId)}`, { method: "DELETE", ...o });

// ── Contracts ────────────────────────────────────────────────────────────
export const CONTRACT_FILTERS = [
  "search", "agent_id", "client_id", "financial_inst_id", "status",
  "status_of_transaction", "application_type", "application_purpose",
  "mortgage_type", "is_external", "date_from", "date_to",
  "order_by", "sort", "page", "per_page",
] as const;

export const listContracts = (cfg: MaestroConfig, query: Record<string, any> = {}, o: Opts = {}) => {
  const clean: Record<string, any> = {};
  for (const k of CONTRACT_FILTERS) if (query[k] !== undefined) clean[k] = query[k];
  return scribeFetch(cfg, "/contracts", { query: clean, ...o });
};
export const createContract = (cfg: MaestroConfig, body: Record<string, unknown>, o: Opts = {}) =>
  scribeFetch(cfg, "/contracts", { method: "POST", body, ...o });
export const updateContract = (cfg: MaestroConfig, contractId: string | number, body: Record<string, unknown>, o: Opts = {}) =>
  scribeFetch(cfg, `/contracts/${id(contractId)}`, { method: "PUT", body, ...o });

// ── Financial institutions ───────────────────────────────────────────────
export const listFinancialInstitutions = (cfg: MaestroConfig, o: Opts = {}) =>
  scribeFetch(cfg, "/financial-institutions", o);

// ── Commission reports ───────────────────────────────────────────────────
export const COMMISSION_FILTERS = [
  "users_id", "financial_inst_id", "commission_type", "split_type",
  "date_from", "date_to", "number_prefix", "order_by", "sort", "page", "per_page",
] as const;

export const commissionDeposits = (cfg: MaestroConfig, query: Record<string, any> = {}, o: Opts = {}) => {
  const clean: Record<string, any> = {};
  for (const k of COMMISSION_FILTERS) if (query[k] !== undefined) clean[k] = query[k];
  return scribeFetch(cfg, "/commissions/reports/deposits", { query: clean, ...o });
};
export const commissionAgents = (cfg: MaestroConfig, o: Opts = {}) =>
  scribeFetch(cfg, "/commissions/reports/agents", o);

// ── Tasks (documented list + CRUD) ───────────────────────────────────────
export const TASK_FILTERS = [
  "status", "type", "search", "delegate_users_id", "target_id",
  "date_from", "date_to", "is_recurring", "option_id", "color",
  "number", "date_scope", "order_by", "sort", "page", "per_page",
] as const;

export const listTasks = (cfg: MaestroConfig, query: Record<string, any> = {}, o: Opts = {}) => {
  const clean: Record<string, any> = {};
  for (const k of TASK_FILTERS) if (query[k] !== undefined) clean[k] = query[k];
  return scribeFetch(cfg, "/tasks", { query: clean, ...o });
};
export const createTask = (cfg: MaestroConfig, body: Record<string, unknown>, o: Opts = {}) =>
  scribeFetch(cfg, "/tasks", { method: "POST", body, ...o });
export const updateTask = (cfg: MaestroConfig, taskId: string | number, body: Record<string, unknown>, o: Opts = {}) =>
  scribeFetch(cfg, `/tasks/${id(taskId)}`, { method: "PUT", body: { task_id: Number(taskId), ...body }, ...o });
export const deleteTask = (cfg: MaestroConfig, taskId: string | number, o: Opts = {}) =>
  scribeFetch(cfg, `/tasks/${id(taskId)}`, { method: "DELETE", body: { task_id: Number(taskId) }, ...o });
