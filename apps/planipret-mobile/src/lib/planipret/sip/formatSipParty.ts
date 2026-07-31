/**
 * Normalise l'identité d'un correspondant, quel que soit le format reçu.
 *
 * Gère : `"Nom" <sip:user@domain>`, `<sips:...>`, `tel:+15145551234`,
 * `+15145551234`, `514-555-1234`, `1999` (poste interne), `anonymous`,
 * `Restricted`, `unknown`, valeurs vides…
 *
 * Objectif : la MÊME UI d'appel fonctionne pour n'importe quel broker /
 * n'importe quel appelant sans logique spécifique par domaine.
 */
export interface SipPartyDisplay {
  /** Nom à afficher en gros (nom, numéro formaté ou "Appel entrant"). */
  name: string;
  /** Numéro / user brut normalisé (E.164 si possible, poste sinon). */
  number: string;
  /** Sous-titre facultatif (numéro quand le nom est différent). */
  subtitle: string;
  domain: string | null;
  isInternal: boolean;
  isAnonymous: boolean;
}

const ANON = /^(anonymous|unknown|restricted|private|unavailable|inconnu|masqu[ée])$/i;

function prettyPhone(raw: string): string {
  const d = raw.replace(/[^\d+]/g, "");
  const digits = d.replace(/\D/g, "");
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits.startsWith("1")) {
    const n = digits.slice(1);
    return `+1 (${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`;
  }
  if (d.startsWith("+")) return d;
  return raw;
}

export function formatSipParty(
  raw: string | null | undefined,
  lang: "fr" | "en" = "fr",
  fallbackNumber?: string | null,
): SipPartyDisplay {
  const unknownLabel = lang === "en" ? "Unknown caller" : "Appelant inconnu";
  const source = String(raw ?? "").trim() || String(fallbackNumber ?? "").trim();
  if (!source) {
    return { name: unknownLabel, number: "", subtitle: "", domain: null, isInternal: false, isAnonymous: true };
  }

  let displayName = "";
  let uri = source;

  const angle = source.match(/<\s*((?:sips?|tel):[^>\s]+)\s*>/i);
  if (angle) {
    uri = angle[1].trim();
    displayName = source.slice(0, angle.index ?? 0).trim().replace(/^["']|["']$/g, "").trim();
  }
  if (!displayName) {
    const quoted = source.match(/^\s*"([^"]+)"/);
    if (quoted) displayName = quoted[1].trim();
  }

  let user = "";
  let domain: string | null = null;
  const sip = uri.match(/sips?:([^@;>\s]+)(?:@([^;>\s]+))?/i);
  const tel = uri.match(/^tel:([^;>\s]+)/i);
  if (sip) {
    user = sip[1];
    domain = sip[2] ? sip[2].split(";")[0] : null;
  } else if (tel) {
    user = tel[1];
  } else {
    user = uri.split("@")[0].split(";")[0];
    const at = uri.split("@")[1];
    if (at) domain = at.split(";")[0];
  }
  try { user = decodeURIComponent(user); } catch { /* keep raw */ }
  user = user.replace(/^["']|["']$/g, "").trim();

  displayName = displayName
    .replace(/<\s*(?:sips?|tel):[^>]+>/gi, "")
    .replace(/^(?:sips?|tel):/i, "")
    .split("@")[0]
    .split(";")[0]
    .replace(/^["']|["']$/g, "")
    .trim();

  const isAnonymous = ANON.test(user) || (!user && ANON.test(displayName));
  if (isAnonymous) {
    const label = lang === "en" ? "Private number" : "Numéro masqué";
    return { name: label, number: "", subtitle: "", domain, isInternal: false, isAnonymous: true };
  }

  const isInternal = /^\d{2,6}$/.test(user);
  const looksLikePhone = /^\+?\d[\d\s().-]{5,}$/.test(user);
  const number = looksLikePhone || isInternal ? user.replace(/[^\d+]/g, "") : user;

  if (ANON.test(displayName)) displayName = "";
  // Un "nom" purement numérique est en réalité le numéro.
  if (displayName && displayName.replace(/[^\d+]/g, "") === number) displayName = "";

  const prettyNumber = isInternal
    ? (lang === "en" ? `Ext. ${number}` : `Poste ${number}`)
    : looksLikePhone ? prettyPhone(number) : number;

  const name = displayName || prettyNumber || unknownLabel;
  const subtitle = displayName && prettyNumber && displayName !== prettyNumber ? prettyNumber : "";

  return { name, number, subtitle, domain, isInternal, isAnonymous: false };
}
