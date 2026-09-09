// Maestro teams — Maestro exposes no `/teams` endpoint (probed: 404 on
// `/api/main/teams`, `/telecom/api/v1/teams`, `/users/{id}/teams`). The real
// team attached to a broker is carried by the Client List API:
//
//   GET /telecom/api/v1/users/{telecomId}/clients
//     → [{ id, ..., task_targets: { user: { id, eligible_broker_ids: [...] } } }]
//
// `eligible_broker_ids` is exactly the set of brokers Maestro accepts as task
// assignees for that client. The union over the broker's own client list is
// therefore "the teams this broker belongs to", straight from Maestro.

export interface MaestroTeam {
  /** All broker ids Maestro allows this broker to assign to. */
  ids: string[];
  /** Per-client eligible broker ids (client id → broker ids). */
  byClient: Record<string, string[]>;
}

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; value: MaestroTeam }>();

function extractRows(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const keys = ["clients", "data", "items", "results", "response", "payload"];
  const seen = new Set<any>();
  const walk = (value: any, depth: number): any[] => {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== "object" || depth > 5 || seen.has(value)) return [];
    seen.add(value);
    for (const key of keys) {
      const rows = walk(value[key], depth + 1);
      if (rows.length) return rows;
    }
    return [];
  };
  return walk(payload, 0);
}

export async function fetchMaestroTeam(opts: {
  token: string | null;
  telecomBase: string;
  apiBase: string;
  telecomId: string | null;
  timeoutMs?: number;
  force?: boolean;
}): Promise<MaestroTeam> {
  const empty: MaestroTeam = { ids: [], byClient: {} };
  const { token, telecomId } = opts;
  if (!token || !telecomId) return empty;

  const key = String(telecomId);
  const hit = cache.get(key);
  if (!opts.force && hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const urls = [
    `${opts.telecomBase}/users/${encodeURIComponent(key)}/clients?limit=500`,
    `${opts.apiBase}/telecom/api/v1/users/${encodeURIComponent(key)}/clients?limit=500`,
  ];

  for (const url of urls) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15_000);
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: ctrl.signal,
      });
      if (!res.ok) continue;
      const j: any = await res.json().catch(() => null);
      const rows = extractRows(j);
      if (!Array.isArray(rows) || rows.length === 0) continue;

      const ids = new Set<string>();
      const byClient: Record<string, string[]> = {};
      for (const r of rows) {
        const tt = (r && typeof r === "object" ? r.task_targets : null) as any;
        const list: any[] = tt?.user?.eligible_broker_ids ?? [];
        const clean = list
          .map((v) => String(v ?? "").trim())
          .filter((v) => /^\d+$/.test(v));
        if (!clean.length) continue;
        for (const v of clean) ids.add(v);
        const cid = String(r?.id ?? tt?.user?.id ?? "").trim();
        if (cid) byClient[cid] = [...new Set([...(byClient[cid] ?? []), ...clean])];
      }
      const value: MaestroTeam = { ids: [...ids], byClient };
      cache.set(key, { at: Date.now(), value });
      return value;
    } catch (_) {
      /* try next base */
    } finally {
      clearTimeout(timer);
    }
  }
  return empty;
}
