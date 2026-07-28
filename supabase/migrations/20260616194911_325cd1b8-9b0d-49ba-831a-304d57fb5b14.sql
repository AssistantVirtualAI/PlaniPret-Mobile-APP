-- Revoke column-level SELECT on sensitive credential/identifier columns from authenticated role.
REVOKE SELECT (stripe_customer_id) ON public.billing_config FROM authenticated;
REVOKE SELECT (stripe_subscription_id) ON public.billing_config FROM authenticated;
REVOKE SELECT (key_hash) ON public.organization_api_keys FROM authenticated;
REVOKE SELECT (auth_config) ON public.agent_mcp_servers FROM authenticated;