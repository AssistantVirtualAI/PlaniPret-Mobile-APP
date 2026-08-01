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

/**
 * True when the Microsoft link genuinely requires the broker to sign in again.
 *
 * A Microsoft *access* token lives for ~1 hour, but every server-side Graph call
 * goes through `refreshMicrosoftAccessToken()` which silently mints a new one
 * from the stored `refresh_token`. Treating a past `ms365_token_expiry` as a
 * broken link therefore surfaced a permanent "session expired / Reconnect"
 * banner on screens that read the cached profile, while Settings — which asks
 * the server — correctly reported "Connected".
 *
 * Re-authentication is only required when the refresh grant itself is gone:
 *  - the server explicitly flagged the link as disconnected
 *    (`ms365_connected === false` / `ms365_not_connected`), or
 *  - a refresh attempt failed and was recorded in `ms365_last_error`, or
 *  - the token expired so long ago that the refresh token has lapsed too
 *    (Microsoft refresh tokens for delegated flows expire after 90 days of
 *    inactivity).
 */
const REFRESH_TOKEN_GRACE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export function ms365TokenExpired(profile: any): boolean {
  if (!profile) return false;

  // Server said the link is gone — a real reconnect is needed.
  if (profile.ms365_connected === false) return true;
  if (profile.ms365_not_connected === true) return true;

  // A recorded refresh/auth failure means the silent refresh no longer works.
  const lastError = profile.ms365_last_error;
  if (typeof lastError === "string" && lastError.trim()) return true;

  const exp = profile.ms365_token_expiry;
  if (!exp) return false;
  const t = new Date(exp).getTime();
  if (!Number.isFinite(t)) return false;

  // Expired within the refresh window: the server refreshes transparently.
  return t < Date.now() - REFRESH_TOKEN_GRACE_MS;
}
