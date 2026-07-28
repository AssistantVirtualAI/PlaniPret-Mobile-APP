
REVOKE SELECT (auth_config) ON public.agent_mcp_servers FROM anon, authenticated;
REVOKE SELECT (webhook_secret) ON public.agent_platform_webhooks FROM anon, authenticated;
REVOKE SELECT (platform_api_key) ON public.agents FROM anon, authenticated;
REVOKE SELECT (username, realm, proxy, from_user, from_domain) ON public.pbx_gateways FROM anon, authenticated;
REVOKE SELECT (pin_hash) ON public.pbx_voicemail_settings FROM anon, authenticated;
