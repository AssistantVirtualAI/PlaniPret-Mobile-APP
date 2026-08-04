/**
 * Microsoft 365 connection state for a broker profile.
 *
 * The mobile/web client never receives `ms365_access_token` any more: credential
 * columns are stripped from `planipret_profiles` reads for security. Screens that
 * still tested `profile.ms365_access_token` therefore always rendered
 * "Microsoft 365 non connecté" even for connected brokers.
 *
 * Connection is now derived from the non-credential markers that ARE exposed:
 * the linked mailbox address and the token expiry timestamp.
 */
export function ms365Connected(profile: any): boolean {
  if (!profile) return false;
  if (profile.ms365_access_token) return true;
  if (profile.ms365_email) return true;
  if (profile.ms365_token_expiry) return true;
  return false;
}

/** True when the stored Microsoft token is expired and needs a silent refresh. */
export function ms365TokenExpired(profile: any): boolean {
  const exp = profile?.ms365_token_expiry;
  if (!exp) return false;
  const t = new Date(exp).getTime();
  return Number.isFinite(t) && t < Date.now();
}
