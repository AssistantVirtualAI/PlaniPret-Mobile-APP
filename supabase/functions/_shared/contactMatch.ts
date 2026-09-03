// Unified contact matching helpers shared by pp-contact-search and AVA tools.
// Accent-insensitive, token-based scoring so "tremblay jean" matches
// "Jean Tremblay" and "Jean-Pierre" matches "jean pierre".

export type UnifiedContact = {
  name: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  extension?: string | null;
  email?: string | null;
  company?: string | null;
  source: string; // device | microsoft | directory | shared | ns_contacts | maestro
  external_id?: string | null;
  score?: number;
};

export function normalizeText(input: unknown): string {
  if (input == null) return "";
  return String(input)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function tokenize(query: string): string[] {
  const n = normalizeText(query);
  return n ? n.split(" ").filter(Boolean) : [];
}

export function digitsOnly(v: unknown): string {
  return String(v ?? "").replace(/\D+/g, "");
}

/**
 * Score a contact against a query. 0 = no match.
 * Exact full-name match ranks highest, then token-prefix, then substring,
 * then company / email / phone matches.
 */
export function scoreContact(c: UnifiedContact, query: string): number {
  const tokens = tokenize(query);
  if (!tokens.length) return 0;

  const name = normalizeText(c.name || `${c.first_name ?? ""} ${c.last_name ?? ""}`);
  const nameTokens = name ? name.split(" ") : [];
  const company = normalizeText(c.company);
  const email = normalizeText(c.email);
  const emailRaw = String(c.email ?? "").toLowerCase();
  const phoneDigits = digitsOnly(c.phone) + " " + digitsOnly(c.extension);
  const qDigits = digitsOnly(query);

  // Phone / extension search
  if (qDigits.length >= 3 && phoneDigits.replace(/\s/g, "").includes(qDigits)) return 95;

  let score = 0;
  const q = normalizeText(query);
  if (name && name === q) return 100;
  if (emailRaw && emailRaw === String(query).trim().toLowerCase()) return 100;

  let matchedAll = true;
  for (const tok of tokens) {
    let best = 0;
    for (const nt of nameTokens) {
      if (nt === tok) best = Math.max(best, 30);
      else if (nt.startsWith(tok)) best = Math.max(best, 22);
      else if (nt.includes(tok)) best = Math.max(best, 12);
      else if (tok.length === 1 && nt[0] === tok) best = Math.max(best, 8);
    }
    if (!best && company && company.includes(tok)) best = 6;
    if (!best && email && email.includes(tok)) best = 6;
    if (!best) matchedAll = false;
    score += best;
  }
  if (!matchedAll) {
    // Partial matches still count when at least one strong name token hit.
    score = score >= 22 ? Math.round(score / 2) : 0;
  }
  // Slight boost when every query token maps onto a distinct name token.
  if (matchedAll && tokens.length > 1) score += 10;
  return score;
}

const SOURCE_RANK: Record<string, number> = {
  device: 5, maestro: 4, directory: 3, shared: 2, ns_contacts: 2, microsoft: 1,
};

/** Merge duplicates across sources (same phone or same email). */
export function dedupeContacts(list: UnifiedContact[]): UnifiedContact[] {
  const byKey = new Map<string, UnifiedContact>();
  const order: string[] = [];
  for (const c of list) {
    const phoneKey = digitsOnly(c.phone).slice(-10);
    const emailKey = String(c.email ?? "").trim().toLowerCase();
    const key = phoneKey || emailKey || normalizeText(c.name);
    if (!key) continue;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...c });
      order.push(key);
      continue;
    }
    const merged: UnifiedContact = {
      ...prev,
      name: prev.name || c.name,
      phone: prev.phone || c.phone,
      extension: prev.extension || c.extension,
      email: prev.email || c.email,
      company: prev.company || c.company,
      external_id: prev.external_id || c.external_id,
      score: Math.max(prev.score ?? 0, c.score ?? 0),
      source: (SOURCE_RANK[c.source] ?? 0) > (SOURCE_RANK[prev.source] ?? 0) ? c.source : prev.source,
    };
    byKey.set(key, merged);
  }
  return order.map((k) => byKey.get(k)!).filter(Boolean);
}

export function rankContacts(list: UnifiedContact[], query: string, limit = 10): UnifiedContact[] {
  const scored = list
    .map((c) => ({ ...c, score: scoreContact(c, query) }))
    .filter((c) => (c.score ?? 0) > 0);
  return dedupeContacts(scored)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (SOURCE_RANK[b.source] ?? 0) - (SOURCE_RANK[a.source] ?? 0))
    .slice(0, limit);
}
