// ns-call-events — normalizes NetSapiens NS-API v2 subscription posts into the
// internal `{ type, data }` shape used by ns-webhook-receiver.
//
// Per docs/netsapiens/webhooks.md, NS posts an ARRAY of objects whose schema
// matches the subscribed model's read resource. There is no `type` field, so
// the model has to be inferred from the object's own fields:
//   - `call`      → active-call state changes; `remove: "yes"` means teardown
//   - `cdr`       → one event at call completion
//   - `message`   → inbound chat/SMS
//   - `voicemail` → new voicemail
// Legacy `{ type, data }` posts (our own tests / older bridges) still work.

export type NsNormalizedEvent = { type: string; data: any };

const str = (v: unknown) => (v == null ? "" : String(v));

export function isTeardown(o: any): boolean {
  const v = str(o?.remove ?? o?.["call-remove"]).toLowerCase();
  return v === "yes" || v === "true" || v === "1";
}

/** SIP Call-ID of the originating leg — stable across a call's state changes. */
export function nsCallKey(o: any): string {
  return str(
    o?.orig_callid ?? o?.["orig-callid"] ?? o?.["call-orig-call-id"] ??
    o?.call_id ?? o?.callid ?? o?.id ?? "",
  );
}

function looksLikeCall(o: any): boolean {
  return (
    o?.orig_callid != null || o?.["orig-callid"] != null ||
    o?.term_user != null || o?.["term-user"] != null ||
    o?.orig_user != null || o?.["orig-user"] != null ||
    o?.["call-orig-user"] != null || o?.["call-term-user"] != null
  );
}

function looksLikeCdr(o: any): boolean {
  return o?.["cdr-id"] != null || o?.cdr_id != null || o?.["call-parent-cdr-id"] != null ||
    o?.duration != null || o?.duration_seconds != null;
}

function looksLikeVoicemail(o: any): boolean {
  return o?.["voicemail-id"] != null || o?.voicemail_id != null || o?.["message-mailbox"] != null;
}

function looksLikeMessage(o: any): boolean {
  return o?.message != null || o?.body != null || o?.["message-text"] != null;
}

/** Extension the call is terminating to (the broker being rung). */
export function nsTermExtension(o: any): string | null {
  const raw = o?.term_user ?? o?.["term-user"] ?? o?.["call-term-user"] ??
    o?.extension ?? o?.user ?? o?.to ?? o?.callee ?? null;
  if (raw == null) return null;
  // NS often reports "113@domain" or "sip:113@domain"
  const cleaned = str(raw).replace(/^sip:/i, "").split("@")[0].trim();
  return cleaned || null;
}

/**
 * Valeurs que NetSapiens (et les trunks en amont) placent dans `orig_from_user`
 * quand l'appelant est masqué. Elles ne sont PAS composables : les passer à
 * `CXHandle(type: .phoneNumber, …)` fait afficher « numéro indisponible » par
 * iOS, car CallKit rejette un handle téléphonique non numérique.
 */
const ANONYMOUS_CALLER = /^(anonymous|unknown|unavailable|restricted|private|priv[eé]|masqu[eé]|withheld|blocked|no[\s_-]?number|null|0+)$/i;

/**
 * Sources dans lesquelles NetSapiens peut placer le numéro appelant.
 *
 * L'ordre compte : les champs explicitement numériques d'abord, les URI SIP
 * ensuite. Certains trunks ne renseignent QUE `orig_from_uri` ou `ani`, d'où
 * l'étendue de cette liste (issue de l'extracteur de Lovable, commit 5f050f57).
 */
const CALLER_FIELDS = [
  "from_number", "caller_number", "ani", "orig_from_user", "orig-from-user",
  "from_user", "remote_party", "from", "orig_user", "orig-user",
  "call-orig-from-user", "orig_from_uri", "orig-from-uri", "from_uri",
] as const;

/**
 * Extrait la chaîne appelante brute d'un objet d'événement NetSapiens, en
 * balayant toutes les sources connues, puis décapsule l'URI SIP et les
 * chevrons d'un display-name (`"Nom" <sip:514...@dom>`).
 *
 * Ne normalise PAS : voir `nsCallerNumber` pour l'E.164.
 */
export function nsPickCallerField(o: any): string {
  if (o == null) return "";
  for (const key of CALLER_FIELDS) {
    const v = o?.[key];
    if (v == null) continue;
    const extracted = nsCallerRaw(v);
    if (extracted) return extracted;
  }
  return "";
}

/**
 * Décapsule une valeur appelante : `"Nom" <sip:5144942888@dom;user=phone>`
 * devient `5144942888`.
 */
export function nsCallerRaw(raw: unknown): string {
  const s = str(raw).trim();
  if (!s) return "";
  // Un display-name peut précéder l'URI : ne garder que la partie sip:.
  const m = s.match(/sip:([^@;>\s]+)/i);
  const user = (m ? m[1] : s).replace(/^</, "").replace(/>$/, "").trim();
  // Sans schéma sip:, la valeur peut rester de la forme `514...@domaine`.
  return user.split("@")[0].trim();
}

/**
 * Normalise le numéro appelant en E.164 pour que CallKit puisse le résoudre.
 *
 * NetSapiens envoie typiquement `5144942888` ou `15144942888`, sans le `+`.
 * iOS exige E.164 sur un handle `.phoneNumber` ; sans le `+` il n'associe pas
 * le contact et retombe sur son libellé générique.
 *
 * Retourne `null` pour un appelant masqué ou un numéro non composable, afin que
 * la couche native choisisse un handle `.generic` au lieu de `.phoneNumber`.
 */
export function nsCallerNumber(raw: unknown): string | null {
  if (raw == null) return null;
  const cleaned = nsCallerRaw(raw);
  if (!cleaned) return null;
  if (ANONYMOUS_CALLER.test(cleaned)) return null;
  const digits = cleaned.replace(/\D/g, "");
  // Extensions internes (3 à 6 chiffres) : composables mais pas E.164.
  // On les rend telles quelles, sans `+`.
  if (digits.length >= 3 && digits.length <= 6) return digits;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) {
    return cleaned.startsWith("+") ? `+${digits}` : `+${digits}`;
  }
  return null;
}

function mapCall(o: any): NsNormalizedEvent | null {
  if (isTeardown(o)) return null;
  const ext = nsTermExtension(o);
  if (!ext) return null;
  // Balayage large de toutes les sources connues, URI SIP comprises.
  const from = nsPickCallerField(o);
  const normalized = nsCallerNumber(from);
  return {
    type: "call.inbound",
    data: {
      ...o,
      call_id: nsCallKey(o),
      extension: ext,
      // E.164 quand c'est possible : c'est ce que CallKit et le carnet
      // d'adresses attendent. `null` = appelant masqué ou non composable.
      from_number: normalized,
      // Valeur brute conservée pour le diagnostic et les journaux d'appel.
      from_number_raw: from || null,
      caller_anonymous: normalized == null,
      to_number: ext,
      from_name: o?.orig_from_name ?? o?.["orig-from-name"] ?? o?.caller_name ?? null,
    },
  };
}

/**
 * Accepts the raw webhook body (array or object, v2 resource shape or legacy
 * `{ type, data }`) and returns the list of events to process.
 */
export function normalizeNsEvents(body: any): NsNormalizedEvent[] {
  const items: any[] = Array.isArray(body) ? body : [body];
  const out: NsNormalizedEvent[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;

    // Legacy / explicit shape wins.
    const explicit = item?.type ?? item?.event?.type;
    if (explicit) {
      out.push({ type: str(explicit), data: item?.data ?? item?.payload ?? item });
      continue;
    }

    if (looksLikeCall(item)) {
      const mapped = mapCall(item);
      if (mapped) out.push(mapped);
      continue;
    }
    if (looksLikeVoicemail(item)) { out.push({ type: "voicemail.new", data: item }); continue; }
    if (looksLikeCdr(item)) { out.push({ type: "cdr", data: item }); continue; }
    if (looksLikeMessage(item)) { out.push({ type: "message.inbound", data: item }); continue; }
  }
  return out;
}

/**
 * Short-lived in-isolate dedup: the `call` model fires on EVERY state change,
 * so without this a single ringing call would produce several VoIP pushes.
 */
const seen = new Map<string, number>();
export function shouldProcessCall(key: string, ttlMs = 60_000, now = Date.now()): boolean {
  if (!key) return true;
  for (const [k, t] of seen) if (now - t > ttlMs) seen.delete(k);
  if (seen.has(key)) return false;
  seen.set(key, now);
  return true;
}

export function __resetCallDedupForTests() { seen.clear(); }
