
-- 1) Column-level REVOKE on pbx_extensions.voicemail_password
REVOKE SELECT (voicemail_password) ON public.pbx_extensions FROM authenticated;
REVOKE SELECT (voicemail_password) ON public.pbx_extensions FROM anon;
GRANT SELECT (voicemail_password) ON public.pbx_extensions TO service_role;

-- 2) Column-level REVOKE on calendar_integrations tokens
REVOKE SELECT (access_token, refresh_token) ON public.calendar_integrations FROM authenticated;
REVOKE SELECT (access_token, refresh_token) ON public.calendar_integrations FROM anon;
GRANT SELECT (access_token, refresh_token) ON public.calendar_integrations TO service_role;

-- 3) Rewrite voicemail-audio storage policy
DROP POLICY IF EXISTS "voicemail_audio_select" ON storage.objects;
DROP POLICY IF EXISTS "Voicemail audio select" ON storage.objects;

CREATE POLICY "voicemail_audio_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'voicemail-audio'
  AND (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.pbx_voicemails v
      JOIN public.pbx_softphone_users s
        ON s.organization_id = v.organization_id
       AND s.extension = v.extension
      WHERE v.audio_storage_path = storage.objects.name
        AND (
          s.portal_user_id = auth.uid()
          OR public.has_role(auth.uid(), v.organization_id, 'org_admin'::app_role)
        )
    )
  )
);

-- 4) Lock down sensitive SECURITY DEFINER functions from anon
REVOKE EXECUTE ON FUNCTION public.admin_link_softphone_by_email(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_organization_for_user(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.run_security_audit(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.verify_tenant_isolation(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reconcile_pbx_call_records(uuid) FROM anon;
