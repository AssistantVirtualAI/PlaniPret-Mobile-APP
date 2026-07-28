
REVOKE SELECT (webhook_secret) ON public.agent_platform_webhooks FROM authenticated, anon;
REVOKE SELECT (access_token, refresh_token) ON public.calendar_integrations FROM authenticated, anon;
REVOKE SELECT (sip_password) ON public.lemtel_softphone_users FROM authenticated, anon;
REVOKE SELECT (api_key) ON public.organization_integrations FROM authenticated, anon;
REVOKE SELECT (api_key, stripe_customer_id, billing_email, fusionpbx_server_url, fusionpbx_domain_name, fusionpbx_domain_uuid, backend_domain) ON public.organizations FROM authenticated, anon;
REVOKE SELECT (pin, moderator_pin) ON public.pbx_conferences FROM authenticated, anon;
REVOKE SELECT (api_key) ON public.pbx_domain_users FROM authenticated, anon;
REVOKE SELECT (password, voicemail_password) ON public.pbx_extensions FROM authenticated, anon;
REVOKE SELECT (sip_password) ON public.pbx_softphone_users FROM authenticated, anon;
REVOKE SELECT (secret) ON public.webhook_endpoints FROM authenticated, anon;
REVOKE SELECT (pin_hash) ON public.pbx_voicemail_settings FROM authenticated, anon;
REVOKE SELECT (sip_password) ON public.pbx_app_provision_queue FROM authenticated, anon;
