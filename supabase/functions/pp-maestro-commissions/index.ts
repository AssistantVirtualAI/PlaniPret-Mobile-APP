import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getMaestroOAuthEnv, getUserMaestroAccessToken, fetchMaestroUserProfile } from "../_shared/maestro-oauth.ts";
import { fetchCommissionDeposits, type CommissionDeposit } from "../_shared/maestro-commissions-api.ts";

/**
 * Broker commissions sourced from Maestro's OFFICIAL Commission Reports API
 * (GET /api/main/commissions/reports/deposits).
 *
 * Fetches the caller's commission deposit rows and aggregates them into the
 * same `CommissionRow` shape the commission dashboard already renders
 * (sections: kpi, lender, quarter, product_mix, term_mix, matrix).
 */

type Row = {
  id: string;
  broker_name: string;
  broker_user_id: string | null;
  fiscal_year: number;
  section: string;
  dimension: string | null;
  sub_dimension: string | null;
  rank: number | null;
  cy_volume: number;
  py_volume: number;
  cy_deals: number;
  py_deals: number;
  cy_commission: number;
  py_commission: number;
  extra: Record<string, unknown>;
  source_file: string | null;
  entry_source: string;
};

const num = (v: unknown): number => {
  if (v == null) return 0;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

interface NormalizedDeal {
  date: Date | null;
  amount: number;       // loan_amt (volume)
  commission: number;   // amount (commission)
  lender: string;
  product: string;
  term: string;
  status: string;
  provenance: { rule_matched: boolean; revenue_raw: number; field: string };
  raw: CommissionDeposit;
}

/** Official endpoint already exposes clean field names — no guessing. */
function normalizeDeal(d: CommissionDeposit): NormalizedDeal {
  const dateRaw = d.date_trans ? String(d.date_trans).slice(0, 10) : null;
  const date = dateRaw ? new Date(`${dateRaw}T00:00:00Z`) : null;
  const amount = num(d.loan_amt);
  const commission = num(d.amount);
  const lender = String(d.institution ?? "—").trim() || "—";
  const product = String(d.mortgage_type ?? "—").trim() || "—";
  const term = d.term == null ? "" : String(d.term).trim();
  return {
    date,
    amount,
    commission,
    lender,
    product,
    term,
    status: "",
    provenance: { rule_matched: true, revenue_raw: commission, field: "amount" },
    raw: d,
  };
}

function fiscalYearOf(d: Date) { return d.getUTCFullYear(); }
function quarterOf(d: Date) { return `Q${Math.floor(d.getUTCMonth() / 3) + 1}`; }

function aggregate(deals: NormalizedDeal[], brokerName: string, brokerUserId: string | null, cy: number) {
  const py = cy - 1;
  const rows: Row[] = [];
  let seq = 0;
  const mk = (section: string, dimension: string | null, sub: string | null, extra: Record<string, unknown> = {}): Row => ({
    id: `maestro-${section}-${dimension ?? ""}-${sub ?? ""}-${seq++}`,
    broker_name: brokerName,
    broker_user_id: brokerUserId,
    fiscal_year: cy,
    section,
    dimension,
    sub_dimension: sub,
    rank: null,
    cy_volume: 0, py_volume: 0, cy_deals: 0, py_deals: 0, cy_commission: 0, py_commission: 0,
    extra,
    source_file: "maestro",
    entry_source: "maestro",
  });

  const bucket = new Map<string, Row>();
  const add = (section: string, dimension: string | null, sub: string | null, d: NormalizedDeal, year: number) => {
    const key = `${section}|${dimension}|${sub}`;
    let r = bucket.get(key);
    if (!r) { r = mk(section, dimension, sub); bucket.set(key, r); rows.push(r); }
    if (year === cy) { r.cy_volume += d.amount; r.cy_deals += 1; r.cy_commission += d.commission; }
    else if (year === py) { r.py_volume += d.amount; r.py_deals += 1; r.py_commission += d.commission; }
  };

  let cyVol = 0, pyVol = 0, cyCnt = 0, pyCnt = 0, cyCom = 0, pyCom = 0;
  for (const d of deals) {
    if (!d.date || Number.isNaN(d.date.getTime())) continue;
    const y = fiscalYearOf(d.date);
    if (y !== cy && y !== py) continue;
    if (y === cy) { cyVol += d.amount; cyCnt += 1; cyCom += d.commission; }
    else { pyVol += d.amount; pyCnt += 1; pyCom += d.commission; }
    add("lender", d.lender, null, d, y);
    add("quarter", quarterOf(d.date), null, d, y);
    add("month", String(d.date.getUTCMonth() + 1).padStart(2, "0"), null, d, y);
    add("product_mix", d.product, null, d, y);
    add("term_mix", d.term || "Other", null, d, y);
    add("matrix", d.product, d.term || "Other", d, y);
  }

  const yoy = (c: number, p: number) => (p ? ((c - p) / p) * 100 : null);
  const kpi = (dim: string, label: string, c: number, p: number) => {
    const r = mk("kpi", dim, null, { label, cy: c, py: p, yoy: yoy(c, p) });
    rows.push(r);
  };
  kpi("volume", "Volume", cyVol, pyVol);
  kpi("deals", "Dossiers", cyCnt, pyCnt);
  kpi("commission", "Commissions", cyCom, pyCom);
  kpi("avg_deal", "Prêt moyen", cyCnt ? cyVol / cyCnt : 0, pyCnt ? pyVol / pyCnt : 0);
  kpi("bps", "BPS", cyVol ? (cyCom / cyVol) * 10000 : 0, pyVol ? (pyCom / pyVol) * 10000 : 0);

  // Rank lenders by current-year volume for a stable display order.
  rows.filter((r) => r.section === "lender")
    .sort((a, b) => b.cy_volume - a.cy_volume)
    .forEach((r, i) => { r.rank = i + 1; });

  return rows;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const j = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const fiscalYear = Number(body?.fiscal_year) || new Date().getUTCFullYear();
    const py = fiscalYear - 1;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return j({ success: false, rows: [], error: "unauthorized", code: "unauthorized" }, 401);
    const { data: u } = await admin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    const callerId = u?.user?.id ?? null;
    if (!callerId) return j({ success: false, rows: [], error: "unauthorized", code: "unauthorized" }, 401);

    const { data: prof } = await admin
      .from("planipret_profiles")
      .select("id, user_id, full_name, email, maestro_broker_id, maestro_connected")
      .or(`user_id.eq.${callerId},id.eq.${callerId}`)
      .limit(1)
      .maybeSingle();
    if (!prof) return j({ success: false, rows: [], error: "profil introuvable", code: "no_profile" });

    // Broker must have a live Maestro OAuth token.
    const oauthToken = await getUserMaestroAccessToken(admin, callerId).catch(() => null);
    if (!oauthToken) {
      return j({
        success: false, rows: [],
        code: "maestro_not_connected",
        error: "Connectez votre compte Maestro dans Réglages → Maestro pour voir vos commissions.",
      });
    }

    // Always re-resolve the Maestro users_id from /user (the official Commission
    // API's users_id is the telecom/internal id, e.g. 93135 — NOT the CRM id that
    // may be cached on the profile). Trusting the stored value returned 0 rows.
    let maestroId: string | null = null;
    try {
      const me = await fetchMaestroUserProfile(getMaestroOAuthEnv(), oauthToken);
      const mid = (me as any)?.id ?? (me as any)?.user?.id ?? (me as any)?.user_id ?? null;
      if (mid && /^\d+$/.test(String(mid))) {
        maestroId = String(mid);
        await admin.from("planipret_profiles")
          .update({ maestro_broker_id: maestroId, maestro_connected: true })
          .eq("id", prof.id);
      }
    } catch { /* not connected */ }
    if (!maestroId || !/^\d+$/.test(maestroId)) {
      return j({
        success: false, rows: [],
        code: "maestro_not_connected",
        error: "Impossible de résoudre votre identifiant Maestro. Reconnectez votre compte.",
      });
    }

    // Fetch deposit rows spanning current + previous fiscal year.
    const r = await fetchCommissionDeposits({
      token: oauthToken,
      usersId: maestroId,
      dateFrom: `${py}-01-01 00:00:00`,
      dateTo: `${fiscalYear}-12-31 23:59:59`,
      perPage: 100,
      maxPages: 80,
    });
    if (body?.debug_raw) {
      return j({
        debug: true, ok: r.ok, status: r.status, error: r.error,
        users_id: probeId, resolved_id: maestroId,
        rows_returned: r.rows.length, pages: r.pages,
        meta: r.meta,
        sample: r.rows.slice(0, 2),
      });
    }

    if (!r.ok) {
      return j({
        success: false, rows: [],
        code: "api_error",
        status: r.status,
        error: r.error ?? `HTTP ${r.status}`,
        maestro_user_id: maestroId,
      });
    }


    const deals = r.rows.map(normalizeDeal);
    // Official data is already clean — every row counts.
    const counted = deals;
    const brokerName = String(prof.full_name ?? prof.email ?? "Courtier");
    const rows = aggregate(counted, brokerName, prof.user_id ?? prof.id ?? null, fiscalYear);

    const provenance = deals.map((d) => ({
      ...d.provenance,
      date: d.date && !Number.isNaN(d.date.getTime()) ? d.date.toISOString() : null,
      lender: d.lender,
      product: d.product,
      amount: d.amount,
      commission: d.commission,
      counted: true,
    }));

    const audit = {
      total: deals.length,
      matched: deals.length,
      unmatched: 0,
      matched_pct: deals.length ? 100 : 0,
    };

    return j({
      success: true,
      rows,
      source: "maestro",
      maestro_user_id: maestroId,
      deal_count: deals.length,
      counted_count: counted.length,
      fiscal_year: fiscalYear,
      provenance,
      audit,
    });

  } catch (e: any) {
    console.error("pp-maestro-commissions error", e);
    return j({ success: false, rows: [], error: e?.message ?? "server_error" }, 500);
  }
});
