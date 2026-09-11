// Validation pure du suivi de fin d'appel (partagée par la fonction et les tests).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeE164(raw: unknown): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits || digits.length < 10) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length <= 15) return `+${digits}`;
  return null;
}

export type FollowupInput = { kind?: string; recipient?: string; body?: string; confirmed?: boolean };

export function validateFollowup(input: FollowupInput) {
  if (input.confirmed !== true) return { ok: false as const, error: "confirmation_required" };
  const kind = input.kind === "email" ? "email" : input.kind === "sms" ? "sms" : null;
  if (!kind) return { ok: false as const, error: "kind_required" };
  const text = String(input.body ?? "").trim();
  if (!text) return { ok: false as const, error: "empty_body" };
  const destination = kind === "sms" ? normalizeE164(input.recipient) : String(input.recipient ?? "").trim();
  if (!destination) return { ok: false as const, error: "recipient_required" };
  if (kind === "email" && !EMAIL_RE.test(destination)) return { ok: false as const, error: "recipient_invalid" };
  return { ok: true as const, kind, destination, text };
}
