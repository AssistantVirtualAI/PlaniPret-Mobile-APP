// Garde-fou : PLUS AUCUN texto de test ne part, pour personne.
// Décision produit (2026-09-08) : blocage définitif, sans exception ni allowlist.

/** Conservé pour compatibilité d'import — volontairement vide. */
export const TEST_SMS_ALLOWED_USER_IDS = new Set<string>();

// Ciblage strict : uniquement les messages qui sont manifestement des envois
// de test/QA automatisés. Un message légitime qui contient « test de crédit »
// ou « période d'essai » doit partir normalement.
const TEST_PATTERNS = [
  /^\s*test\s*(sms|texto|text|message|qa|\d+)?\s*[.!:-]*\s*$/i,
  /\b(test|texto\s*de\s*test|message\s*de\s*test)\s*(sms|texto|text|message)\b/i,
  /\bsms\s*de\s*test\b/i,
  /\bqa\s*(ava|test|\d)/i,
  /- ?ignorer\b/i,
  /\bignore this\b/i,
  /\bmessage\s*d['’]essai\b/i,
  /\bdemo\s*(sms|texto|message)\b/i,
];

export function isTestSms(body: string | null | undefined): boolean {
  const t = String(body ?? "").trim();
  if (!t) return false;
  return TEST_PATTERNS.some((re) => re.test(t));
}

/** true = l'envoi doit être bloqué. Aucun utilisateur n'est exempté. */
export function blockTestSms(_userId: string | null | undefined, body: string | null | undefined): boolean {
  return isTestSms(body);
}

export const TEST_SMS_BLOCK_MESSAGE =
  "Les textos de test sont désactivés de façon permanente : aucun message de test ne peut être envoyé.";
