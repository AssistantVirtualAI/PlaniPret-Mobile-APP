/**
 * Guardrails for a direct broker SMS submission.
 *
 * An SMS may be retried manually after an uncertain network result, but it must
 * never be retried automatically: a 5xx can be returned after NetSapiens has
 * accepted the message. The same unchanged draft therefore retains its key so
 * the server can safely resolve a manual replay without a second SMS.
 */
export const SMS_AUTOMATIC_ATTEMPTS = 1;

export type SmsSubmission = {
  fingerprint: string;
  idempotencyKey: string;
};

export type SmsSubmissionInput = {
  to: string;
  body: string;
};

function normalizedDestination(value: string): string {
  const digits = String(value).replace(/\D/g, "");
  // Canadian/US drafts can be entered as a local ten-digit number or with +1.
  // Those representations must map to the same broker idempotency key.
  if (digits.length === 10) return `1${digits}`;
  return digits;
}

export function smsSubmissionFingerprint({ to, body }: SmsSubmissionInput): string {
  return `${normalizedDestination(to)}|${String(body).normalize("NFKC").trim()}`;
}

export function getSmsSubmission(
  previous: SmsSubmission | null,
  input: SmsSubmissionInput,
  makeNonce: () => string = () => crypto.randomUUID(),
): SmsSubmission {
  const fingerprint = smsSubmissionFingerprint(input);
  if (previous?.fingerprint === fingerprint) return previous;
  return { fingerprint, idempotencyKey: `pp-sms-v1:${makeNonce()}` };
}

/** SMS transport results are uncertain after dispatch; only the server may classify a replay. */
export function canAutomaticallyRetrySms(): false {
  return false;
}
