-- Drop existing policy
DROP POLICY IF EXISTS "Org admins can manage integrations" ON public.organization_integrations;

-- Create restrictive SELECT policy: only org_admins, super_admins, or the creator can view
CREATE POLICY "Only admins and creators can view integrations"
ON public.organization_integrations
FOR SELECT
USING (
  (user_id = auth.uid()) OR
  ((organization_id IS NOT NULL) AND (
    has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR 
    is_super_admin(auth.uid())
  ))
);

-- Create INSERT policy: org_admins and super_admins can insert
CREATE POLICY "Admins can insert integrations"
ON public.organization_integrations
FOR INSERT
WITH CHECK (
  ((organization_id IS NULL) AND (user_id = auth.uid())) OR
  ((organization_id IS NOT NULL) AND (
    has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR 
    is_super_admin(auth.uid())
  ))
);

-- Create UPDATE policy: org_admins, super_admins, or creator can update
CREATE POLICY "Admins and creators can update integrations"
ON public.organization_integrations
FOR UPDATE
USING (
  (user_id = auth.uid()) OR
  ((organization_id IS NOT NULL) AND (
    has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR 
    is_super_admin(auth.uid())
  ))
);

-- Create DELETE policy: org_admins and super_admins can delete
CREATE POLICY "Admins can delete integrations"
ON public.organization_integrations
FOR DELETE
USING (
  ((organization_id IS NULL) AND (user_id = auth.uid())) OR
  ((organization_id IS NOT NULL) AND (
    has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR 
    is_super_admin(auth.uid())
  ))
);