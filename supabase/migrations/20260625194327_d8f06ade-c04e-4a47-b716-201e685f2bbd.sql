
-- calendar_integrations: revoke OAuth tokens
REVOKE SELECT (access_token, refresh_token) ON public.calendar_integrations FROM anon, authenticated;

-- organization_integrations: revoke API key
REVOKE SELECT (api_key) ON public.organization_integrations FROM anon, authenticated;

-- planipret_profiles: revoke OAuth tokens
REVOKE SELECT (ms365_access_token, ms365_refresh_token, ns_jwt, ns_refresh_token, maestro_broker_token) ON public.planipret_profiles FROM anon, authenticated;

-- pbx_extensions: revoke passwords
REVOKE SELECT (password, voicemail_password) ON public.pbx_extensions FROM anon, authenticated;

-- pbx_domain_users: revoke api_key
REVOKE SELECT (api_key) ON public.pbx_domain_users FROM anon, authenticated;

-- pbx_gateways: revoke username and config
REVOKE SELECT (username, config) ON public.pbx_gateways FROM anon, authenticated;

-- pbx_voicemail_settings: revoke pin_hash
REVOKE SELECT (pin_hash) ON public.pbx_voicemail_settings FROM anon, authenticated;

-- agent_platform_webhooks: revoke webhook_secret
REVOKE SELECT (webhook_secret) ON public.agent_platform_webhooks FROM anon, authenticated;

-- webhook_endpoints: revoke secret
REVOKE SELECT (secret) ON public.webhook_endpoints FROM anon, authenticated;
