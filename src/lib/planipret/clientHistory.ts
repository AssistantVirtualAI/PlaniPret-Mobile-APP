export type CallClientLink = {
  maestroClientId?: string | null;
  phone?: string | null;
};

/**
 * Only a public phone number without a persisted Maestro link may expose the
 * creation action. A caller display name is never proof that a Maestro record
 * exists: it can come from caller ID, the device address book, or the company
 * directory.
 */
export function shouldOfferMaestroClientCreation(call: CallClientLink): boolean {
  if (String(call.maestroClientId ?? "").trim()) return false;
  return String(call.phone ?? "").replace(/\D/g, "").length >= 10;
}
