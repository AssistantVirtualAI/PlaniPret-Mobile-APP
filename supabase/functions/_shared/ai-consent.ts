export const PLANIPRET_AI_CONSENT_VERSION = "2026-09-15-v3";

export function hasValidAiConsent(profile: {
  ai_consent_at?: string | null;
  ai_consent_revoked_at?: string | null;
} | null | undefined): boolean {
  const grantedAt = profile?.ai_consent_at ? Date.parse(profile.ai_consent_at) : Number.NaN;
  if (!Number.isFinite(grantedAt)) return false;
  const revokedAt = profile?.ai_consent_revoked_at ? Date.parse(profile.ai_consent_revoked_at) : Number.NaN;
  return !Number.isFinite(revokedAt) || revokedAt < grantedAt;
}

export async function loadAiConsent(admin: any, userId: string) {
  const { data, error } = await admin
    .from("planipret_profiles")
    .select("ai_consent_at, ai_consent_version, ai_consent_revoked_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { granted: false, error: "ai_consent_lookup_failed", profile: null };
  if (!data) return { granted: false, error: "profile_not_found", profile: null };
  return { granted: hasValidAiConsent(data), error: null, profile: data };
}
