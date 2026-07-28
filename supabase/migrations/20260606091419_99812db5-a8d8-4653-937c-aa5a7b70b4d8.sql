
-- 1. Column-level REVOKE on credential columns (prevents SELECT even when RLS permits the row)
REVOKE SELECT (webhook_secret) ON public.agent_platform_webhooks FROM authenticated, anon;
REVOKE SELECT (platform_api_key) ON public.agents FROM authenticated, anon;
REVOKE SELECT (secret) ON public.webhook_endpoints FROM authenticated, anon;
REVOKE SELECT (api_key) ON public.organization_integrations FROM authenticated, anon;
REVOKE SELECT (sip_password) ON public.lemtel_softphone_users FROM authenticated, anon;

-- Re-grant SELECT on all non-sensitive columns so existing reads still work
GRANT SELECT (id, agent_id, organization_id, platform, webhook_url, events, is_active, last_triggered_at, error_count, created_at, updated_at)
  ON public.agent_platform_webhooks TO authenticated;

GRANT SELECT (id, organization_id, name, platform, is_external, assigned_to, config, created_at, updated_at, client_id, platform_agent_id, avatar_url, widget_layout, description, branding_url, theme_config, slug, twilio_number)
  ON public.agents TO authenticated;

-- 2. Drop overly broad SELECT policy on organization_integrations
DROP POLICY IF EXISTS "Org members can view organization integrations" ON public.organization_integrations;

-- 3. Remove sensitive tables from realtime publication
ALTER PUBLICATION supabase_realtime DROP TABLE public.lemtel_softphone_users;
ALTER PUBLICATION supabase_realtime DROP TABLE public.lemtel_sms_threads;
