-- Column-level revokes: keep these credentials out of the Data API for authenticated/anon
REVOKE SELECT (webhook_secret) ON public.agent_platform_webhooks FROM authenticated, anon;
REVOKE SELECT (platform_api_key) ON public.agents FROM authenticated, anon;
REVOKE SELECT (access_token, refresh_token) ON public.calendar_integrations FROM authenticated, anon;
REVOKE SELECT (sip_password) ON public.lemtel_softphone_users FROM authenticated, anon;
REVOKE SELECT (api_key) ON public.organization_integrations FROM authenticated, anon;
REVOKE SELECT (sip_password) ON public.pbx_softphone_users FROM authenticated, anon;
REVOKE SELECT (secret) ON public.webhook_endpoints FROM authenticated, anon;

-- service_role keeps full column-level access for edge functions
GRANT SELECT (webhook_secret) ON public.agent_platform_webhooks TO service_role;
GRANT SELECT (platform_api_key) ON public.agents TO service_role;
GRANT SELECT (access_token, refresh_token) ON public.calendar_integrations TO service_role;
GRANT SELECT (sip_password) ON public.lemtel_softphone_users TO service_role;
GRANT SELECT (api_key) ON public.organization_integrations TO service_role;
GRANT SELECT (sip_password) ON public.pbx_softphone_users TO service_role;
GRANT SELECT (secret) ON public.webhook_endpoints TO service_role;

-- Tighten pbx_call_records SELECT to managers/org_admins (caller PII)
DROP POLICY IF EXISTS org_members_select ON public.pbx_call_records;
CREATE POLICY "Managers and admins can view call records"
  ON public.pbx_call_records
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR public.has_role(auth.uid(), organization_id, 'manager'::app_role)
    OR public.is_super_admin(auth.uid())
  );
