-- Create a safe view for organization_integrations that excludes api_key
-- This prevents API keys from being exposed to clients while maintaining functionality

CREATE OR REPLACE VIEW public.organization_integrations_safe AS
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
COMMENT ON VIEW public.organization_integrations_safe IS 'Safe view of organization_integrations excluding api_key column. Use this for client-side reads.';