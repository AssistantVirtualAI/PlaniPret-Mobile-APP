/**
 * A broker may use locally retained media while deciding. A declined or
 * deleted call must never be rendered again; Maestro delivery is separately
 * gated to `approved` on the server.
 */
export function canViewLocalCallMedia(saveConsent: string | null | undefined): boolean {
  return saveConsent !== "declined";
}
