DROP POLICY IF EXISTS "Managers and admins can view billing config" ON public.billing_config;
CREATE POLICY "Org admins can view billing config"
ON public.billing_config
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), organization_id, 'org_admin'::app_role)
  OR is_super_admin(auth.uid())
);