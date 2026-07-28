
-- 1) Column-level REVOKE on sensitive columns
REVOKE SELECT (sip_password), UPDATE (sip_password) ON public.lemtel_softphone_users FROM anon, authenticated;
REVOKE SELECT (api_key), UPDATE (api_key) ON public.organization_integrations FROM anon, authenticated;
REVOKE SELECT (webhook_secret), UPDATE (webhook_secret) ON public.agent_platform_webhooks FROM anon, authenticated;
REVOKE SELECT (secret), UPDATE (secret) ON public.webhook_endpoints FROM anon, authenticated;

-- 2) Restrict realtime publication
-- Drop sensitive tables from publication, then re-add lemtel_softphone_users with a column list (excluding sip_password)
ALTER PUBLICATION supabase_realtime DROP TABLE public.lemtel_softphone_users;
ALTER PUBLICATION supabase_realtime DROP TABLE public.lemtel_cdrs_cache;

ALTER PUBLICATION supabase_realtime ADD TABLE public.lemtel_softphone_users
  (id, customer_id, portal_user_id, extension, sip_domain, display_name, status, device_type, last_seen, created_at, updated_at);
