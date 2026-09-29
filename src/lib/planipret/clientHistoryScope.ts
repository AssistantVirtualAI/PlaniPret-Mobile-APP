/**
 * Telephone rows historically used either the Planiprêt profile UUID or the
 * Supabase auth UUID as `user_id`. Query both durable identities, without ever
 * accepting an arbitrary ID from a route or client record.
 */
export function clientHistoryOwnerIds(authUserId?: string | null, profileId?: string | null): string[] {
  return [...new Set([profileId, authUserId].map((value) => String(value ?? "").trim()).filter(Boolean))];
}
