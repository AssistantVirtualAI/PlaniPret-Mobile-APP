
-- 1) Revoke column-level SELECT on sensitive credentials columns
REVOKE SELECT (platform_api_key) ON public.agents FROM anon, authenticated;
REVOKE SELECT (access_token, refresh_token) ON public.calendar_integrations FROM anon, authenticated;
REVOKE SELECT (api_key) ON public.organization_integrations FROM anon, authenticated;

-- 2) Tighten lemtel-ivr-audio storage read policy: lemtel admins only
DROP POLICY IF EXISTS "lemtel members read ivr audio" ON storage.objects;
CREATE POLICY "lemtel admins read ivr audio"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'lemtel-ivr-audio'
  AND public.is_lemtel_admin(auth.uid())
);
