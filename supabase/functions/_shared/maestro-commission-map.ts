/**
 * Maestro commission field mapping.
 *
 * A commission amount displayed in the broker portal MUST be the exact raw value
 * of a Maestro field. No recalculation, no derived sum, no conversion.
 *
 * Each rule links a (record type + stage) pair coming from the Maestro record to
 * the exact Maestro field name holding the revenue for that combination.
 *
 * Until the real Maestro commissions endpoint is wired, RULES is empty:
 * the extractor then runs in "permissive" mode (legacy field probing) and every
 * line is reported as `unmapped` in the provenance payload so the discrepancy is
 * visible instead of silently guessed.
 */

export type CommissionRule = {
  /** Maestro record type / layout, lowercase compare. Use "*" for any. */
  record_type: string;
  /** Maestro stage / status, lowercase compare. Use "*" for any. */
  stage: string;
  /** Exact Maestro field name carrying the revenue for this combination. */
  revenue_field: string;
};

export const RULES: CommissionRule[] = [
  // Example (to enable once the Maestro endpoint + fields are confirmed):
  // { record_type: "mortgage", stage: "funded", revenue_field: "Case amount" },
];

export const isStrictMappingEnabled = () => RULES.length > 0;

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

const readField = (record: any, field: string): unknown => {
  if (!record || typeof record !== "object") return null;
  if (field in record) return record[field];
  // Tolerate spacing/case differences in the field name only (never the value).
  const target = field.trim().toLowerCase().replace(/[\s_-]+/g, "");
  for (const k of Object.keys(record)) {
    if (k.trim().toLowerCase().replace(/[\s_-]+/g, "") === target) return record[k];
  }
  return undefined;
};

const pickAny = (record: any, keys: string[]): { key: string; value: unknown } | null => {
  for (const k of keys) {
    const v = readField(record, k);
    if (v != null && v !== "") return { key: k, value: v };
  }
  return null;
};

export const RECORD_TYPE_KEYS = ["record_type", "layout", "type", "deal_type", "mortgage_type", "product_type", "module"];
export const STAGE_KEYS = ["stage", "status", "state", "deal_stage", "pipeline_stage"];

export type Provenance = {
  maestro_record_id: string | null;
  criteria: { record_type: string | null; stage: string | null };
  revenue_field: string | null;
  revenue_raw: unknown;
  rule_matched: boolean;
  status: "mapped" | "unmapped";
  reason: string | null;
};

/**
 * Resolve the revenue for a Maestro record using the strict mapping.
 * Returns the provenance describing exactly which field was read.
 */
export function resolveRevenue(record: any, fallbackFields: string[] = []): Provenance {
  const idHit = pickAny(record, ["id", "record_id", "deal_id", "case_id", "uuid", "number"]);
  const typeHit = pickAny(record, RECORD_TYPE_KEYS);
  const stageHit = pickAny(record, STAGE_KEYS);
  const recordType = typeHit ? String(typeHit.value) : null;
  const stage = stageHit ? String(stageHit.value) : null;

  const base = {
    maestro_record_id: idHit ? String(idHit.value) : null,
    criteria: { record_type: recordType, stage },
  };

  if (!isStrictMappingEnabled()) {
    const fb = pickAny(record, fallbackFields);
    return {
      ...base,
      revenue_field: fb?.key ?? null,
      revenue_raw: fb?.value ?? null,
      rule_matched: false,
      status: "unmapped",
      reason: "map_not_configured",
    };
  }

  const rule = RULES.find(
    (r) =>
      (r.record_type === "*" || norm(r.record_type) === norm(recordType)) &&
      (r.stage === "*" || norm(r.stage) === norm(stage)),
  );

  if (!rule) {
    return { ...base, revenue_field: null, revenue_raw: null, rule_matched: false, status: "unmapped", reason: "no_rule_for_criteria" };
  }

  const raw = readField(record, rule.revenue_field);
  if (raw === undefined) {
    return { ...base, revenue_field: rule.revenue_field, revenue_raw: null, rule_matched: false, status: "unmapped", reason: "field_missing" };
  }

  return {
    ...base,
    revenue_field: rule.revenue_field,
    revenue_raw: raw,
    rule_matched: true,
    status: "mapped",
    reason: null,
  };
}

export function auditSummary(provenances: Provenance[]) {
  const fields: Record<string, number> = {};
  const reasons: Record<string, number> = {};
  let mapped = 0;
  for (const p of provenances) {
    if (p.status === "mapped") mapped += 1;
    if (p.revenue_field) fields[p.revenue_field] = (fields[p.revenue_field] ?? 0) + 1;
    if (p.reason) reasons[p.reason] = (reasons[p.reason] ?? 0) + 1;
  }
  return {
    strict: isStrictMappingEnabled(),
    total: provenances.length,
    mapped,
    unmapped: provenances.length - mapped,
    fields_used: fields,
    unmapped_reasons: reasons,
    rules: RULES,
  };
}
