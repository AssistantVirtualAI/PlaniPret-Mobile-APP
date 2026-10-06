export type MaestroClientDraft = {
  firstName: string;
  lastName: string;
  phone: string;
  salutation: string;
  sex: string;
  language: string;
  streetNumber: string;
  streetName: string;
  streetType: string;
  city: string;
  region: string;
  zip: string;
};

export function maestroPhoneDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

export function formatMaestroPhone(value: string): string {
  const digits = maestroPhoneDigits(value);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * Matches the documented mandatory Maestro creation contract. Keeping this
 * pure prevents the mobile UI from offering a submit action that the server
 * must reject with a 422.
 */
export function hasRequiredMaestroClientFields(draft: MaestroClientDraft): boolean {
  return draft.firstName.trim().length > 0
    && draft.firstName.length <= 80
    && draft.lastName.trim().length > 0
    && draft.lastName.length <= 80
    && maestroPhoneDigits(draft.phone).length === 10
    && /^\d+$/.test(draft.salutation)
    && (draft.sex === "m" || draft.sex === "f")
    && (draft.language === "fr" || draft.language === "en")
    && draft.streetNumber.trim().length > 0
    && draft.streetName.trim().length > 0
    && /^\d+$/.test(draft.streetType)
    && draft.city.trim().length > 0
    && /^[A-Za-z]{2}$/.test(draft.region.trim())
    && /^[A-Za-z]\d[A-Za-z] ?\d[A-Za-z]\d$/.test(draft.zip.trim());
}
