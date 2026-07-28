-- Drop existing SELECT policy and create a more restrictive one
DROP POLICY IF EXISTS "Only admins and creators can view integrations" ON public.organization_integrations;

-- Create new policy: Only org_admin and super_admin can SELECT from base table
-- This protects api_key from being read by regular organization members
CREATE POLICY "Only admins can view integrations"
ON public.organization_integrations
FOR SELECT
USING (
  (organization_id IS NOT NULL AND (
    has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR 
    is_super_admin(auth.uid())
  ))
  OR
  (organization_id IS NULL AND user_id = auth.uid() AND (
    is_super_admin(auth.uid())
  ))
);