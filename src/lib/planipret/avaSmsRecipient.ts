export type AvaSmsRecipient = {
  number: string;
  contactName: string;
  message: string;
};

type SuggestionPayload = Record<string, unknown> | undefined;

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

/**
 * SMS targets may be Canadian numbers in several display formats. Extensions
 * are deliberately retained so the server can return its normal validation
 * error rather than silently changing an existing action.
 */
function isPhoneLike(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 2 && /^[+\d][\d\s().-]*$/.test(value);
}

/**
 * Normalizes an AVA suggestion without guessing a phone number from a name.
 * Models occasionally place a person name in `number` or `recipient`; this
 * moves it to `contactName` so the server can perform a broker-scoped lookup.
 */
export function normalizeAvaSmsRecipient(payload: SuggestionPayload): AvaSmsRecipient {
  const p = payload ?? {};
  const rawTarget = firstText(p.number, p.to, p.phone, p.phone_number, p.to_number, p.destination);
  const rawRecipient = firstText(p.recipient, p.recipient_name);
  let number = rawTarget;
  let contactName = firstText(p.contact_name, p.recipient_name, p.client_name, p.full_name, p.name);

  if (number && !isPhoneLike(number)) {
    contactName ||= number;
    number = "";
  }

  if (!number && rawRecipient) {
    if (isPhoneLike(rawRecipient)) number = rawRecipient;
    else contactName ||= rawRecipient;
  }

  return {
    number,
    contactName,
    message: firstText(p.message, p.body, p.text, p.content),
  };
}
