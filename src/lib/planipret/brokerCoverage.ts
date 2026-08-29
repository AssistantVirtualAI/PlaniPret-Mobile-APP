/**
 * Explains, per broker, WHY there is no commission data:
 *  - `not_connected`      : the broker never authorized Maestro
 *  - `no_admin_scope`     : not connected AND no firm-wide admin credential configured
 *  - `api_empty`          : connected, but Maestro returns no deposits
 *  - `error`              : API error during the last sync
 *  - `not_in_register`    : never synced and absent from the imported global register
 *  - `ok`                 : data available
 */
import { supabase } from "@/integrations/supabase/client";

export type CoverageCause =
  | "ok" | "api_empty" | "not_connected" | "no_admin_scope" | "error" | "not_in_register";

export type CoverageEntry = {
  cause: CoverageCause;
  detail?: string | null;
  rows?: number;
};

export type CoverageMap = Record<string, CoverageEntry>;

const normKey = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export const CAUSE_LABEL: Record<CoverageCause, { fr: string; en: string }> = {
  ok: { fr: "données disponibles", en: "data available" },
  api_empty: { fr: "connecté, aucun dépôt renvoyé par Maestro", en: "connected, Maestro returns no deposits" },
  not_connected: { fr: "compte Maestro non connecté", en: "Maestro account not connected" },
  no_admin_scope: { fr: "non connecté · jeton firme non configuré", en: "not connected · firm token not configured" },
  error: { fr: "erreur API Maestro", en: "Maestro API error" },
  not_in_register: { fr: "absent du registre global importé", en: "not in the imported global register" },
};

export const causeLabel = (c: CoverageCause, isFr: boolean) => (isFr ? CAUSE_LABEL[c].fr : CAUSE_LABEL[c].en);

/**
 * Builds the coverage map keyed by normalized broker label.
 * `agentsWithData` are the labels that actually produced rows in the current view.
 */
export async function loadBrokerCoverage(agentsWithData: string[]): Promise<{
  map: CoverageMap;
  adminScopeConfigured: boolean;
  lastSyncAt: string | null;
  counts: Record<CoverageCause, number>;
}> {
  const withData = new Set(agentsWithData.map(normKey));

  const [{ data: diag }, { data: runs }] = await Promise.all([
    supabase.from("planipret_commission_sync_diag" as any)
      .select("broker_label,broker_email,connected,status,reason,http_status,rows_count").limit(1000),
    supabase.from("planipret_commission_sync_runs" as any)
      .select("started_at,admin_token_used").order("started_at", { ascending: false }).limit(1),
  ]);

  const run = ((runs ?? [])[0] ?? null) as any;
  const adminScopeConfigured = run?.admin_token_used === true;

  const map: CoverageMap = {};
  for (const d of (((diag ?? []) as unknown) as any[])) {
    const label = String(d.broker_label ?? d.broker_email ?? "").trim();
    if (!label) continue;
    const key = normKey(label);
    let cause: CoverageCause;
    if (withData.has(key) || (d.rows_count ?? 0) > 0) cause = "ok";
    else if (d.status === "error") cause = "error";
    else if (d.connected) cause = "api_empty";
    else cause = adminScopeConfigured ? "not_connected" : "no_admin_scope";
    map[key] = { cause, detail: d.reason ?? null, rows: d.rows_count ?? 0 };
  }

  // Brokers that have data but no diagnostics row (registry-only) are fine.
  for (const a of agentsWithData) {
    const k = normKey(a);
    if (!map[k] || map[k].cause !== "ok") map[k] = { cause: "ok", rows: map[k]?.rows ?? 0 };
  }

  const counts = { ok: 0, api_empty: 0, not_connected: 0, no_admin_scope: 0, error: 0, not_in_register: 0 } as Record<CoverageCause, number>;
  for (const v of Object.values(map)) counts[v.cause] += 1;

  return { map, adminScopeConfigured, lastSyncAt: run?.started_at ?? null, counts };
}

/** Coverage for a broker label, falling back to "not in register" when unknown. */
export function coverageFor(map: CoverageMap, label: string): CoverageEntry {
  return map[normKey(label)] ?? { cause: "not_in_register" };
}
