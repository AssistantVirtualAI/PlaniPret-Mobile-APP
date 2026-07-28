
-- Revoke direct read access to sensitive credential columns from app roles.
-- Backend (service_role) keeps full access; SECURITY DEFINER RPCs and edge
-- functions remain the canonical paths to read these fields.

-- organizations: hide infra + billing identifiers
REVOKE SELECT (api_key, stripe_customer_id, billing_email,
               fusionpbx_server_url, fusionpbx_domain_uuid, fusionpbx_domain_name)
  ON public.organizations FROM authenticated, anon;

-- pbx_extensions: hide SIP + voicemail credentials
REVOKE SELECT (password, voicemail_password)
  ON public.pbx_extensions FROM authenticated, anon;

-- pbx_softphone_users: hide SIP password
REVOKE SELECT (sip_password)
  ON public.pbx_softphone_users FROM authenticated, anon;

-- lemtel_softphone_users: hide SIP password
REVOKE SELECT (sip_password)
  ON public.lemtel_softphone_users FROM authenticated, anon;

-- pbx_voicemail_settings: hide PIN hash
REVOKE SELECT (pin_hash)
  ON public.pbx_voicemail_settings FROM authenticated, anon;

-- agent_platform_webhooks: hide webhook secret
REVOKE SELECT (webhook_secret)
  ON public.agent_platform_webhooks FROM authenticated, anon;

-- organization_integrations: hide platform API key
REVOKE SELECT (api_key)
  ON public.organization_integrations FROM authenticated, anon;

-- webhook_endpoints: hide signing secret
REVOKE SELECT (secret)
  ON public.webhook_endpoints FROM authenticated, anon;
