
-- Revoke sensitive columns from authenticated/anon so only service_role can read them.
-- Edge functions (service_role) continue to access these values; UI must use safe views/RPCs.

REVOKE SELECT (sip_password) ON public.lemtel_softphone_users FROM anon, authenticated;
REVOKE SELECT (sip_password) ON public.pbx_app_provision_queue FROM anon, authenticated;
REVOKE SELECT (api_key, additional_config) ON public.organization_integrations FROM anon, authenticated;
REVOKE SELECT (pin, moderator_pin) ON public.pbx_conferences FROM anon, authenticated;
REVOKE SELECT (password, voicemail_password) ON public.pbx_extensions FROM anon, authenticated;
REVOKE SELECT (api_key) ON public.pbx_domain_users FROM anon, authenticated;
REVOKE SELECT (webhook_secret) ON public.agent_platform_webhooks FROM anon, authenticated;
REVOKE SELECT (secret) ON public.webhook_endpoints FROM anon, authenticated;

-- Tighten organization_integrations SELECT to require active org membership in addition to ownership.
DROP POLICY IF EXISTS "Admins can view organization integrations" ON public.organization_integrations;
CREATE POLICY "Members view their org integrations"
ON public.organization_integrations
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  AND (
    organization_id IS NULL
    OR organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
  )
);
