
-- Revoke client read access on sensitive columns; service_role keeps GRANT ALL.

REVOKE SELECT (auth_config) ON public.agent_mcp_servers FROM authenticated, anon;
REVOKE SELECT (webhook_secret) ON public.agent_platform_webhooks FROM authenticated, anon;
REVOKE SELECT (pin) ON public.number_porting_requests FROM authenticated, anon;
REVOKE SELECT (api_key, additional_config) ON public.organization_integrations FROM authenticated, anon;
REVOKE SELECT (pin, moderator_pin) ON public.pbx_conferences FROM authenticated, anon;
REVOKE SELECT (api_key) ON public.pbx_domain_users FROM authenticated, anon;
REVOKE SELECT (password, voicemail_password) ON public.pbx_extensions FROM authenticated, anon;
REVOKE SELECT (config) ON public.pbx_gateways FROM authenticated, anon;
REVOKE SELECT (sip_password) ON public.pbx_softphone_users FROM authenticated, anon;
REVOKE SELECT (pin_hash) ON public.pbx_voicemail_settings FROM authenticated, anon;
REVOKE SELECT (ms365_access_token, ms365_refresh_token, ns_jwt, ns_refresh_token)
  ON public.planipret_profiles FROM authenticated, anon;
REVOKE SELECT (secret) ON public.webhook_endpoints FROM authenticated, anon;

-- Re-affirm full access for service_role (edge functions)
GRANT ALL ON public.agent_mcp_servers,
             public.agent_platform_webhooks,
             public.number_porting_requests,
             public.organization_integrations,
             public.pbx_conferences,
             public.pbx_domain_users,
             public.pbx_extensions,
             public.pbx_gateways,
             public.pbx_softphone_users,
             public.pbx_voicemail_settings,
             public.planipret_profiles,
             public.webhook_endpoints
  TO service_role;
