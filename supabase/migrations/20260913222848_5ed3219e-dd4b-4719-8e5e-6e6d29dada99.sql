-- 1) Remove column-level read access to secrets for app roles
REVOKE SELECT (platform_api_key) ON public.agents FROM anon, authenticated;
REVOKE UPDATE (platform_api_key) ON public.agents FROM anon, authenticated;
REVOKE SELECT (api_key) ON public.organizations FROM anon, authenticated;
REVOKE UPDATE (api_key) ON public.organizations FROM anon, authenticated;
REVOKE SELECT (sip_password) ON public.pbx_softphone_users FROM anon, authenticated;
REVOKE UPDATE (sip_password) ON public.pbx_softphone_users FROM anon, authenticated;

GRANT ALL ON public.agents TO service_role;
GRANT ALL ON public.organizations TO service_role;
GRANT ALL ON public.pbx_softphone_users TO service_role;

-- 2) agents_safe: keep existing shape, add a non-sensitive flag
DROP VIEW IF EXISTS public.agents_safe;
CREATE VIEW public.agents_safe
WITH (security_invoker = true) AS
SELECT id, organization_id, name, platform, platform_agent_id, description, avatar_url,
       widget_layout, branding_url, theme_config, config, is_external, assigned_to,
       client_id, slug, twilio_number, created_at, updated_at,
       (platform_api_key IS NOT NULL AND platform_api_key <> '') AS has_api_key
FROM public.agents;
GRANT SELECT ON public.agents_safe TO authenticated, anon;

-- 3) organizations_safe: every column except api_key
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
    INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name <> 'api_key';

  EXECUTE format(
    'CREATE OR REPLACE VIEW public.organizations_safe WITH (security_invoker = true) AS SELECT %s FROM public.organizations',
    cols
  );
END $$;
GRANT SELECT ON public.organizations_safe TO authenticated;

-- 4) Fix mutable search_path
ALTER FUNCTION public.pp_norm_name(text) SET search_path = public;