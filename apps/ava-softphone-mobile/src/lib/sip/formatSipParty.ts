/**
 * Normalize a SIP remote party display so the UI never shows raw
 * `"Name" <sip:USER@domain>` strings.
 *
 * Returns:
 *   - name:      caller display name (falls back to user part)
 *   - user:      the SIP user (extension for internal, E.164 for PSTN)
 *   - domain:    host part (used to detect internal vs external)
 *   - isInternal:true when the user part is a 3-6 digit extension
 *   - subtitle:  short second-line label (e.g. "Poste 223 · Interne" / "Ext. 223 · Internal")
 */
export interface SipPartyDisplay {
  name: string;
  user: string;
  domain: string | null;
  isInternal: boolean;
  subtitle: string;
}

export function formatSipParty(raw: string | null | undefined, lang: 'fr' | 'en' = 'fr'): SipPartyDisplay {
  const empty: SipPartyDisplay = { name: lang === 'en' ? 'Unknown' : 'Inconnu', user: '', domain: null, isInternal: false, subtitle: '' };
  if (!raw) return empty;
  const s = String(raw).trim();
  if (!s) return empty;

  // Try `"Display Name" <sip:user@domain>;tag=x`, `<sip:user@domain>`, `sip:user@domain`, or bare user.
  let name = '';
  let uri = s;
  const angleUri = s.match(/<\s*(sips?:[^>\s]+)\s*>/i);
  if (angleUri) {
    uri = angleUri[1].trim();
    const beforeUri = s.slice(0, angleUri.index ?? 0).trim();
    name = beforeUri.replace(/^["']|["']$/g, '').trim();
  }
  if (!name) {
    const quoted = s.match(/^\s*"([^"]+)"/);
    if (quoted) name = quoted[1].trim();
  }

  const sipMatch = uri.match(/sips?:([^@;>\s]+)(?:@([^;>\s]+))?/i);
  const userRaw = sipMatch ? sipMatch[1] : uri.replace(/^sips?:/i, '').split('@')[0].split(';')[0];
  const user = decodeURIComponent(userRaw).replace(/^"|"$/g, '').trim();
  const domain = sipMatch && sipMatch[2] ? sipMatch[2].split(';')[0] : null;

  const isInternal = /^\d{2,6}$/.test(user);
  const cleanedName = name
    .replace(/<\s*sips?:[^>]+>/ig, '')
    .replace(/^sip:/i, '')
    .split('@')[0]
    .split(';')[0]
    .replace(/^"|"$/g, '')
    .trim();
  name = cleanedName && cleanedName !== 'unknown' ? cleanedName : '';
  // Always show the raw number/user as the display name.
  // 'Poste X' / 'Extension X' is kept only as a subtitle hint.
  if (!name || name === user) name = user;

  // Do not show 'Poste X · Interne' / 'Ext. X · Internal' as subtitle.
  // The raw extension number is already shown as the main name, so the
  // subtitle would be redundant and confusing for the user.
  const subtitle = isInternal
    ? ''
    : (user && user !== name ? user : '');

  return { name, user, domain, isInternal, subtitle };
}
