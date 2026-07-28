
-- 1. Fix mutable search_path
ALTER FUNCTION public.tg_lemtel_invites_touch() SET search_path = public;

-- 2. Column-level REVOKEs on sensitive credential columns
REVOKE SELECT (access_token, refresh_token) ON public.calendar_integrations FROM authenticated, anon;
REVOKE SELECT (api_key) ON public.organization_integrations FROM authenticated, anon;
REVOKE SELECT (pin, moderator_pin) ON public.pbx_conferences FROM authenticated, anon;
REVOKE SELECT (password, voicemail_password) ON public.pbx_extensions FROM authenticated, anon;
REVOKE SELECT (ms365_access_token, ms365_refresh_token, ns_jwt, ns_refresh_token, maestro_broker_token) ON public.planipret_profiles FROM authenticated, anon;
REVOKE SELECT (secret) ON public.webhook_endpoints FROM authenticated, anon;
REVOKE SELECT (stripe_customer_id, stripe_subscription_id) ON public.billing_config FROM authenticated, anon;
REVOKE SELECT (api_key) ON public.pbx_domain_users FROM authenticated, anon;
REVOKE SELECT (config) ON public.pbx_gateways FROM authenticated, anon;
REVOKE SELECT (pin_hash) ON public.pbx_voicemail_settings FROM authenticated, anon;
