import { supabase } from "@/integrations/supabase/client";

export type CommissionSection =
  | "kpi" | "lender" | "quarter" | "commission_type"
  | "product_mix" | "term_mix" | "matrix" | "club" | "team";

export type CommissionRow = {
  id: string;
  broker_name: string;
  broker_user_id: string | null;
  fiscal_year: number;
  section: CommissionSection | string;
  dimension: string | null;
  sub_dimension: string | null;
  rank: number | null;
  cy_volume: number;
  py_volume: number;
  cy_deals: number;
  py_deals: number;
  cy_commission: number;
  py_commission: number;
  extra: Record<string, any>;
  source_file: string | null;
  entry_source?: string | null;
  updated_by?: string | null;
  updated_at?: string | null;
};


export type CommissionFilters = {
  broker: string;      // "all" or broker_name
  lender: string;      // "all" or lender name
  quarter: string;     // "all" | Q1..Q4
  productType: string; // "all" | Taux Fixe...
  term: string;        // "all" | 0..5
  commissionType: string; // "all" | base | bonus...
  search: string;
  fiscalYear: number | "all";
};

export const emptyFilters: CommissionFilters = {
  broker: "all", lender: "all", quarter: "all", productType: "all",
  term: "all", commissionType: "all", search: "", fiscalYear: "all",
};

export async function fetchCommissionRows(scope?: { brokerUserId?: string | null; brokerName?: string | null }): Promise<CommissionRow[]> {
  let q = (supabase.from("planipret_commission_stats" as any) as any)
    .select("*")
    .order("section", { ascending: true })
    .order("rank", { ascending: true, nullsFirst: false });
  if (scope?.brokerUserId) q = q.eq("broker_user_id", scope.brokerUserId);
  else if (scope?.brokerName) q = q.eq("broker_name", scope.brokerName);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const section = String(row.section ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    const isTerm = section === "term_mix";
    const isMatrix = section === "matrix";
    return {
      ...row,
      section,
      dimension: isTerm ? normalizeTerm(row.dimension) : String(row.dimension ?? "").trim() || null,
      sub_dimension: isMatrix ? normalizeTerm(row.sub_dimension) : String(row.sub_dimension ?? "").trim() || null,
      fiscal_year: Number(row.fiscal_year ?? 0),
      rank: row.rank == null ? null : Number(row.rank),
      cy_volume: Number(row.cy_volume ?? 0),
      py_volume: Number(row.py_volume ?? 0),
      cy_deals: Number(row.cy_deals ?? 0),
      py_deals: Number(row.py_deals ?? 0),
      cy_commission: Number(row.cy_commission ?? 0),
      py_commission: Number(row.py_commission ?? 0),
      extra: row.extra && typeof row.extra === "object" ? row.extra : {},
    };
  }) as CommissionRow[];
}

/* ---------- formatting ---------- */
const nfMoney = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const nfNum = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 });

export const fmtMoney = (n?: number | null) => nfMoney.format(Number(n ?? 0));
export const fmtNum = (n?: number | null) => nfNum.format(Number(n ?? 0));
export const fmtPct = (n?: number | null) => (n == null || Number.isNaN(n) ? "—" : `${Number(n).toFixed(1)}%`);
export const fmtBps = (n?: number | null) => (n == null ? "—" : `${Number(n).toFixed(1)} BPS`);
export const fmtCompact = (n: number) =>
  Math.abs(n) >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n);

/* ---------- derivations ---------- */
export function brokerNames(rows: CommissionRow[]) {
  return Array.from(new Set(rows.map((r) => r.broker_name))).sort();
}

export function lenderNames(rows: CommissionRow[]) {
  return Array.from(new Set(rows.filter((r) => r.section === "lender").map((r) => r.dimension || ""))).filter(Boolean).sort();
}

export function kpiOf(rows: CommissionRow[], key: string) {
  const r = rows.find((x) => x.section === "kpi" && x.dimension === key);
  return r ? {
    label: r.extra?.label ?? key,
    cy: r.extra?.cy == null ? null : Number(r.extra.cy),
    py: r.extra?.py == null ? null : Number(r.extra.py),
    yoy: r.extra?.yoy == null ? null : Number(r.extra.yoy),
  } : null;
}

/** Global KPI totals across the selected scope (sums lender + quarter based facts). */
export function globalTotals(rows: CommissionRow[]) {
  const brokers = brokerNames(rows);
  let volume = 0, py_volume = 0, deals = 0, py_deals = 0, commission = 0, py_commission = 0;
  for (const b of brokers) {
    const br = rows.filter((r) => r.broker_name === b);
    volume += Number(kpiOf(br, "volume")?.cy ?? 0);
    py_volume += Number(kpiOf(br, "volume")?.py ?? 0);
    deals += Number(kpiOf(br, "deals")?.cy ?? 0);
    py_deals += Number(kpiOf(br, "deals")?.py ?? 0);
    commission += Number(kpiOf(br, "commission")?.cy ?? 0);
    py_commission += Number(kpiOf(br, "commission")?.py ?? 0);
  }
  const bps = volume ? (commission / volume) * 10000 : 0;
  const pyBps = py_volume ? (py_commission / py_volume) * 10000 : 0;
  return {
    brokers: brokers.length,
    volume, py_volume, deals, py_deals, commission, py_commission,
    avgDeal: deals ? volume / deals : 0,
    avgCommission: deals ? commission / deals : 0,
    bps, pyBps,
    volumeYoy: py_volume ? ((volume - py_volume) / py_volume) * 100 : null,
    dealsYoy: py_deals ? ((deals - py_deals) / py_deals) * 100 : null,
    commissionYoy: py_commission ? ((commission - py_commission) / py_commission) * 100 : null,
  };
}

/** Aggregate a section across brokers, merged by dimension (+ sub-dimension). */
export function aggregate(rows: CommissionRow[], section: string, withSub = false) {
  const map = new Map<string, CommissionRow & { key: string }>();
  for (const r of rows) {
    if (r.section !== section) continue;
    const key = withSub ? `${r.dimension}||${r.sub_dimension}` : String(r.dimension);
    const cur = map.get(key);
    if (!cur) {
      map.set(key, {
        ...r,
        key,
        cy_volume: Number(r.cy_volume || 0),
        py_volume: Number(r.py_volume || 0),
        cy_deals: Number(r.cy_deals || 0),
        py_deals: Number(r.py_deals || 0),
        cy_commission: Number(r.cy_commission || 0),
        py_commission: Number(r.py_commission || 0),
      });
    } else {
      cur.cy_volume += Number(r.cy_volume || 0);
      cur.py_volume += Number(r.py_volume || 0);
      cur.cy_deals += Number(r.cy_deals || 0);
      cur.py_deals += Number(r.py_deals || 0);
      cur.cy_commission += Number(r.cy_commission || 0);
      cur.py_commission += Number(r.py_commission || 0);
    }
  }
  return Array.from(map.values());
}

export function applyFilters(rows: CommissionRow[], f: CommissionFilters): CommissionRow[] {
  const s = f.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.broker !== "all" && r.broker_name !== f.broker) return false;
    if (f.fiscalYear !== "all" && r.fiscal_year !== f.fiscalYear) return false;
    if (f.lender !== "all" && r.section === "lender" && r.dimension !== f.lender) return false;
    if (f.quarter !== "all" && r.section === "quarter" && r.dimension !== f.quarter) return false;
    if (f.productType !== "all" && (r.section === "product_mix" || r.section === "matrix") && r.dimension !== f.productType) return false;
    if (f.term !== "all" && r.section === "matrix" && normalizeTerm(r.sub_dimension) !== f.term) return false;
    if (f.term !== "all" && r.section === "term_mix" && normalizeTerm(r.dimension) !== f.term) return false;
    if (f.commissionType !== "all" && r.section === "commission_type" && r.dimension !== f.commissionType) return false;
    if (s) {
      const hay = `${r.broker_name} ${r.section} ${r.dimension ?? ""} ${r.sub_dimension ?? ""}`.toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  });
}

export function toCsv(rows: CommissionRow[]) {
  const head = ["Courtier", "Section", "Dimension", "Sous-dimension", "Volume CY", "Volume PY", "Deals CY", "Deals PY", "Commission CY", "Commission PY"];
  const lines = rows.map((r) => [
    r.broker_name, r.section, r.dimension ?? "", r.sub_dimension ?? "",
    r.cy_volume, r.py_volume, r.cy_deals, r.py_deals, r.cy_commission, r.py_commission,
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  return [head.join(","), ...lines].join("\n");
}

export const SECTION_LABELS: Record<string, { fr: string; en: string }> = {
  kpi: { fr: "Indicateurs clés", en: "Key indicators" },
  lender: { fr: "Prêteurs / Banques", en: "Lenders / Banks" },
  quarter: { fr: "Trimestres", en: "Quarters" },
  commission_type: { fr: "Types de commission", en: "Commission types" },
  product_mix: { fr: "Mix produit", en: "Product mix" },
  term_mix: { fr: "Mix terme", en: "Term mix" },
  matrix: { fr: "Matrice type × terme", en: "Type × term matrix" },
  club: { fr: "Club Excellence", en: "Club Excellence" },
  team: { fr: "Comparaison équipe", en: "Team comparison" },
  productivity: { fr: "Productivité du courtier", en: "Broker productivity" },
};

export const CHART_COLORS = ["#2E9BDC", "#00D4AA", "#9B7FE8", "#E8A33C", "#E84C4C", "#4AC9E3", "#7FD46B", "#E86CB0"];

/* ---------- term normalization / display ---------- */
export const TERM_VALUES = ["0", "1", "2", "3", "4", "5", "Other"];

export function normalizeTerm(v?: string | null): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (/open|var/i.test(s) && /0/.test(s)) return "0";
  const m = s.match(/^(\d+)\s*(yr|an|ans|year|years)?$/i);
  if (m) return m[1];
  if (/other/i.test(s)) return "Other";
  return s;
}

export function termLabel(v: string, lang: "fr" | "en") {
  const t = normalizeTerm(v);
  if (t === "0") return lang === "en" ? "0 (open/variable)" : "0 an (ouvert/variable)";
  if (t === "Other") return lang === "en" ? "Other" : "Autres";
  if (/^\d+$/.test(t)) return lang === "en" ? `${t} yr` : `${t} an${Number(t) > 1 ? "s" : ""}`;
  return v;
}

/* ---------- manual entry (admins only, enforced by RLS) ---------- */
export type CommissionInput = {
  id?: string;
  broker_name: string;
  broker_user_id?: string | null;
  fiscal_year: number;
  section: string;
  dimension: string | null;
  sub_dimension?: string | null;
  rank?: number | null;
  cy_volume?: number;
  py_volume?: number;
  cy_deals?: number;
  py_deals?: number;
  cy_commission?: number;
  py_commission?: number;
  extra?: Record<string, any>;
};

export async function saveCommissionRow(input: CommissionInput): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const payload: Record<string, any> = {
    broker_name: input.broker_name.trim(),
    broker_user_id: input.broker_user_id ?? null,
    fiscal_year: input.fiscal_year,
    section: input.section,
    dimension: input.dimension?.trim() || null,
    sub_dimension: input.sub_dimension?.trim() || null,
    rank: input.rank ?? null,
    cy_volume: Number(input.cy_volume || 0),
    py_volume: Number(input.py_volume || 0),
    cy_deals: Number(input.cy_deals || 0),
    py_deals: Number(input.py_deals || 0),
    cy_commission: Number(input.cy_commission || 0),
    py_commission: Number(input.py_commission || 0),
    extra: input.extra ?? {},
    entry_source: "manual",
    updated_by: user?.id ?? null,
  };
  const table = supabase.from("planipret_commission_stats" as any) as any;
  const { error } = input.id
    ? await table.update(payload).eq("id", input.id)
    : await table.insert(payload);
  if (error) throw error;
}

export async function deleteCommissionRow(id: string): Promise<void> {
  const { error } = await (supabase.from("planipret_commission_stats" as any) as any).delete().eq("id", id);
  if (error) throw error;
}

export async function isCommissionEditor(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const [{ data: admin }, { data: sa }] = await Promise.all([
    supabase.rpc("is_planipret_admin", { _user_id: user.id }),
    supabase.rpc("is_super_admin", { _user_id: user.id }),
  ]);
  return Boolean(admin || sa);
}

