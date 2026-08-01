import { corsHeaders, jsonResponse, requireUser } from "../_shared/auth.ts";
import { linkBrokerIdByEmail } from "../_shared/maestro-broker-directory.ts";

const SAFE_PROFILE_COLUMNS = "id, user_id, organization_id, full_name, email, phone, extension, ns_domain, ns_user_id, role, mobile_app_enabled, voice_agent_enabled, avatar_url, language, metadata, created_at, updated_at, elevenlabs_agent_id, ns_jwt_expires_at, privacy_accepted_at, privacy_version, recording_consent, dnd_enabled, dnd_start_time, dnd_end_time, dnd_auto_schedule, dnd_message_fr, notif_calls, notif_sms, notif_voicemails, notif_ai, notif_reminders, onboarding_completed, onboarding_step, first_login_at, notif_hot_leads, notif_appointment_reminder, notif_missed_call, notif_morning_brief, notif_eod_summary, last_morning_brief_at, last_eod_summary_at, maestro_broker_id, maestro_token_expires_at, maestro_connected, maestro_last_sync_at, voicemail_greeting_text, voicemail_greeting_voice_id, voicemail_greeting_audio_url, voicemail_greeting_updated_at, voicemail_greeting_active, ava_sessions_count, ava_last_session_at, ava_preferred_lang, ava_autonomy_mode, elevenlabs_session_count, elevenlabs_last_session, elevenlabs_agent_status, widget_enabled, status, ms365_token_expiry, ms365_email, ms365_display_name, ns_extension, ns_sip_username, ns_linked, ns_linked_at, sip_username, sip_domain, sip_proxy, ns_link_method, auth_method, login_email, onboarding_email_sent_at, ava_learned_preferences, ava_learned_updated_at, ms365_scopes, ns_mobile_device_id, ns_widget_device_id, ava_voice_id, ava_voice_stability, ava_voice_similarity, ava_voice_style, ava_voice_speed, ava_chat_mode, maestro_telecom_user_id, maestro_telecom_email, maestro_telecom_linked_at, maestro_scope, maestro_email, maestro_oauth_client";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") return jsonResponse(405, { error: "Method not allowed" });

  const rawAuth = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  console.log("[pp-mobile-profile] incoming", { method: req.method, hasAuth: !!rawAuth, authLen: rawAuth.length });

  const auth = await requireUser(req);
  if ("error" in auth) {
    console.warn("[pp-mobile-profile] unauthorized — token rejected");
    return auth.error;
  }
  console.log("[pp-mobile-profile] user", auth.user.id);

  const userId = auth.user.id;
  const email = auth.user.email?.trim().toLowerCase() ?? null;
  const admin = auth.supabase;

  const loadByUser = async () => {
    return await admin
      .from("planipret_profiles")
      .select(SAFE_PROFILE_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();
  };

  let { data: profile, error } = await loadByUser();
  if (error) return jsonResponse(500, { error: error.message, code: error.code ?? null });

  let linked = false;
  if (!profile && email) {
    const { data: candidates, error: candidateError } = await admin
      .from("planipret_profiles")
      .select("id")
      .is("user_id", null)
      .or(`email.eq.${email},login_email.eq.${email},ms365_email.eq.${email},maestro_email.eq.${email}`)
      .limit(2);

    if (candidateError) return jsonResponse(500, { error: candidateError.message, code: candidateError.code ?? null });

    if ((candidates?.length ?? 0) === 1) {
      const profileId = candidates?.[0]?.id;
      if (profileId) {
        const { error: linkError } = await admin
          .from("planipret_profiles")
          .update({ user_id: userId, updated_at: new Date().toISOString() })
          .eq("id", profileId)
          .is("user_id", null);

        if (linkError) return jsonResponse(500, { error: linkError.message, code: linkError.code ?? null });
        linked = true;
        const loaded = await loadByUser();
        profile = loaded.data;
        error = loaded.error;
        if (error) return jsonResponse(500, { error: error.message, code: error.code ?? null });
      }
    }
  }

  if (!profile) {
    console.warn("[pp-mobile-profile] missing_profile for", userId, email);
    return jsonResponse(404, { error: "missing_profile" });
  }

  // Auto-link the Maestro broker id from the directory using the sign-in email.
  // Runs on every app boot until linked, so email/password sign-in gets the
  // same Maestro binding as Microsoft sign-in.
  let maestro_linked: string | null = null;
  const p: any = profile;
  if (!p.maestro_broker_id) {
    try {
      const res = await linkBrokerIdByEmail(admin, {
        id: p.id,
        email: p.email ?? email,
        ms365_email: p.ms365_email,
        extension: p.extension,
        phone: p.phone,
        maestro_broker_id: p.maestro_broker_id,
      });
      if (res.ok && res.maestro_broker_id) {
        maestro_linked = res.maestro_broker_id;
        p.maestro_broker_id = res.maestro_broker_id;
        console.log("[pp-mobile-profile] maestro linked", { email: p.email, id: res.maestro_broker_id, by: res.matched_by });
      }
    } catch (e) {
      console.warn("[pp-mobile-profile] maestro link failed", String(e));
    }
  }

  return jsonResponse(200, { profile, linked, maestro_linked });
});