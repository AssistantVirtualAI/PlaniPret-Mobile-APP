
-- Revoke SELECT on sensitive columns; keep access via edge functions / service_role
REVOKE SELECT (stripe_customer_id, stripe_subscription_id) ON public.billing_config FROM authenticated, anon;
REVOKE SELECT (refresh_token, access_token) ON public.calendar_integrations FROM authenticated, anon;
REVOKE SELECT (sip_password) ON public.lemtel_softphone_users FROM authenticated, anon;
REVOKE SELECT (api_key) ON public.organization_integrations FROM authenticated, anon;
REVOKE SELECT (password, voicemail_password) ON public.pbx_extensions FROM authenticated, anon;
REVOKE SELECT (secret) ON public.webhook_endpoints FROM authenticated, anon;
REVOKE SELECT (pin, moderator_pin) ON public.pbx_conferences FROM authenticated, anon;

-- Tighten agent_insights INSERT: only managers/admins or service_role can insert
DROP POLICY IF EXISTS "Users can insert organization insights" ON public.agent_insights;
CREATE POLICY "Privileged users can insert agent insights"
ON public.agent_insights
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
  OR public.has_role(auth.uid(), organization_id, 'manager'::app_role)
  OR public.is_super_admin(auth.uid())
);
