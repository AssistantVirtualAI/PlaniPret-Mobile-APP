-- Drop and recreate the view with SECURITY INVOKER to use querying user's permissions
DROP VIEW IF EXISTS public.agents_safe;

CREATE VIEW public.agents_safe 
WITH (security_invoker = true) AS
SELECT 
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

-- Grant SELECT on the safe view to authenticated users
GRANT SELECT ON public.agents_safe TO authenticated;

COMMENT ON VIEW public.agents_safe IS 'Secure view of agents table that excludes sensitive platform_api_key column. Uses SECURITY INVOKER to enforce RLS of querying user.';