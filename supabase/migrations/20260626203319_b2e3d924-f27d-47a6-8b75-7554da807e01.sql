
-- Pattern: revoke table SELECT/UPDATE from authenticated, grant column-level SELECT/UPDATE on non-sensitive columns.

-- calendar_integrations
REVOKE SELECT, UPDATE ON public.calendar_integrations FROM authenticated, anon;
GRANT SELECT (id, organization_id, provider, token_expires_at, calendar_id, is_active, created_at, updated_at) ON public.calendar_integrations TO authenticated;
GRANT UPDATE (calendar_id, is_active, updated_at) ON public.calendar_integrations TO authenticated;

-- organization_integrations
REVOKE SELECT, UPDATE ON public.organization_integrations FROM authenticated, anon;
GRANT SELECT (id, user_id, platform, agent_id, additional_config, is_active, created_at, updated_at, last_tested_at, test_status, test_error, organization_id) ON public.organization_integrations TO authenticated;
GRANT UPDATE (platform, agent_id, additional_config, is_active, updated_at, last_tested_at, test_status, test_error) ON public.organization_integrations TO authenticated;

-- pbx_conferences
REVOKE SELECT, UPDATE ON public.pbx_conferences FROM authenticated, anon;
GRANT SELECT (id, organization_id, pbx_uuid, name, extension, max_members, record, description, enabled, pbx_etag, last_synced_at, created_at, updated_at) ON public.pbx_conferences TO authenticated;
GRANT UPDATE (name, max_members, record, description, enabled, updated_at) ON public.pbx_conferences TO authenticated;

-- pbx_domain_users
REVOKE SELECT, UPDATE ON public.pbx_domain_users FROM authenticated, anon;
GRANT SELECT (id, organization_id, pbx_uuid, domain_uuid, username, email, user_status, user_enabled, groups, last_login_at, sync_status, last_synced_at, raw_data, created_at, updated_at) ON public.pbx_domain_users TO authenticated;
GRANT UPDATE (username, email, user_status, user_enabled, groups, updated_at) ON public.pbx_domain_users TO authenticated;

-- pbx_extensions (long list; exclude password, voicemail_password)
REVOKE SELECT, UPDATE ON public.pbx_extensions FROM authenticated, anon;
GRANT SELECT (id, organization_id, client_id, pbx_uuid, extension, effective_cid_name, effective_cid_number, call_group, voicemail_enabled, call_recording, do_not_disturb, forward_all_destination, enabled, description, raw_data, synced_at, created_at, updated_at, domain_uuid, accountcode, outbound_cid_name, outbound_cid_number, emergency_cid_name, emergency_cid_number, directory_first_name, directory_last_name, directory_visible, directory_exten_visible, limit_max, limit_destination, voicemail_mail_to, voicemail_transcription, voicemail_custom_prompt, voicemail_file, voicemail_keep_local, missed_call_app, missed_call_data, call_timeout, call_screen, hold_music, extension_language, extension_dialect, extension_voice, extension_type, toll_allow, forward_all_enabled, forward_busy_destination, forward_busy_enabled, forward_no_answer_destination, forward_no_answer_enabled, forward_user_not_registered_destination, forward_user_not_registered_enabled, user_record, absolute_codec_string, max_registrations, force_ping, sip_force_contact, sip_force_expires, sip_bypass_media, cidr, auth_acl, assigned_user_ids, device_lines, portal_user_id, org_id, source, last_pbx_seen_at, sync_status, is_demo, last_synced_at, pbx_source) ON public.pbx_extensions TO authenticated;
GRANT UPDATE (effective_cid_name, effective_cid_number, call_group, voicemail_enabled, call_recording, do_not_disturb, forward_all_destination, enabled, description, accountcode, outbound_cid_name, outbound_cid_number, directory_first_name, directory_last_name, directory_visible, voicemail_mail_to, voicemail_transcription, voicemail_custom_prompt, voicemail_keep_local, missed_call_app, missed_call_data, call_timeout, call_screen, hold_music, extension_language, extension_dialect, extension_voice, extension_type, toll_allow, forward_all_enabled, forward_busy_destination, forward_busy_enabled, forward_no_answer_destination, forward_no_answer_enabled, forward_user_not_registered_destination, forward_user_not_registered_enabled, user_record, assigned_user_ids, device_lines, portal_user_id, updated_at) ON public.pbx_extensions TO authenticated;

-- planipret_profiles (exclude ms365_*, ns_jwt, ns_refresh_token, maestro_broker_token)
REVOKE SELECT, UPDATE ON public.planipret_profiles FROM authenticated, anon;
GRANT SELECT (id, user_id, organization_id, full_name, email, phone, extension, ns_domain, ns_user_id, role, mobile_app_enabled, voice_agent_enabled, avatar_url, language, metadata, created_at, updated_at, elevenlabs_agent_id, ns_jwt_expires_at, privacy_accepted_at, privacy_version, recording_consent, dnd_enabled, dnd_start_time, dnd_end_time, dnd_auto_schedule, dnd_message_fr, notif_calls, notif_sms, notif_voicemails, notif_ai, notif_reminders, onboarding_completed, onboarding_step, first_login_at, notif_hot_leads, notif_appointment_reminder, notif_missed_call, notif_morning_brief, notif_eod_summary, last_morning_brief_at, last_eod_summary_at, maestro_broker_id, maestro_token_expires_at, maestro_connected, maestro_last_sync_at, voicemail_greeting_text, voicemail_greeting_voice_id, voicemail_greeting_audio_url, voicemail_greeting_updated_at, voicemail_greeting_active, ava_sessions_count, ava_last_session_at, ava_preferred_lang, ava_autonomy_mode, elevenlabs_session_count, elevenlabs_last_session, elevenlabs_agent_status) ON public.planipret_profiles TO authenticated;
GRANT UPDATE (full_name, phone, avatar_url, language, metadata, mobile_app_enabled, voice_agent_enabled, recording_consent, dnd_enabled, dnd_start_time, dnd_end_time, dnd_auto_schedule, dnd_message_fr, notif_calls, notif_sms, notif_voicemails, notif_ai, notif_reminders, onboarding_completed, onboarding_step, notif_hot_leads, notif_appointment_reminder, notif_missed_call, notif_morning_brief, notif_eod_summary, voicemail_greeting_text, voicemail_greeting_voice_id, voicemail_greeting_audio_url, voicemail_greeting_active, ava_preferred_lang, ava_autonomy_mode, updated_at) ON public.planipret_profiles TO authenticated;

-- pbx_voicemail_settings (exclude pin_hash)
REVOKE SELECT, UPDATE ON public.pbx_voicemail_settings FROM authenticated, anon;
GRANT SELECT (user_id, greeting_type, greeting_storage_path, greeting_tts_text, transcription_enabled, notify_email, notify_sms, notify_push, attach_audio_email, notify_email_address, notify_sms_number, updated_at, greeting_voice_id, greeting_voice_name, ai_summary_enabled, greeting_audio_url, greeting_updated_at, organization_id) ON public.pbx_voicemail_settings TO authenticated;
GRANT UPDATE (greeting_type, greeting_storage_path, greeting_tts_text, transcription_enabled, notify_email, notify_sms, notify_push, attach_audio_email, notify_email_address, notify_sms_number, updated_at, greeting_voice_id, greeting_voice_name, ai_summary_enabled, greeting_audio_url, greeting_updated_at) ON public.pbx_voicemail_settings TO authenticated;

-- webhook_endpoints (exclude secret)
REVOKE SELECT, UPDATE ON public.webhook_endpoints FROM authenticated, anon;
GRANT SELECT (id, organization_id, url, events, is_active, created_at, updated_at) ON public.webhook_endpoints TO authenticated;
GRANT UPDATE (url, events, is_active, updated_at) ON public.webhook_endpoints TO authenticated;

-- billing_config (exclude stripe_customer_id, stripe_subscription_id)
REVOKE SELECT, UPDATE ON public.billing_config FROM authenticated, anon;
GRANT SELECT (organization_id, plan_tier, credits_limit, credits_used, ai_credits, created_at, updated_at, subscription_status, subscription_ends_at, trial_ends_at, performance_billing_enabled, price_per_appointment, price_per_qualified_lead, price_per_converted_lead) ON public.billing_config TO authenticated;

-- agent_mcp_servers (exclude auth_config)
REVOKE SELECT, UPDATE ON public.agent_mcp_servers FROM authenticated, anon;
GRANT SELECT (id, agent_id, organization_id, name, description, server_url, server_type, auth_type, tools_enabled, is_active, last_connected_at, created_at, updated_at) ON public.agent_mcp_servers TO authenticated;
GRANT UPDATE (name, description, server_url, server_type, auth_type, tools_enabled, is_active, updated_at) ON public.agent_mcp_servers TO authenticated;
