/**
 * Text normalization for contact/search filtering.
 * - lowercase
 * - strip diacritics (é → e, ç → c…)
 * - collapse punctuation and whitespace to single spaces
 *
 * `matchAllTokens` splits the query on whitespace and requires every token to
 * appear in the haystack, so "barbieri mark" matches "Mark A. Barbieri" and
 * "jean pierre" matches "Jean-Pierre Dupont".
 */
export function normalizeText(input: unknown): string {
  if (input == null) return "";
  const s = String(input);
  const stripped = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return stripped
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function tokenize(query: string): string[] {
  const n = normalizeText(query);
  if (!n) return [];
  return n.split(" ").filter(Boolean);
}

export function matchAllTokens(haystack: string, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const h = normalizeText(haystack);
  if (!h) return false;
  for (const tok of tokens) {
    if (!h.includes(tok)) return false;
  }
  return true;
}
