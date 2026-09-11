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
};

export type EndedDetail = { providerCallId?: string | null; number?: string | null };

/** Un appel déjà tranché (oui/non) ne redemande jamais le consentement. */
export function alreadyDecided(call: Pick<ConsentCall, "save_consent">): boolean {
  return call.save_consent === "approved" || call.save_consent === "declined";
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
  const usable = owned.filter((r) => !alreadyDecided(r));
  if (!usable.length) return null;
  if (detail.providerCallId) {
    const match = usable.find((r) => r.id === detail.providerCallId);
    if (match) return match;
  }
  const wanted = digits(detail.number);
  if (!wanted) return null;
  return usable.find((r) => digits(r.from_number) === wanted || digits(r.to_number) === wanted) ?? null;
}

export function clientNumberOf(call: ConsentCall): string {
  return (call.direction === "in" ? call.from_number : call.to_number) ?? "";
}

export function clientNameOf(call: ConsentCall): string {
  return (
    call.maestro_client_name ||
    (call.direction === "in" ? call.from_name : call.to_name) ||
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
