-- Fix overly-restrictive SELECT policy that prevents users from seeing their own integrations
-- (and can also break INSERT ... returning in some clients)

DROP POLICY IF EXISTS "Only admins can view integrations" ON public.organization_integrations;

CREATE POLICY "Users can view their own integrations"
ON public.organization_integrations
FOR SELECT
USING (
  (user_id = auth.uid())
  OR (
    organization_id IS NOT NULL
    AND (
      has_role(auth.uid(), organization_id, 'org_admin'::app_role)
      OR has_role(auth.uid(), organization_id, 'manager'::app_role)
      OR is_super_admin(auth.uid())
    )
  )
);
