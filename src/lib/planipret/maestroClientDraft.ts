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
    && draft.phone.replace(/\D/g, "").length >= 10
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
