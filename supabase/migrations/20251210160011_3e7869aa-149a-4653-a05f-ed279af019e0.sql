-- Create a secure view that excludes platform_api_key for non-admin queries
CREATE OR REPLACE VIEW public.agents_safe AS
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

-- Add comment explaining the view's purpose
COMMENT ON VIEW public.agents_safe IS 'Secure view of agents table that excludes sensitive platform_api_key column. Use this for frontend queries where API keys are not needed.';