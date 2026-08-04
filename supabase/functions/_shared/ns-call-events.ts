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

function mapCall(o: any): NsNormalizedEvent | null {
  if (isTeardown(o)) return null;
  const ext = nsTermExtension(o);
  if (!ext) return null;
  const from = o?.orig_from_user ?? o?.["orig-from-user"] ?? o?.orig_user ?? o?.["orig-user"] ??
    o?.from_number ?? o?.from ?? o?.["call-orig-from-user"] ?? null;
  return {
    type: "call.inbound",
    data: {
      ...o,
      call_id: nsCallKey(o),
      extension: ext,
      from_number: from ? str(from).replace(/^sip:/i, "").split("@")[0] : null,
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
