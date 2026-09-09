-- Restrict plaintext SIP credentials on pbx_softphone_users.
-- Row policies stay as-is (directory features rely on them), but the
-- credential columns are no longer readable by ordinary authenticated users.
REVOKE SELECT (sip_password, wss_url) ON public.pbx_softphone_users FROM authenticated;
REVOKE SELECT (sip_password, wss_url) ON public.pbx_softphone_users FROM anon;
REVOKE UPDATE (sip_password, wss_url) ON public.pbx_softphone_users FROM authenticated;
REVOKE UPDATE (sip_password, wss_url) ON public.pbx_softphone_users FROM anon;

GRANT ALL ON public.pbx_softphone_users TO service_role;

-- Owner-scoped accessor so a user can still retrieve their own SIP credentials.
CREATE OR REPLACE FUNCTION public.get_my_softphone_credentials()
RETURNS TABLE (id uuid, extension text, sip_domain text, sip_password text, wss_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.extension, s.sip_domain, s.sip_password, s.wss_url
    FROM public.pbx_softphone_users s
   WHERE s.portal_user_id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.get_my_softphone_credentials() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_softphone_credentials() TO authenticated;