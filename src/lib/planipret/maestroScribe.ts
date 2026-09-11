/**
 * Client typé pour l'API publique Planiprêt (`/api/main`), routée via
 * l'edge function `pp-maestro-scribe`. Aucune clé n'est exposée côté client.
 */
import { safeEdgeFunction } from "@/lib/safeEdgeFunction";

export interface ScribeResponse<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  meta?: any;
  error: string | null;
  errors?: Record<string, string[]> | null;
  endpoint?: string;
}

async function call<T = any>(
  action: string,
  opts: {
    id?: string | number;
    sub_id?: string | number;
    payload?: Record<string, unknown>;
    query?: Record<string, any>;
    prefix?: string;
  } = {},
): Promise<ScribeResponse<T>> {
  const res = await safeEdgeFunction<any>("pp-maestro-scribe", {
    method: "POST",
    body: { action, ...opts },
  });
  if (res.error && !res.data) {
    return { ok: false, status: res.status ?? 0, data: null, error: res.error };
  }
  const d = res.data ?? {};
  return {
    ok: !!d.ok,
    status: d.status ?? res.status ?? 0,
    data: d.data ?? null,
    meta: d.meta ?? null,
    error: d.error ?? null,
    errors: d.errors ?? null,
    endpoint: d.endpoint,
  };
}

export const scribeDiag = () => call("diag");

export const clients = {
  get: (id: string | number) => call("clients.get", { id }),
  create: (payload: Record<string, unknown>) => call("clients.create", { payload }),
  update: (id: string | number, payload: Record<string, unknown>) => call("clients.update", { id, payload }),
};

export const addresses = {
  create: (clientId: string | number, payload: Record<string, unknown>) => call("addresses.create", { id: clientId, payload }),
  update: (clientId: string | number, addressId: string | number, payload: Record<string, unknown>) =>
    call("addresses.update", { id: clientId, sub_id: addressId, payload }),
  remove: (clientId: string | number, addressId: string | number) =>
    call("addresses.delete", { id: clientId, sub_id: addressId }),
};

export const telephones = {
  create: (clientId: string | number, payload: Record<string, unknown>) => call("telephones.create", { id: clientId, payload }),
  update: (clientId: string | number, telephoneId: string | number, payload: Record<string, unknown>) =>
    call("telephones.update", { id: clientId, sub_id: telephoneId, payload }),
  remove: (clientId: string | number, telephoneId: string | number) =>
    call("telephones.delete", { id: clientId, sub_id: telephoneId }),
};

export interface ContractFilters {
  search?: string;
  agent_id?: string | number;
  client_id?: string | number;
  financial_inst_id?: string | number;
  status?: string;
  status_of_transaction?: string;
  application_type?: string;
  application_purpose?: number;
  mortgage_type?: string;
  is_external?: boolean | 0 | 1;
  date_from?: string;
  date_to?: string;
  order_by?: "date_maturity" | "date_closing" | "date_entry" | "created" | "number" | "status";
  sort?: "asc" | "desc";
  page?: number;
  per_page?: number;
}

export const contracts = {
  /** Sans filtre, les admins reçoivent le mois précédent. */
  list: (filters: ContractFilters = {}) => call("contracts.list", { query: filters }),
  create: (payload: Record<string, unknown>) => call("contracts.create", { payload }),
  update: (id: string | number, payload: Record<string, unknown>) => call("contracts.update", { id, payload }),
};

export const financialInstitutions = {
  list: () => call("institutions.list"),
};

export interface CommissionFilters {
  users_id?: number;
  financial_inst_id?: number;
  commission_type?: "base" | "bonus" | "bonus2" | "perform";
  split_type?: "planipret" | "planipret_override" | "planipret_external";
  date_from?: string;
  date_to?: string;
  number_prefix?: string;
  order_by?: string;
  sort?: "asc" | "desc";
  page?: number;
  per_page?: number;
}

export const commissions = {
  deposits: (filters: CommissionFilters = {}) => call("commissions.deposits", { query: filters }),
  agents: () => call("commissions.agents"),
};

export interface TaskFilters {
  status?: "pending" | "open" | "complete" | "all";
  type?: "user" | "contract";
  search?: string;
  delegate_users_id?: number;
  target_id?: number;
  date_from?: string;
  date_to?: string;
  is_recurring?: boolean | 0 | 1;
  option_id?: number;
  color?: string;
  number?: string;
  date_scope?: "late" | "today" | "tomorrow" | "this_week";
  order_by?: "date" | "created" | "client_name" | "delegate_name";
  sort?: "asc" | "desc";
  page?: number;
  per_page?: number;
}

export const tasks = {
  list: (filters: TaskFilters = {}) => call("tasks.list", { query: filters }),
  create: (payload: Record<string, unknown>) => call("tasks.create", { payload }),
  update: (id: string | number, payload: Record<string, unknown>) => call("tasks.update", { id, payload }),
  remove: (id: string | number) => call("tasks.delete", { id }),
};

export const maestroScribe = {
  scribeDiag,
  clients,
  addresses,
  telephones,
  contracts,
  financialInstitutions,
  commissions,
  tasks,
};
