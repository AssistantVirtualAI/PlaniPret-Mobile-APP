-- Revoke client-side SELECT on sensitive credential columns; service role retains full access.
REVOKE SELECT (platform_api_key) ON public.agents FROM anon, authenticated;
REVOKE SELECT (auth_config) ON public.agent_mcp_servers FROM anon, authenticated;
REVOKE SELECT (access_token, refresh_token) ON public.calendar_integrations FROM anon, authenticated;
REVOKE SELECT (api_key) ON public.organization_integrations FROM anon, authenticated;
REVOKE SELECT (secret) ON public.webhook_endpoints FROM anon, authenticated;