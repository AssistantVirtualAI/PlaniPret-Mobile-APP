
REVOKE SELECT (platform_api_key) ON public.agents FROM anon, authenticated;
REVOKE SELECT (key_hash) ON public.organization_api_keys FROM anon, authenticated;
