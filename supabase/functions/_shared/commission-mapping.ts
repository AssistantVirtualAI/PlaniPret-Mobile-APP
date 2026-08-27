// Shared mapping helpers for the Planiprêt commission register import.
// Handles: canonical field list, header -> field guessing, commission type
// normalisation and the stable row key used for incremental re-imports.

export const CANONICAL_FIELDS = [
  "number",
  "loan_amt",
  "primary_client_name",
  "secondary_client_name",
  "institution",
  "financial_inst_id",
  "is_adjustment",
  "points",
  "buy_down",
  "amount",
  "mortgage_type",
  "term",
  "agent_name",
  "target_name",
  "date_trans",
  "commission_type",
  "split_type",
  "agent_company",
  "cabinet",
  "maestro_broker_id",
] as const;

export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

export const FIELD_LABELS: Record<string, string> = {
  number: "Numéro de dossier",
  loan_amt: "Montant du prêt",
  primary_client_name: "Client principal",
  secondary_client_name: "Client secondaire",
  institution: "Institution",
  financial_inst_id: "ID institution",
  is_adjustment: "Ajustement",
  points: "Points",
  buy_down: "Buy down",
  amount: "Montant de commission",
  mortgage_type: "Type de prêt",
  term: "Terme",
  agent_name: "Courtier",
  target_name: "Cible",
  date_trans: "Date de transaction",
  commission_type: "Type de commission",
  split_type: "Type de partage",
  agent_company: "Compagnie du courtier",
  cabinet: "Cabinet",
  maestro_broker_id: "Maestro broker ID",
};

export const norm = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Excel column letter for a 0-based index (0 -> A, 18 -> S). */
export const colLetter = (i: number) => {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

const HEADER_HINTS: Record<CanonicalField, string[]> = {
  number: ["number", "no", "num", "numero", "dossier", "contrat", "deal", "file", "reference"],
  loan_amt: ["loan amt", "loan amount", "montant pret", "montant du pret", "mortgage amount", "volume"],
  primary_client_name: ["primary client name", "client", "client principal", "borrower", "emprunteur"],
  secondary_client_name: ["secondary client name", "co client", "coemprunteur", "client secondaire"],
  institution: ["institution", "lender", "preteur", "banque", "financial institution"],
  financial_inst_id: ["financial inst id", "institution id", "lender id", "id institution"],
  is_adjustment: ["is adjustment", "adjustment", "ajustement"],
  points: ["points", "point", "pts"],
  buy_down: ["buy down", "buydown", "rachat"],
  amount: ["amount", "montant", "commission", "commission amount", "montant commission"],
  mortgage_type: ["mortgage type", "type de pret", "type pret", "produit", "product"],
  term: ["term", "terme", "duree"],
  agent_name: ["agent name", "agent", "courtier", "broker", "conseiller"],
  target_name: ["target name", "target", "cible"],
  date_trans: ["date trans", "date", "transaction date", "date transaction", "date de transaction", "closing"],
  commission_type: ["commission type", "type de commission", "type commission", "comm type"],
  split_type: ["split type", "split", "partage"],
  agent_company: ["agent company", "compagnie", "company", "societe"],
  cabinet: ["cabinet", "office", "bureau", "agence"],
  maestro_broker_id: ["maestro", "maestro id", "maestro broker id", "broker id", "id courtier"],
};

/** Guess the canonical field for a raw header label. Returns null when unsure. */
export function guessField(header: string): CanonicalField | null {
  const h = norm(header);
  if (!h) return null;
  for (const f of CANONICAL_FIELDS) {
    if (HEADER_HINTS[f].some((hint) => h === hint)) return f;
  }
  for (const f of CANONICAL_FIELDS) {
    if (HEADER_HINTS[f].some((hint) => h.includes(hint) || hint.includes(h))) return f;
  }
  return null;
}

/** Build header -> canonical field map, applying saved overrides first. */
export function buildColumnMap(
  headers: string[],
  overrides: Record<string, string> = {},
): { map: Record<string, CanonicalField | null>; unknown: string[] } {
  const map: Record<string, CanonicalField | null> = {};
  const unknown: string[] = [];
  headers.forEach((h, i) => {
    const key = norm(h) || `col_${colLetter(i)}`;
    const ov = overrides[key] ?? overrides[String(h ?? "").trim()] ?? overrides[colLetter(i)];
    if (ov === "__ignore__") { map[String(h ?? "")] = null; return; }
    const guessed = (ov as CanonicalField) || guessField(String(h ?? ""));
    map[String(h ?? "")] = guessed ?? null;
    if (!guessed) unknown.push(String(h ?? "").trim() || colLetter(i));
  });
  return { map, unknown };
}

export const KNOWN_COMMISSION_TYPES = ["base", "bonus", "bonus2", "perform", "adjustment"] as const;
export type CommissionType = (typeof KNOWN_COMMISSION_TYPES)[number] | "other";

const TYPE_HINTS: Record<string, CommissionType> = {
  "base": "base",
  "basic": "base",
  "standard": "base",
  "principale": "base",
  "commission de base": "base",
  "bonus": "bonus",
  "boni": "bonus",
  "bonus 1": "bonus",
  "bonus1": "bonus",
  "bonus 2": "bonus2",
  "bonus2": "bonus2",
  "boni 2": "bonus2",
  "volume bonus": "bonus2",
  "perform": "perform",
  "performance": "perform",
  "prime performance": "perform",
  "adjustment": "adjustment",
  "ajustement": "adjustment",
  "correction": "adjustment",
  "renouvellement": "other",
  "renewal": "other",
  "referral": "other",
  "referencement": "other",
};

/** Normalise a raw commission type label. Saved overrides win over hints. */
export function normaliseCommissionType(
  raw: unknown,
  overrides: Record<string, string> = {},
): { value: string | null; known: boolean } {
  const key = norm(raw);
  if (!key) return { value: null, known: false };
  const ov = overrides[key];
  if (ov) return { value: ov, known: ov !== "other" };
  const hit = TYPE_HINTS[key];
  if (hit) return { value: hit, known: hit !== "other" };
  for (const [k, v] of Object.entries(TYPE_HINTS)) {
    if (key.includes(k)) return { value: v, known: v !== "other" };
  }
  return { value: key, known: false };
}

/** Stable key used to replace a corrected line without re-importing everything. */
export function rowKey(input: {
  sheet?: string | null;
  sourceRow?: number | null;
  number?: string | null;
  date?: string | null;
  commissionType?: string | null;
  amount?: number | null;
}): string {
  const sheet = norm(input.sheet) || "sheet";
  if (input.sourceRow && Number.isFinite(input.sourceRow)) return `${sheet}#${input.sourceRow}`;
  return [
    sheet,
    norm(input.number) || "no-number",
    input.date ?? "no-date",
    norm(input.commissionType) || "no-type",
    Number(input.amount ?? 0).toFixed(2),
  ].join("|");
}
