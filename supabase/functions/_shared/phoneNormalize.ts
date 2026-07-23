/**
 * NANP phone normalization. Returns +1XXXXXXXXXX or null.
 * Accepts: "514-555-1234", "(514) 555 1234", "+15145551234", "15145551234".
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) {
    const d = digits.slice(1).replace(/\D/g, "");
    if (d.length >= 10 && d.length <= 15) return `+${d}`;
    return null;
  }
  const d = digits.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  if (d.length >= 8 && d.length <= 15) return `+${d}`;
  return null;
}

export function formatDisplay(e164: string | null): string {
  if (!e164) return "";
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  if (m) return `+1 ${m[1]} ${m[2]}-${m[3]}`;
  return e164;
}
