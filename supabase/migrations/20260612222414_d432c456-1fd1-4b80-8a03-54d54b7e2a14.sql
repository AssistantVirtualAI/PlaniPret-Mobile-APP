-- Revoke client-side SELECT on sensitive credential columns. Service role still has access.
REVOKE SELECT (access_token, refresh_token) ON public.calendar_integrations FROM anon, authenticated;
REVOKE SELECT (sip_password) ON public.lemtel_softphone_users FROM anon, authenticated;
REVOKE SELECT (api_key) ON public.organization_integrations FROM anon, authenticated;
REVOKE SELECT (sip_password) ON public.pbx_softphone_users FROM anon, authenticated;
REVOKE SELECT (secret) ON public.webhook_endpoints FROM anon, authenticated;