/**
 * NANP phone normalization, shared by dialer, contacts sync and caller ID.
 * Returns "+1XXXXXXXXXX" or null when the input doesn't look like a phone.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('+')) {
    const d = trimmed.slice(1).replace(/\D/g, '');
    return d.length >= 8 && d.length <= 15 ? `+${d}` : null;
  }
  const d = trimmed.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  if (d.length >= 8 && d.length <= 15) return `+${d}`;
  return null;
}

export function formatDisplay(e164: string | null | undefined): string {
  if (!e164) return '';
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `+1 ${m[1]} ${m[2]}-${m[3]}` : e164;
}
