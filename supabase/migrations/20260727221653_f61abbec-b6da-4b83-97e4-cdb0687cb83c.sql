ALTER TABLE public.planipret_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "planipret_profiles_select_own" ON public.planipret_profiles;
CREATE POLICY "planipret_profiles_select_own"
  ON public.planipret_profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "planipret_profiles_update_own" ON public.planipret_profiles;
CREATE POLICY "planipret_profiles_update_own"
  ON public.planipret_profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

GRANT SELECT (
  id, user_id, organization_id, role, full_name, email, login_email, phone,
  avatar_url, language, auth_method, extension, ns_extension, ns_domain,
  ns_linked, ns_linked_at, ns_link_method, ns_user_id, ns_mobile_device_id,
  ns_widget_device_id, ns_sip_username, ns_jwt_expires_at, sip_domain,
  sip_username, sip_proxy, mobile_app_enabled, widget_enabled,
  voice_agent_enabled, maestro_connected, maestro_broker_id, maestro_email,
  maestro_telecom_email, maestro_telecom_user_id, maestro_telecom_linked_at,
  maestro_last_sync_at, maestro_oauth_client, maestro_scope,
  maestro_token_expires_at, ms365_email, ms365_display_name, ms365_scopes,
  ms365_token_expiry, dnd_enabled, dnd_auto_schedule, dnd_start_time,
  dnd_end_time, dnd_message_fr, notif_calls, notif_sms, notif_voicemails,
  notif_ai, notif_appointment_reminder, notif_eod_summary, notif_hot_leads,
  notif_missed_call, notif_morning_brief, notif_reminders,
  onboarding_completed, onboarding_step, onboarding_email_sent_at,
  first_login_at, privacy_accepted_at, privacy_version, recording_consent,
  status, ava_autonomy_mode, ava_chat_mode, ava_preferred_lang, ava_voice_id,
  ava_voice_similarity, ava_voice_speed, ava_voice_stability, ava_voice_style,
  ava_last_session_at, ava_learned_preferences, ava_learned_updated_at,
  ava_sessions_count, elevenlabs_agent_id, elevenlabs_agent_status,
  elevenlabs_last_session, elevenlabs_session_count, voicemail_greeting_active,
  voicemail_greeting_audio_url, voicemail_greeting_text,
  voicemail_greeting_updated_at, voicemail_greeting_voice_id,
  last_eod_summary_at, last_morning_brief_at, metadata, created_at, updated_at
) ON public.planipret_profiles TO authenticated;

GRANT ALL ON public.planipret_profiles TO service_role;