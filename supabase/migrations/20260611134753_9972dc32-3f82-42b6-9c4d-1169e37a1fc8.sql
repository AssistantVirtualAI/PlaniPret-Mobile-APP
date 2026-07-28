-- Restrict sensitive columns from Data API (PostgREST) access
-- These columns remain accessible via service_role (edge functions)

-- 1. agent_platform_webhooks.webhook_secret
REVOKE SELECT (webhook_secret) ON public.agent_platform_webhooks FROM anon, authenticated;

-- 2. lemtel_config.value (secret store)
REVOKE SELECT (value) ON public.lemtel_config FROM anon, authenticated;

-- 3. organizations sensitive billing/PBX columns
REVOKE SELECT (stripe_customer_id, billing_email, fusionpbx_domain_uuid, fusionpbx_domain_name, fusionpbx_server_url)
  ON public.organizations FROM anon, authenticated;

-- 4. billing_config stripe identifiers
REVOKE SELECT (stripe_customer_id, stripe_subscription_id) ON public.billing_config FROM anon, authenticated;

-- 5. pbx_conferences PINs
REVOKE SELECT (pin, moderator_pin) ON public.pbx_conferences FROM anon, authenticated;

-- 6. pbx_extensions voicemail_password and raw_data (may embed SIP credentials)
REVOKE SELECT (voicemail_password, raw_data) ON public.pbx_extensions FROM anon, authenticated;
