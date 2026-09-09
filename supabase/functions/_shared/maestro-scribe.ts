// Scott's Scribe API (2026-09-07 release): CRUD clients / addresses / telephones,
// create contract + get contracts with filtering.
//
// The documented route prefix changed, so the exact base is auto-discovered
// once and cached. Configure `scribe_prefix` in planipret_integration_secrets
// (provider `maestro_telecom`) or MAESTRO_SCRIBE_PREFIX to pin it.
import { MaestroConfig } from "./maestro.ts";

const HOST_RE = /^(https?:\/\/[^/]+)/i;

export const SCRIBE_PREFIX_CANDIDATES = [
  "/scribe/api/v1",
  "/api/scribe/v1",
  "/api/v1/scribe",
  "/telecom/api/v1",
  "/api/v1",
];

let cachedPrefix: { base: string; prefix: string; at: number } | null = null;

function host(cfg: MaestroConfig): string {
  return (cfg.url.match(HOST_RE)?.[1] ?? cfg.url).replace(/\/$/, "");
}

export function scribeBases(cfg: MaestroConfig): string[] {
  const h = host(cfg);
  const withPath = cfg.url.replace(/\/$/, "");
  return Array.from(new Set([h, withPath]));
}

async function probe(cfg: MaestroConfig): Promise<{ base: string; prefix: string } | null> {
  for (const base of scribeBases(cfg)) {
    for (const prefix of SCRIBE_PREFIX_CANDIDATES) {
      try {
        const r = await fetch(`${base}${prefix}/clients?machine=1&limit=1`, {
          headers: { Authorization: `Bearer ${cfg.key}`, Accept: "application/json" },
        });
        if (r.status !== 404 && r.status !== 403 && r.status < 500) {
          await r.body?.cancel().catch(() => {});
          return { base, prefix };
        }
        await r.body?.cancel().catch(() => {});
      } catch { /* keep probing */ }
    }
  }
  return null;
}

/** Resolve (and cache for 10 min) the live Scribe base + prefix. */
export async function resolveScribeRoot(
  cfg: MaestroConfig,
  configured?: string | null,
): Promise<{ base: string; prefix: string; discovered: boolean }> {
  const pinned = (configured ?? Deno.env.get("MAESTRO_SCRIBE_PREFIX") ?? "").trim();
  if (pinned) {
    const m = pinned.match(HOST_RE);
    return m
      ? { base: m[1], prefix: pinned.slice(m[1].length).replace(/\/$/, ""), discovered: false }
      : { base: host(cfg), prefix: pinned.replace(/\/$/, ""), discovered: false };
  }
  if (cachedPrefix && Date.now() - cachedPrefix.at < 600_000) {
    return { base: cachedPrefix.base, prefix: cachedPrefix.prefix, discovered: true };
  }
  const found = await probe(cfg);
  if (found) {
    cachedPrefix = { ...found, at: Date.now() };
    return { ...found, discovered: true };
  }
  return { base: host(cfg), prefix: SCRIBE_PREFIX_CANDIDATES[0], discovered: false };
}

export interface ScribeResult<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
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
  } = {},
): Promise<ScribeResult<T>> {
  if (!cfg.url || !cfg.key) {
    return { ok: false, status: 0, data: null, error: "maestro_not_configured", endpoint: path };
  }
  const root = await resolveScribeRoot(cfg, opts.prefix ?? null);
  const qs = new URLSearchParams({ machine: "1" });
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  const endpoint = `${root.base}${root.prefix}${path}?${qs.toString()}`;
  try {
    const res = await fetch(endpoint, {
      method: opts.method ?? "GET",
      headers: {
        Authorization: `Bearer ${cfg.key}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 800) }; }
    return {
      ok: res.ok,
      status: res.status,
      data,
      error: res.ok ? null : (data?.message || data?.error || `HTTP ${res.status}`),
      endpoint,
    };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: String((e as Error)?.message ?? e), endpoint };
  }
}

// ── Clients CRUD ─────────────────────────────────────────────────────────
export const listClients = (cfg: MaestroConfig, query: Record<string, any> = {}, prefix?: string | null) =>
  scribeFetch(cfg, "/clients", { query, prefix });
export const getClient = (cfg: MaestroConfig, id: string | number, prefix?: string | null) =>
  scribeFetch(cfg, `/clients/${encodeURIComponent(String(id))}`, { prefix });
export const createClient_ = (cfg: MaestroConfig, body: Record<string, unknown>, prefix?: string | null) =>
  scribeFetch(cfg, "/clients", { method: "POST", body, prefix });
export const updateClient = (cfg: MaestroConfig, id: string | number, body: Record<string, unknown>, prefix?: string | null) =>
  scribeFetch(cfg, `/clients/${encodeURIComponent(String(id))}`, { method: "PUT", body, prefix });
export const deleteClient = (cfg: MaestroConfig, id: string | number, prefix?: string | null) =>
  scribeFetch(cfg, `/clients/${encodeURIComponent(String(id))}`, { method: "DELETE", prefix });

// ── Addresses CRUD ───────────────────────────────────────────────────────
export const listAddresses = (cfg: MaestroConfig, query: Record<string, any> = {}, prefix?: string | null) =>
  scribeFetch(cfg, "/addresses", { query, prefix });
export const getAddress = (cfg: MaestroConfig, id: string | number, prefix?: string | null) =>
  scribeFetch(cfg, `/addresses/${encodeURIComponent(String(id))}`, { prefix });
export const createAddress = (cfg: MaestroConfig, body: Record<string, unknown>, prefix?: string | null) =>
  scribeFetch(cfg, "/addresses", { method: "POST", body, prefix });
export const updateAddress = (cfg: MaestroConfig, id: string | number, body: Record<string, unknown>, prefix?: string | null) =>
  scribeFetch(cfg, `/addresses/${encodeURIComponent(String(id))}`, { method: "PUT", body, prefix });
export const deleteAddress = (cfg: MaestroConfig, id: string | number, prefix?: string | null) =>
  scribeFetch(cfg, `/addresses/${encodeURIComponent(String(id))}`, { method: "DELETE", prefix });

// ── Telephones CRUD ──────────────────────────────────────────────────────
export const listTelephones = (cfg: MaestroConfig, query: Record<string, any> = {}, prefix?: string | null) =>
  scribeFetch(cfg, "/telephones", { query, prefix });
export const getTelephone = (cfg: MaestroConfig, id: string | number, prefix?: string | null) =>
  scribeFetch(cfg, `/telephones/${encodeURIComponent(String(id))}`, { prefix });
export const createTelephone = (cfg: MaestroConfig, body: Record<string, unknown>, prefix?: string | null) =>
  scribeFetch(cfg, "/telephones", { method: "POST", body, prefix });
export const updateTelephone = (cfg: MaestroConfig, id: string | number, body: Record<string, unknown>, prefix?: string | null) =>
  scribeFetch(cfg, `/telephones/${encodeURIComponent(String(id))}`, { method: "PUT", body, prefix });
export const deleteTelephone = (cfg: MaestroConfig, id: string | number, prefix?: string | null) =>
  scribeFetch(cfg, `/telephones/${encodeURIComponent(String(id))}`, { method: "DELETE", prefix });

// ── Contracts ────────────────────────────────────────────────────────────
/** Filters supported by Scott's endpoint (admin defaults to a 1-month range). */
export const CONTRACT_FILTERS = [
  "contract_id", "client_id", "agent_id", "institution_id", "application_id",
  "mortgage_id", "status", "date_from", "date_to", "date_field",
  "page", "limit", "sort",
] as const;

export const listContracts = (cfg: MaestroConfig, query: Record<string, any> = {}, prefix?: string | null) => {
  const clean: Record<string, any> = {};
  for (const k of CONTRACT_FILTERS) if (query[k] !== undefined) clean[k] = query[k];
  return scribeFetch(cfg, "/contracts", { query: clean, prefix });
};
export const getContract = (cfg: MaestroConfig, id: string | number, prefix?: string | null) =>
  scribeFetch(cfg, `/contracts/${encodeURIComponent(String(id))}`, { prefix });
export const createContract = (cfg: MaestroConfig, body: Record<string, unknown>, prefix?: string | null) =>
  scribeFetch(cfg, "/contracts", { method: "POST", body, prefix });
