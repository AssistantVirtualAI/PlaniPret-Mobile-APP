// Logique pure de la feuille de consentement de fin d'appel.
// Isolée du React pour être testable et identique sur iOS et Android.

export type ConsentCall = {
  id: string;
  user_id?: string | null;
  from_number: string | null;
  to_number: string | null;
  direction: string | null;
  maestro_client_id?: string | null;
  maestro_client_name: string | null;
  from_name: string | null;
  to_name: string | null;
  duration_seconds: number | null;
  save_consent: string | null;
  answered_at?: string | null;
  status?: string | null;
  created_at?: string | null;
  ended_at?: string | null;
};

export type EndedDetail = {
  providerCallId?: string | null;
  number?: string | null;
  direction?: "in" | "out" | null;
  answered?: boolean;
  /** Heure de fin d'appel vue par l'app (ISO). */
  endedAt?: string | null;
  /**
   * D'où viennent les lignes fournies :
   *  • "provider" : requête ciblée sur l'identifiant fournisseur (id / ns_callid
   *    / ns_call_id) — la correspondance est déjà faite par la base ;
   *  • "recent"  : appels très récents du courtier (repli).
   */
  source?: "provider" | "recent";
};

/** Un appel déjà tranché (oui/non) ne redemande jamais le consentement. */
export function alreadyDecided(call: Pick<ConsentCall, "save_consent">): boolean {
  return call.save_consent === "approved" || call.save_consent === "declined";
}

/** Only a connected call requires a save/delete decision. */
export function requiresPostCallDecision(call: ConsentCall): boolean {
  if (alreadyDecided(call)) return false;
  if (call.answered_at) return true;
  const status = String(call.status ?? "").toLowerCase();
  const duration = Number(call.duration_seconds ?? 0);
  return duration > 0 && !["missed", "no_answer", "declined", "rejected", "cancelled", "failed"].some((value) => status.includes(value));
}

/**
 * Choisit l'appel qui vient de se terminer. On n'accepte QUE l'appel désigné
 * par l'événement, ou — à défaut d'identifiant fournisseur — un appel très
 * récent du même courtier avec le même numéro. Jamais « le dernier appel ».
 */
export function pickEndedCall(
  rows: ConsentCall[],
  detail: EndedDetail,
  ownerIds: string[],
): ConsentCall | null {
  const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(-10);
  const owned = rows.filter((r) => !r.user_id || ownerIds.includes(String(r.user_id)));
  const usable = owned.filter(requiresPostCallDecision);
  if (!usable.length) return null;
  if (detail.providerCallId) {
    const match = usable.find((r) => r.id === detail.providerCallId);
    if (match) return match;
    // La ligne a été trouvée par ns_callid / ns_call_id : son `id` interne
    // diffère de l'identifiant fournisseur, mais c'est bien le même appel.
    if (detail.source === "provider") return usable[0];
  }
  const wanted = digits(detail.number);
  if (wanted) return pickByNumber(usable, detail, wanted);
  // Repli : appel très récent du courtier, sans identifiant ni numéro.
  if (!detail.providerCallId && detail.source === "recent") return usable[0];
  return null;
}

/** Fenêtre max entre la fin vue par l'app et le `ended_at` du serveur. */
export const ENDED_MATCH_WINDOW_MS = 3 * 60_000;

function dirOf(v: unknown): "in" | "out" | null {
  const s = String(v ?? "").toLowerCase();
  if (!s) return null;
  return s === "in" || s === "inbound" || s === "missed" ? "in" : "out";
}

/**
 * Repli par numéro : numéro identique (10 chiffres), même sens si connu, et
 * `ended_at` proche de la fin vue par l'app. Une ligne sans `ended_at` n'est
 * retenue que si elle est la seule candidate et commencée avant la fin.
 * Jamais « le dernier appel » sans correspondance vérifiée.
 */
function pickByNumber(rows: ConsentCall[], detail: EndedDetail, wanted: string): ConsentCall | null {
  const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(-10);
  const endMs = detail.endedAt ? Date.parse(detail.endedAt) : NaN;
  let cands = rows.filter((r) => digits(clientNumberOf(r)) === wanted
    || digits(r.from_number) === wanted || digits(r.to_number) === wanted);
  if (detail.direction) cands = cands.filter((r) => dirOf(r.direction) === detail.direction);
  if (!cands.length) return null;
  if (Number.isNaN(endMs)) return cands.length === 1 ? cands[0] : null;
  const ended = cands
    .filter((r) => r.ended_at)
    .map((r) => ({ r, gap: Math.abs(Date.parse(String(r.ended_at)) - endMs) }))
    .filter((x) => Number.isFinite(x.gap) && x.gap <= ENDED_MATCH_WINDOW_MS)
    .sort((a, b) => a.gap - b.gap);
  if (ended.length) return ended[0].r;
  const open = cands.filter((r) => !r.ended_at && (!r.created_at || Date.parse(r.created_at) <= endMs + 5_000));
  return open.length === 1 ? open[0] : null;
}

export function clientNumberOf(call: ConsentCall): string {
  const inbound = call.direction === "in" || call.direction === "inbound" || call.direction === "missed";
  return (inbound ? call.from_number : call.to_number) ?? "";
}

export function clientNameOf(call: ConsentCall): string {
  const inbound = call.direction === "in" || call.direction === "inbound" || call.direction === "missed";
  return (
    call.maestro_client_name ||
    (inbound ? call.from_name : call.to_name) ||
    clientNumberOf(call)
  );
}

/** Client introuvable/ambigu : le courtier doit choisir, jamais l'app. */
export function needsClientSelection(call: ConsentCall): boolean {
  const named = String(call.maestro_client_name ?? "").trim();
  return !call.maestro_client_id && !named;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type DraftState = {
  kind: "sms" | "email" | null;
  body: string;
  recipient: string;
  confirmed: boolean;
  busy?: boolean;
};

/** Bouton « Confirmer et envoyer » : jamais actif sans confirmation explicite. */
export function canSendFollowup(d: DraftState): boolean {
  if (d.busy) return false;
  if (!d.kind) return false;
  if (!d.confirmed) return false;
  if (!d.body.trim()) return false;
  const to = d.recipient.trim();
  if (!to) return false;
  if (d.kind === "email") return EMAIL_RE.test(to);
  return to.replace(/\D/g, "").length >= 10;
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** broker/appel + canal + destinataire + contenu → une seule exécution. */
export function followupIdempotencyKey(input: {
  userId: string;
  callId: string;
  kind: "sms" | "email";
  recipient: string;
  body: string;
  subject?: string;
}): string {
  return [
    "followup",
    input.userId,
    input.callId,
    input.kind,
    input.recipient.trim().toLowerCase(),
    hash(`${input.subject ?? ""}::${input.body.trim()}`),
  ].join("|");
}
