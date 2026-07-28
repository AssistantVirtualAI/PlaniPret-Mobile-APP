
-- 1. REVOKE column-level SELECT on sensitive credential columns
REVOKE SELECT (sip_password) ON public.lemtel_softphone_users FROM authenticated, anon;
REVOKE SELECT (access_token, refresh_token) ON public.calendar_integrations FROM authenticated, anon;
REVOKE SELECT (api_key) ON public.organization_integrations FROM authenticated, anon;
REVOKE SELECT (secret) ON public.webhook_endpoints FROM authenticated, anon;

-- 2. Tighten voicemail-audio INSERT policy: require matching pbx_voicemails row owned by the uploader
DROP POLICY IF EXISTS voicemail_audio_owner_insert ON storage.objects;
CREATE POLICY voicemail_audio_owner_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'voicemail-audio'
  AND (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.pbx_voicemails v
      JOIN public.pbx_softphone_users s
        ON s.organization_id = v.organization_id AND s.extension = v.extension
      WHERE v.audio_storage_path = storage.objects.name
        AND (s.portal_user_id = auth.uid()
             OR public.has_role(auth.uid(), v.organization_id, 'org_admin'::app_role))
    )
  )
);
