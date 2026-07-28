
-- calendar_integrations OAuth tokens
REVOKE SELECT (access_token, refresh_token, token_expires_at) ON public.calendar_integrations FROM authenticated, anon;

-- MCP server auth_config
REVOKE SELECT (auth_config) ON public.agent_mcp_servers FROM authenticated, anon;

-- billing_config Stripe ids
REVOKE SELECT (stripe_customer_id, stripe_subscription_id) ON public.billing_config FROM authenticated, anon;

-- organization_integrations api_key
REVOKE SELECT (api_key) ON public.organization_integrations FROM authenticated, anon;

-- pbx_domain_users api_key
REVOKE SELECT (api_key) ON public.pbx_domain_users FROM authenticated, anon;

-- pbx_extensions passwords
REVOKE SELECT (password, voicemail_password) ON public.pbx_extensions FROM authenticated, anon;

-- planipret_profiles secrets
REVOKE SELECT (sip_password, sip_username, ns_jwt, ns_refresh_token, ms365_access_token, ms365_refresh_token, maestro_broker_token)
  ON public.planipret_profiles FROM authenticated, anon;

-- webhook_endpoints secret
REVOKE SELECT (secret) ON public.webhook_endpoints FROM authenticated, anon;

-- pbx_conferences pins
REVOKE SELECT (pin, moderator_pin) ON public.pbx_conferences FROM authenticated, anon;
