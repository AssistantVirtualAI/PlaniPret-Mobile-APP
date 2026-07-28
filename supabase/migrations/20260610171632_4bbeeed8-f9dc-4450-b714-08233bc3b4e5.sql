
-- 1) Column-level lockdown on sensitive credentials (idempotent)
REVOKE SELECT (password, voicemail_password, raw_data) ON public.pbx_extensions FROM anon, authenticated;
REVOKE SELECT (sip_password) ON public.pbx_softphone_users FROM anon, authenticated;

-- Ensure service_role retains access
GRANT SELECT ON public.pbx_extensions TO service_role;
GRANT SELECT ON public.pbx_softphone_users TO service_role;

-- 2) Remove permissive folder-name voicemail storage policies; keep strict join-based policy
DROP POLICY IF EXISTS "auth read own voicemail audio" ON storage.objects;
DROP POLICY IF EXISTS "voicemail_audio_owner_select" ON storage.objects;
