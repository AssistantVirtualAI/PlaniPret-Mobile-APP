
-- Column-level REVOKEs for sensitive columns
REVOKE SELECT (stripe_customer_id, stripe_subscription_id) ON public.billing_config FROM authenticated, anon;
REVOKE SELECT (access_token, refresh_token) ON public.calendar_integrations FROM authenticated, anon;
REVOKE SELECT (api_key) ON public.organization_integrations FROM authenticated, anon;
REVOKE SELECT (pin, moderator_pin) ON public.pbx_conferences FROM authenticated, anon;
REVOKE SELECT (api_key) ON public.pbx_domain_users FROM authenticated, anon;
REVOKE SELECT (password, voicemail_password) ON public.pbx_extensions FROM authenticated, anon;
REVOKE SELECT (username, from_user, from_domain, realm, config) ON public.pbx_gateways FROM authenticated, anon;
REVOKE SELECT (config) ON public.pbx_integrations FROM authenticated, anon;
REVOKE SELECT (pin_hash) ON public.pbx_voicemail_settings FROM authenticated, anon;
REVOKE SELECT (ms365_access_token, ms365_refresh_token, ns_jwt, ns_refresh_token, maestro_broker_token, maestro_broker_id) ON public.planipret_profiles FROM authenticated, anon;
REVOKE SELECT (secret) ON public.webhook_endpoints FROM authenticated, anon;

-- Fix security_access_violations INSERT policy (was WITH CHECK false)
DROP POLICY IF EXISTS "service inserts violations" ON public.security_access_violations;
CREATE POLICY "service inserts violations" ON public.security_access_violations
  FOR INSERT TO service_role WITH CHECK (true);
