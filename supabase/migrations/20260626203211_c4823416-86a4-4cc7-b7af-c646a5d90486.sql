
-- Revoke column-level access to sensitive credential fields from authenticated role.
-- Reads should be mediated through edge functions (service_role) only.

REVOKE SELECT (access_token, refresh_token) ON public.calendar_integrations FROM authenticated;
REVOKE UPDATE (access_token, refresh_token) ON public.calendar_integrations FROM authenticated;

REVOKE SELECT (api_key) ON public.organization_integrations FROM authenticated;
REVOKE UPDATE (api_key) ON public.organization_integrations FROM authenticated;

REVOKE SELECT (pin, moderator_pin) ON public.pbx_conferences FROM authenticated;
REVOKE UPDATE (pin, moderator_pin) ON public.pbx_conferences FROM authenticated;

REVOKE SELECT (api_key) ON public.pbx_domain_users FROM authenticated;
REVOKE UPDATE (api_key) ON public.pbx_domain_users FROM authenticated;

REVOKE SELECT (password, voicemail_password) ON public.pbx_extensions FROM authenticated;
REVOKE UPDATE (password, voicemail_password) ON public.pbx_extensions FROM authenticated;

REVOKE SELECT (ms365_access_token, ms365_refresh_token, ns_jwt, ns_refresh_token, maestro_broker_token)
  ON public.planipret_profiles FROM authenticated;
REVOKE UPDATE (ms365_access_token, ms365_refresh_token, ns_jwt, ns_refresh_token, maestro_broker_token)
  ON public.planipret_profiles FROM authenticated;

REVOKE SELECT (pin_hash) ON public.pbx_voicemail_settings FROM authenticated;
REVOKE UPDATE (pin_hash) ON public.pbx_voicemail_settings FROM authenticated;

REVOKE SELECT (secret) ON public.webhook_endpoints FROM authenticated;
REVOKE UPDATE (secret) ON public.webhook_endpoints FROM authenticated;

-- Also revoke from anon (defense in depth)
REVOKE SELECT (access_token, refresh_token) ON public.calendar_integrations FROM anon;
REVOKE SELECT (api_key) ON public.organization_integrations FROM anon;
REVOKE SELECT (pin, moderator_pin) ON public.pbx_conferences FROM anon;
REVOKE SELECT (api_key) ON public.pbx_domain_users FROM anon;
REVOKE SELECT (password, voicemail_password) ON public.pbx_extensions FROM anon;
REVOKE SELECT (ms365_access_token, ms365_refresh_token, ns_jwt, ns_refresh_token, maestro_broker_token)
  ON public.planipret_profiles FROM anon;
REVOKE SELECT (pin_hash) ON public.pbx_voicemail_settings FROM anon;
REVOKE SELECT (secret) ON public.webhook_endpoints FROM anon;

-- Fix org_admin write-without-read inconsistency on organization_integrations
DROP POLICY IF EXISTS "org_admin_select_integrations" ON public.organization_integrations;
CREATE POLICY "org_admin_select_integrations"
  ON public.organization_integrations
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR public.is_super_admin(auth.uid())
  );
