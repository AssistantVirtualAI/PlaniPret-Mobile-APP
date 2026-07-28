-- Column-level REVOKEs for sensitive credential columns
REVOKE SELECT (webhook_secret) ON public.agent_platform_webhooks FROM authenticated, anon;
REVOKE SELECT (access_token, refresh_token) ON public.calendar_integrations FROM authenticated, anon;
REVOKE SELECT (api_key) ON public.organization_integrations FROM authenticated, anon;
REVOKE SELECT (sip_password) ON public.pbx_app_provision_queue FROM authenticated, anon;
REVOKE SELECT (pin, moderator_pin) ON public.pbx_conferences FROM authenticated, anon;
REVOKE SELECT (api_key) ON public.pbx_domain_users FROM authenticated, anon;
REVOKE SELECT (password, voicemail_password) ON public.pbx_extensions FROM authenticated, anon;
REVOKE SELECT (secret) ON public.webhook_endpoints FROM authenticated, anon;
REVOKE SELECT (sip_password) ON public.pbx_softphone_users FROM authenticated, anon;
REVOKE SELECT (sip_password) ON public.lemtel_softphone_users FROM authenticated, anon;

-- two_factor_otps: service_role only (defense in depth)
REVOKE ALL ON public.two_factor_otps FROM authenticated, anon, PUBLIC;
GRANT ALL ON public.two_factor_otps TO service_role;

-- Fix cc_agent_activity: scope to caller's organizations
DROP POLICY IF EXISTS "org_cc_agent_activity_read" ON public.cc_agent_activity;
CREATE POLICY "org_cc_agent_activity_read" ON public.cc_agent_activity
  FOR SELECT TO authenticated
  USING (
    organization_id IN (SELECT public.current_user_org_ids())
    AND (
      public.is_super_admin(auth.uid())
      OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
      OR public.has_role(auth.uid(), organization_id, 'manager'::app_role)
      OR public.is_cc_supervisor(auth.uid())
    )
  );

-- Ensure pbx_gateways RLS is enabled (default-deny writes when no write policy exists)
ALTER TABLE public.pbx_gateways ENABLE ROW LEVEL SECURITY;