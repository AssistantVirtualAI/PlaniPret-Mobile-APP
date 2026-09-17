// Resolution of a Maestro client's mortgage files ("dossiers" / deals).
//
// Maestro does not publish a single documented "deals by client" route, so we
// probe the known candidates in order and also mine the client profile payload
// itself (some deployments embed the files inline). Everything degrades
// gracefully: when no dossier can be resolved the caller falls back to opening
// the contact record instead of showing an empty screen or an error.

import { maestroFetch, type MaestroConfig } from "./maestro.ts";

const WEB_BASE = (Deno.env.get("PLANIPRET_WEB_BASE_URL") ?? "https://client.planipret.com").replace(/\/$/, "");

export interface MaestroDeal {
  id: string;
  label: string | null;
  stage: string | null;
  lender: string | null;
  amount: number | null;
  updated_at: string | null;
  url: string;
}

/** Deep-link to a dossier in the Maestro web app. */
export const dealUrl = (dealId: string) =>
  `${WEB_BASE}/main/deals?deal_id=${encodeURIComponent(dealId)}`;

/** Deep-link to a client record in the Maestro web app. */
export const clientUrl = (clientId: string) =>
  `${WEB_BASE}/main/clients?client_id=${encodeURIComponent(clientId)}`;

const toNum = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const toIso = (v: unknown): string | null => {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** Normalizes whatever shape Maestro returns into a stable deal object. */
export function normalizeDeal(raw: any): MaestroDeal | null {
  if (!raw || typeof raw !== "object") return null;
  const id = raw.id ?? raw.deal_id ?? raw.number ?? raw.file_number ?? raw.mortgage_id;
  if (id == null || String(id).trim() === "") return null;
  return {
    id: String(id),
    label: String(
      raw.name ?? raw.title ?? raw.property_address ?? raw.address ?? raw.number ?? "",
    ).trim() || null,
    stage: String(raw.stage ?? raw.mortgage_stage ?? raw.status ?? "").trim() || null,
    lender: String(raw.institution ?? raw.lender ?? raw.financial_institution ?? "").trim() || null,
    amount: toNum(raw.loan_amt ?? raw.loan_amount ?? raw.amount),
    updated_at: toIso(
      raw.updated_at ?? raw.modified_at ?? raw.date_modified ?? raw.created_at ?? raw.date_trans,
    ),
    url: dealUrl(String(id)),
  };
}

const pickArray = (data: any): any[] => {
  if (Array.isArray(data)) return data;
  for (const key of ["data", "deals", "mortgages", "files", "items", "results"]) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  return [];
};

/** Deals embedded directly in the client profile payload, when present. */
export function dealsFromClientPayload(client: any): MaestroDeal[] {
  const inline = [
    ...pickArray(client?.deals),
    ...pickArray(client?.mortgages),
    ...pickArray(client?.files),
    ...pickArray(client?.applications),
  ];
  return inline.map(normalizeDeal).filter((d): d is MaestroDeal => !!d);
}

/** Most recently updated dossier first; undated entries sort last. */
export function sortDeals(deals: MaestroDeal[]): MaestroDeal[] {
  return [...deals].sort((a, b) => {
    const ta = a.updated_at ? Date.parse(a.updated_at) : 0;
    const tb = b.updated_at ? Date.parse(b.updated_at) : 0;
    return tb - ta;
  });
}

/**
 * Best-effort fetch of a client's dossiers. Never throws: an empty array means
 * "no dossier resolved", which the UI turns into an "Ouvrir la fiche contact"
 * fallback action.
 */
export async function fetchClientDeals(
  cfg: MaestroConfig,
  opts: { token: string; brokerId?: string | null; clientId: string; inline?: any },
): Promise<{ deals: MaestroDeal[]; source: string }> {
  const inline = sortDeals(dealsFromClientPayload(opts.inline));
  if (inline.length) return { deals: inline, source: "client_payload" };

  const cid = encodeURIComponent(String(opts.clientId));
  // The official API exposes a client filter on GET /api/main/contracts. Do not
  // probe unpublished `deals` or `mortgages` endpoints as a fallback.
  const path = `/api/main/contracts?client_id=${cid}&page=1&per_page=50`;
  try {
    const res = await maestroFetch(cfg, { method: "GET", path, token: opts.token });
    if (!res.ok || (res.data && typeof res.data === "object" && (res.data as any).success === false)) {
      return { deals: [], source: "unavailable" };
    }
    const deals = sortDeals(
      pickArray(res.data).map(normalizeDeal).filter((d): d is MaestroDeal => !!d),
    );
    return { deals, source: "contracts" };
  } catch (_e) {
    return { deals: [], source: "unavailable" };
  }
}
