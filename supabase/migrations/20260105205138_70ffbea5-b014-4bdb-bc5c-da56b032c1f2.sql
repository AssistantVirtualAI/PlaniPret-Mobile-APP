-- Fix calendar_integrations: Restrict OAuth token access to admins only

-- Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Users can view organization calendar integrations" ON public.calendar_integrations;

-- Create restricted SELECT policy - only admins can view calendar integrations (including tokens)
CREATE POLICY "Only admins can view calendar integrations"
ON public.calendar_integrations FOR SELECT
USING (
  has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR 
  has_role(auth.uid(), organization_id, 'manager'::app_role) OR 
  is_super_admin(auth.uid())
);

-- Create a safe view without sensitive token data for non-admin use cases
CREATE OR REPLACE VIEW public.calendar_integrations_safe 
WITH (security_invoker = true) AS
SELECT 
  id, 
  organization_id, 
  provider, 
  calendar_id,
  is_active, 
  created_at, 
  updated_at,
  token_expires_at,
  (token_expires_at > now()) as is_token_valid
FROM public.calendar_integrations;

-- Grant SELECT on the safe view to authenticated users
GRANT SELECT ON public.calendar_integrations_safe TO authenticated;

-- Add comment explaining the view purpose
COMMENT ON VIEW public.calendar_integrations_safe IS 'Safe view of calendar integrations without exposing OAuth tokens. Use this for client-side queries.';