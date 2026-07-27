DO $$
DECLARE
  safe_select_cols text;
  writable_cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO safe_select_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'planipret_profiles'
    AND column_name NOT IN (
      'ms365_access_token',
      'ms365_refresh_token',
      'ns_jwt',
      'ns_refresh_token',
      'sip_password',
      'ns_sip_password_ref',
      'ns_sip_password_ref_mobile',
      'maestro_broker_token',
      'maestro_refresh_token'
    );

  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO writable_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'planipret_profiles'
    AND column_name IN (
      'full_name',
      'phone',
      'avatar_url',
      'language',
      'privacy_accepted_at',
      'privacy_version',
      'recording_consent',
      'dnd_enabled',
      'dnd_start_time',
      'dnd_end_time',
      'dnd_auto_schedule',
      'dnd_message_fr',
      'notif_calls',
      'notif_sms',
      'notif_voicemails',
      'notif_ai',
      'notif_reminders',
      'notif_hot_leads',
      'notif_appointment_reminder',
      'notif_missed_call',
      'notif_morning_brief',
      'notif_eod_summary',
      'onboarding_completed',
      'onboarding_step',
      'first_login_at',
      'voicemail_greeting_text',
      'voicemail_greeting_voice_id',
      'voicemail_greeting_audio_url',
      'voicemail_greeting_updated_at',
      'voicemail_greeting_active',
      'ava_preferred_lang',
      'ava_autonomy_mode',
      'status',
      'ava_voice_id',
      'ava_voice_stability',
      'ava_voice_similarity',
      'ava_voice_style',
      'ava_voice_speed',
      'ava_chat_mode',
      'updated_at'
    );

  IF safe_select_cols IS NULL THEN
    RAISE EXCEPTION 'No safe columns found for planipret_profiles';
  END IF;

  EXECUTE format('GRANT SELECT (%s) ON public.planipret_profiles TO authenticated', safe_select_cols);

  IF writable_cols IS NOT NULL THEN
    EXECUTE format('GRANT UPDATE (%s) ON public.planipret_profiles TO authenticated', writable_cols);
  END IF;
END $$;

GRANT ALL ON public.planipret_profiles TO service_role;

ALTER TABLE public.planipret_profiles ENABLE ROW LEVEL SECURITY;