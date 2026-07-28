
-- Column-level REVOKE on sensitive columns for authenticated role
REVOKE SELECT (webhook_secret) ON public.agent_platform_webhooks FROM authenticated, anon;
REVOKE SELECT (platform_api_key) ON public.agents FROM authenticated, anon;
REVOKE SELECT (access_token, refresh_token) ON public.calendar_integrations FROM authenticated, anon;
REVOKE SELECT (api_key) ON public.organization_integrations FROM authenticated, anon;
REVOKE SELECT (password, voicemail_password) ON public.pbx_extensions FROM authenticated, anon;
REVOKE SELECT (secret) ON public.webhook_endpoints FROM authenticated, anon;

-- Storage: tighten SELECT on chat-attachments to owner folder
DROP POLICY IF EXISTS "auth read chat attach" ON storage.objects;
CREATE POLICY "auth read own chat attach"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Storage: tighten SELECT on voicemail-audio to owner folder
DROP POLICY IF EXISTS "auth read voicemail audio" ON storage.objects;
CREATE POLICY "auth read own voicemail audio"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'voicemail-audio'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
