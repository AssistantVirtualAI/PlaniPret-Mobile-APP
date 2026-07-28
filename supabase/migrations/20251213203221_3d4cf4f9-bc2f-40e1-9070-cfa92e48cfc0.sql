-- Drop and recreate view with SECURITY INVOKER (default, but explicit for clarity)
DROP VIEW IF EXISTS public.organization_integrations_safe;

CREATE VIEW public.organization_integrations_safe 
WITH (security_invoker = true)
AS
SELECT 
  id,
  user_id,
  organization_id,
  platform,
  agent_id,
  additional_config,
  is_active,
  test_status,
  test_error,
  last_tested_at,
  created_at,
  updated_at
FROM public.organization_integrations;

-- Grant SELECT on the safe view to authenticated users
GRANT SELECT ON public.organization_integrations_safe TO authenticated;

-- Add comment explaining purpose
COMMENT ON VIEW public.organization_integrations_safe IS 'Safe view of organization_integrations excluding api_key column. Uses SECURITY INVOKER to respect RLS of querying user.';