/**
 * A missing, pending, declined, or malformed decision is never consent.
 * Client history may expose recorded media only after an explicit approval.
 */
export function hasApprovedRecordingConsent(saveConsent: string | null | undefined): boolean {
  return saveConsent === "approved";
}
