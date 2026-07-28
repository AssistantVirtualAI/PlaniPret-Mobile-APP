
DROP POLICY IF EXISTS org_members_select ON public.pbx_domain_users;
CREATE POLICY "org_admins_select" ON public.pbx_domain_users
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS org_members_select ON public.pbx_extensions;
CREATE POLICY "org_admins_select" ON public.pbx_extensions
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR is_super_admin(auth.uid())
  );
