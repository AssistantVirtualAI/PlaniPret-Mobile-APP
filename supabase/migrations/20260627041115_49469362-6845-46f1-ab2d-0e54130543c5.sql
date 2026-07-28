
-- billing_config.stripe_customer_id
REVOKE SELECT (stripe_customer_id) ON public.billing_config FROM anon, authenticated;

-- organization_integrations.api_key
REVOKE SELECT (api_key) ON public.organization_integrations FROM anon, authenticated;
REVOKE UPDATE (api_key) ON public.organization_integrations FROM anon, authenticated;

-- pbx_conferences pins
REVOKE SELECT (pin, moderator_pin) ON public.pbx_conferences FROM anon, authenticated;

-- pbx_domain_users.api_key
REVOKE SELECT (api_key) ON public.pbx_domain_users FROM anon, authenticated;

-- pbx_extensions credentials
REVOKE SELECT (password, voicemail_password) ON public.pbx_extensions FROM anon, authenticated;

-- pbx_voicemail_settings.pin_hash
REVOKE SELECT (pin_hash) ON public.pbx_voicemail_settings FROM anon, authenticated;

-- planipret_profiles oauth tokens
REVOKE SELECT (ms365_access_token, ms365_refresh_token, ns_jwt, ns_refresh_token, maestro_broker_token)
  ON public.planipret_profiles FROM anon, authenticated;

-- lemtel_softphone_invites.token
REVOKE SELECT (token) ON public.lemtel_softphone_invites FROM anon, authenticated;

-- webhook_endpoints.secret
REVOKE SELECT (secret) ON public.webhook_endpoints FROM anon, authenticated;
