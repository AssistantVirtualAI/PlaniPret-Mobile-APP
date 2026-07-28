
-- 1) Revoke column access on agent_platform_webhooks.webhook_secret
REVOKE SELECT (webhook_secret) ON public.agent_platform_webhooks FROM authenticated, anon;
GRANT SELECT (id, agent_id, organization_id, platform, webhook_url, events, is_active, last_triggered_at, error_count, created_at, updated_at) ON public.agent_platform_webhooks TO authenticated;

-- 2) Revoke column access on organizations.api_key
REVOKE SELECT (api_key) ON public.organizations FROM authenticated, anon;

-- 3) Prevent org_admins from updating their own user_roles row (self-escalation)
DROP POLICY IF EXISTS "Org admins can update non-super-admin roles" ON public.user_roles;
CREATE POLICY "Org admins can update non-super-admin roles"
  ON public.user_roles FOR UPDATE
  USING (
    (has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR is_super_admin(auth.uid()))
    AND (role <> 'super_admin'::app_role OR is_super_admin(auth.uid()))
    AND (user_id <> auth.uid() OR is_super_admin(auth.uid()))
  )
  WITH CHECK (
    (has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR is_super_admin(auth.uid()))
    AND (role <> 'super_admin'::app_role OR is_super_admin(auth.uid()))
    AND (user_id <> auth.uid() OR is_super_admin(auth.uid()))
  );

DROP POLICY IF EXISTS "Org admins can assign roles" ON public.user_roles;
CREATE POLICY "Org admins can assign roles"
  ON public.user_roles FOR INSERT
  WITH CHECK (
    (has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR is_super_admin(auth.uid()))
    AND (role <> 'super_admin'::app_role OR is_super_admin(auth.uid()))
    AND (user_id <> auth.uid() OR is_super_admin(auth.uid()))
  );

DROP POLICY IF EXISTS "Org admins can delete non-super-admin roles" ON public.user_roles;
CREATE POLICY "Org admins can delete non-super-admin roles"
  ON public.user_roles FOR DELETE
  USING (
    (has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR is_super_admin(auth.uid()))
    AND (role <> 'super_admin'::app_role OR is_super_admin(auth.uid()))
    AND (user_id <> auth.uid() OR is_super_admin(auth.uid()))
  );
