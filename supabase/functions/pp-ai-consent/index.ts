import { authBroker, corsHeaders, jsonResponse } from "../_shared/ns-broker.ts";
import { PLANIPRET_AI_CONSENT_VERSION } from "../_shared/ai-consent.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "method_not_allowed" }, 405);

  const auth = await authBroker(req);
  if ("error" in auth) return auth.error;
  if (auth.authMode !== "jwt") {
    return jsonResponse({ success: false, error: "user_confirmation_required" }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "status");
  const now = new Date().toISOString();

  if (action === "grant") {
    const { data, error } = await auth.admin
      .from("planipret_profiles")
      .update({
        ai_consent_at: now,
        ai_consent_version: PLANIPRET_AI_CONSENT_VERSION,
        ai_consent_revoked_at: null,
      })
      .eq("user_id", auth.userId)
      .select("user_id")
      .maybeSingle();
    if (error) return jsonResponse({ success: false, error: "consent_store_failed" }, 500);
    if (!data) return jsonResponse({ success: false, error: "profile_not_found" }, 404);
    return jsonResponse({ success: true, granted: true, version: PLANIPRET_AI_CONSENT_VERSION, consented_at: now });
  }

  if (action === "revoke") {
    const { data, error } = await auth.admin
      .from("planipret_profiles")
      .update({ ai_consent_revoked_at: now })
      .eq("user_id", auth.userId)
      .select("user_id")
      .maybeSingle();
    if (error) return jsonResponse({ success: false, error: "consent_revoke_failed" }, 500);
    if (!data) return jsonResponse({ success: false, error: "profile_not_found" }, 404);
    return jsonResponse({ success: true, granted: false, revoked_at: now });
  }

  if (action !== "status") return jsonResponse({ success: false, error: "unknown_action" }, 400);
  const { data } = await auth.admin
    .from("planipret_profiles")
    .select("ai_consent_at, ai_consent_version, ai_consent_revoked_at")
    .eq("user_id", auth.userId)
    .maybeSingle();
  const granted = !!data?.ai_consent_at && (!data?.ai_consent_revoked_at || data.ai_consent_revoked_at < data.ai_consent_at);
  return jsonResponse({ success: true, granted, version: data?.ai_consent_version ?? null });
});
