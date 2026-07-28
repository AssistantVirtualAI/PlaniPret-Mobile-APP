
-- Defense-in-depth column REVOKEs for sensitive columns
REVOKE SELECT (webhook_secret), UPDATE (webhook_secret) ON public.agent_platform_webhooks FROM anon, authenticated;

REVOKE SELECT (password_hash, password_reset_token), UPDATE (password_hash, password_reset_token) ON public.client_credentials FROM anon, authenticated;
REVOKE SELECT (password_hash, password_reset_token), UPDATE (password_hash, password_reset_token) ON public.client_member_credentials FROM anon, authenticated;

REVOKE SELECT (api_key), UPDATE (api_key) ON public.organizations FROM anon, authenticated;
