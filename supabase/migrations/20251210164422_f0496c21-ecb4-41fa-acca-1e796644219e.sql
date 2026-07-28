-- Drop and recreate the agents_safe view with SECURITY INVOKER
-- This ensures it inherits RLS policies from the underlying agents table
DROP VIEW IF EXISTS public.agents_safe;

CREATE VIEW public.agents_safe
WITH (security_invoker = true)
AS SELECT 
    id,
    organization_id,
    name,
    platform,
    platform_agent_id,
    description,
    avatar_url,
    widget_layout,
    branding_url,
    theme_config,
    config,
    is_external,
    assigned_to,
    client_id,
    created_at,
    updated_at
FROM public.agents;

-- Grant SELECT to authenticated users (RLS from agents table will apply)
GRANT SELECT ON public.agents_safe TO authenticated;

COMMENT ON VIEW public.agents_safe IS 'Safe view of agents table that excludes platform_api_key. Uses SECURITY INVOKER to inherit RLS from agents table.';