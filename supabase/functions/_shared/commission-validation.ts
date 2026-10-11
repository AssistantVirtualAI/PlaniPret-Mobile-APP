import { claudeText } from "./anthropic.ts";
import { num, type CommissionDepositRow, type CommissionSummary } from "./commission-reports.ts";

export type CommissionSource = "paid_deposits" | "pending_commissions";
export type ValidationStatus = "MATCH" | "WARNING" | "BLOCKED";

export interface CommissionValidation {
  source: CommissionSource;
  status: ValidationStatus;
  validated: boolean;
  checked_at: string;
  checks: Array<{ key: string; expected_cents: number; actual_cents: number; delta_cents: number; ok: boolean }>;
  anomalies: Array<{ type: string; severity: "info" | "warning" | "critical"; detail: string }>;
  summary: string;
  ai_status: "ok" | "warnings" | "blocked" | "unavailable";
}

const cents = (value: unknown) => Math.round(num(value) * 100);

function check(key: string, expected: unknown, actual: unknown) {
  const expected_cents = cents(expected);
  const actual_cents = cents(actual);
  const delta_cents = actual_cents - expected_cents;
  return { key, expected_cents, actual_cents, delta_cents, ok: delta_cents === 0 };
}

export interface DataQuality {
  received: number;
  counted_files: number;
  reasons: Record<string, number>;
  duplicates: number;
  conflicting_loans: number;
  unknown_types: string[];
  by_type: Record<string, number>;
  expected_rows: number | null;
  missing_rows: number;
  excluded_samples: Array<{ reason: string; contract: string; type: string; amount: number; loan: number; date: string | null }>;
}

const KNOWN_TYPES = new Set(["base", "bonus", "bonus2", "bonus 2", "perform", "performance", "override", "external", "adjustment", "ajustement"]);

/** Reads every row and classifies it: counted in files/volume, or set aside with an explicit reason. */
export function profileRows(rows: any[], ownId: string | null, expectedRows: number | null = null): DataQuality {
  const reasons: Record<string, number> = {};
  const by_type: Record<string, number> = {};
  const unknown = new Set<string>();
  const seen = new Set<string>();
  const loans = new Map<string, Set<number>>();
  const files = new Set<string>();
  const samples: DataQuality["excluded_samples"] = [];
  let duplicates = 0;
  const bump = (k: string) => { reasons[k] = (reasons[k] ?? 0) + 1; };
  for (const r of rows) {
    const type = String(r.commission_type ?? "base").trim().toLowerCase();
    by_type[type] = (by_type[type] ?? 0) + 1;
    if (!KNOWN_TYPES.has(type)) unknown.add(type);
    const contract = String(r.contract_id ?? r.number ?? "").trim();
    const rawAmt = r.commission_amount ?? r.amount;
    const amount = num(rawAmt); const loan = num(r.loan_amt ?? r.loan_amount ?? 0);
    const date = String(r.date_trans ?? "").trim();
    const key = `${r.commission_id ?? ""}|${contract}|${r.product_id ?? ""}|${type}|${amount}`;
    let reason: string | null = null;
    if (seen.has(key)) { reason = "duplicate"; duplicates++; }
    seen.add(key);
    if (!reason && rawAmt != null && rawAmt !== "" && !Number.isFinite(Number(String(rawAmt).replace(/[^0-9.-]/g, "")))) reason = "non_numeric";
    if (!reason && type !== "base") reason = "not_base";
    const pid = r.primary_broker_id != null ? String(r.primary_broker_id) : null;
    const receiver = ownId ?? (r.user_id != null ? String(r.user_id) : null);
    if (!reason && pid && receiver && pid !== receiver) reason = "team_file";
    if (!reason && (!/^\d{4}-\d{2}-\d{2}/.test(date) || date.startsWith("0000"))) reason = "undated";
    if (!reason && !contract) reason = "no_contract";
    if (!reason && loan <= 0) reason = "zero_loan";
    if (type === "base" && contract && loan > 0) {
      const set = loans.get(contract) ?? new Set<number>(); set.add(loan); loans.set(contract, set);
    }
    if (reason) {
      bump(reason);
      if (reason !== "not_base" && reason !== "team_file" && samples.length < 200) samples.push({ reason, contract, type, amount, loan, date: date || null });
    } else { bump("counted"); files.add(contract); }
  }
  return {
    received: rows.length,
    counted_files: files.size,
    reasons,
    duplicates,
    conflicting_loans: [...loans.values()].filter((v) => v.size > 1).length,
    unknown_types: [...unknown],
    by_type,
    expected_rows: expectedRows,
    missing_rows: expectedRows != null ? Math.max(0, expectedRows - rows.length) : 0,
    excluded_samples: samples,
  };
}

export function deterministicPaidChecks(rows: CommissionDepositRow[], summary: CommissionSummary) {
  const dated = rows.filter((row) => /^\d{4}-\d{2}-\d{2}/.test(String(row.date_trans ?? "").trim()));
  const amount = dated.reduce((total, row) => total + cents(row.amount), 0);
  const byDate = summary.by_date.reduce((total, row) => total + cents(row.amount), 0);
  const byInstitution = summary.top_institutions.reduce((total, row) => total + cents(row.amount), 0);
  return [
    check("paid_rows_vs_total", summary.total_commission, amount / 100),
    check("paid_dates_vs_total", summary.total_commission, byDate / 100),
    // top_institutions is intentionally capped at eight, so it cannot be an equality check.
    { ...check("paid_top_institutions_not_over_total", summary.total_commission, byInstitution / 100), ok: byInstitution <= cents(summary.total_commission) },
  ];
}

export function deterministicPendingChecks(
  rows: CommissionDepositRow[],
  official: Array<{ type: string; label: string; amount: number }> | null,
  officialTotal: number | null,
) {
  const officialSum = (official ?? []).reduce((total, item) => total + cents(item.amount), 0);
  const rowSum = rows.reduce((total, row) => total + cents(row.amount), 0);
  const baseOfficial = official?.find((item) => item.type.trim().toLowerCase() === "base")?.amount;
  const baseRows = rows
    .filter((row) => String(row.commission_type ?? "base").trim().toLowerCase() === "base")
    .reduce((total, row) => total + cents(row.amount), 0);
  const checks = [check("pending_categories_vs_official_total", officialTotal ?? 0, officialSum / 100)];
  // Les lignes ventilées peuvent omettre une partie de la base officielle : écart audité, non bloquant.
  if (baseOfficial != null) checks.push({ ...check("pending_base_rows_vs_official_base", baseOfficial, baseRows / 100), ok: true });
  // File rows can omit official override/external amounts. Record the gap for audit without treating it as corruption.
  checks.push({ ...check("pending_rows_vs_official_total", officialTotal ?? 0, rowSum / 100), ok: true });
  return checks;
}

const SYSTEM = `Tu es le dernier contrôleur d'un pipeline financier Planiprêt.
Tu reçois uniquement des agrégats déjà calculés par du code, jamais de données personnelles.
Les deux sources sont incompatibles et ne doivent jamais être mélangées:
- paid_deposits = commissions déboursées;
- pending_commissions = commissions en attente.

Le code est l'autorité arithmétique. Tu dois vérifier la cohérence du type de source, des contrôles en cents,
de la pagination et des catégories. Tu ne modifies, ne filtres, n'inventes et ne recalcules aucun montant.
Une différence entre les lignes ventilées pending et le total officiel est permise lorsqu'elle correspond aux
catégories officielles override/external; une catégorie officielle qui ne balance pas avec le total est critique.

Réponds uniquement en JSON:
{"status":"ok|warnings|blocked","summary":"...","anomalies":[{"type":"...","severity":"info|warning|critical","detail":"..."}]}
Maximum 12 anomalies. Bloque seulement une source mélangée, un résultat partiel, un contrôle obligatoire en échec,
ou une incohérence critique. N'affiche aucune donnée absente.
Analyse aussi data_quality (lignes reçues, comptées, écartées par raison, doublons, prêts contradictoires,
types inconnus, lignes manquantes selon la pagination) et compare current_headline à previous_snapshot :
signale toute variation inhabituelle (> 15 % de dossiers ou de volume) et explique en français simple
pourquoi des lignes sont écartées. Ne recalcule jamais les chiffres.
Tous les champs *_cents sont en CENTS de dollars canadiens : divise par 100 avant de citer un montant, écris « $ » (jamais €).`;

function parseAi(text: string | null) {
  if (!text) return null;
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
  }
  return null;
}

export async function validateCommissionOutput(input: {
  source: CommissionSource;
  rows: CommissionDepositRow[];
  truncated: boolean;
  summary?: CommissionSummary;
  official?: Array<{ type: string; label: string; amount: number }> | null;
  officialTotal?: number | null;
  scope: { role: string; mode: string; users_id?: string | null };
  dataQuality?: DataQuality | null;
  previous?: { total_cents: number; files: number; volume_cents: number; fetched_at: string } | null;
  current?: { files: number; volume: number; total: number } | null;
}): Promise<CommissionValidation> {
  const checks = input.source === "paid_deposits"
    ? deterministicPaidChecks(input.rows, input.summary as CommissionSummary)
    : deterministicPendingChecks(input.rows, input.official ?? null, input.officialTotal ?? null);
  const mandatory = checks.filter((item) => item.key !== "pending_rows_vs_official_total" && item.key !== "paid_top_institutions_not_over_total");
  const deterministicBlocked = input.truncated || mandatory.some((item) => !item.ok);
  const payload = {
    source: input.source,
    truncated: input.truncated,
    scope: { role: input.scope.role, mode: input.scope.mode, selected: Boolean(input.scope.users_id) },
    row_count: input.rows.length,
    checks,
    data_quality: input.dataQuality ? { ...input.dataQuality, excluded_samples: undefined } : null,
    previous_snapshot: input.previous ?? null,
    current_headline: input.current ? { files: input.current.files, volume_cents: cents(input.current.volume), total_cents: cents(input.current.total) } : null,
    totals: input.source === "paid_deposits"
      ? { commission_cents: cents(input.summary?.total_commission), volume_cents: cents(input.summary?.total_loan_volume), deals: input.summary?.deal_count ?? 0 }
      : { official_total_cents: cents(input.officialTotal), categories: (input.official ?? []).map((item) => ({ type: item.type, amount_cents: cents(item.amount) })) },
  };
  const text = await claudeText(SYSTEM, JSON.stringify(payload), {
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1000,
    temperature: 0.1,
    label: `commission-gate-${input.source}`,
  });
  const ai = parseAi(text);
  const aiStatus = ai && ["ok", "warnings", "blocked"].includes(String(ai.status)) ? String(ai.status) as "ok" | "warnings" | "blocked" : "unavailable";
  const anomalies = Array.isArray(ai?.anomalies) ? ai.anomalies.slice(0, 12).map((item: any) => ({
    type: String(item?.type ?? "inconsistent").slice(0, 80),
    severity: (["info", "warning", "critical"].includes(String(item?.severity)) ? String(item.severity) : "warning") as "info" | "warning" | "critical",
    detail: String(item?.detail ?? "").slice(0, 300),
  })) : [];
  // Claude est consultatif : seul le rapprochement arithmétique déterministe bloque.
  const blocked = deterministicBlocked;
  const warning = !blocked && (aiStatus !== "ok" || checks.some((item) => !item.ok) || anomalies.length > 0);
  return {
    source: input.source,
    status: blocked ? "BLOCKED" : warning ? "WARNING" : "MATCH",
    validated: !blocked,
    checked_at: new Date().toISOString(),
    checks,
    anomalies,
    summary: String(ai?.summary ?? (blocked ? "Validation des commissions indisponible ou bloquée." : "Contrôles de commissions réussis.")).slice(0, 600),
    ai_status: aiStatus,
  };
}