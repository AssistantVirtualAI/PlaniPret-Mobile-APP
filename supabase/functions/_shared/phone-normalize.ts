// E.164 phone normalization helper (default country: CA/US = +1)
export function normalizePhoneE164(input: string | null | undefined, defaultCountry = "1"): string | null {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  // Preserve leading + if present
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;

  // Poste interne (2 à 6 chiffres) : on compose le poste tel quel, jamais +1XXXX.
  if (digits.length <= 6) return digits;

  let normalized: string;
  if (hasPlus) {
    normalized = `+${digits}`;
  } else if (digits.length === 10) {
    normalized = `+${defaultCountry}${digits}`;
  } else if (digits.length === 11 && digits.startsWith("1")) {
    normalized = `+${digits}`;
  } else if (digits.length >= 8 && digits.length <= 15) {
    normalized = `+${digits}`;
  } else {
    return null;
  }

  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) return null;
  return normalized;
}
