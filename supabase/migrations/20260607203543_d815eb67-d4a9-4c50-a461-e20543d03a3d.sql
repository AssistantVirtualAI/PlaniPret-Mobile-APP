-- Revoke column-level SELECT on sensitive credential columns from client roles.
-- service_role keeps access (bypasses RLS/column grants).

REVOKE SELECT (webhook_secret) ON public.agent_platform_webhooks FROM authenticated, anon;
REVOKE SELECT (platform_api_key) ON public.agents FROM authenticated, anon;
REVOKE SELECT (access_token, refresh_token) ON public.calendar_integrations FROM authenticated, anon;
REVOKE SELECT (api_key) ON public.organization_integrations FROM authenticated, anon;
REVOKE SELECT (api_key) ON public.organizations FROM authenticated, anon;
REVOKE SELECT (secret) ON public.webhook_endpoints FROM authenticated, anon;
REVOKE SELECT (sip_password) ON public.pbx_softphone_users FROM authenticated, anon;