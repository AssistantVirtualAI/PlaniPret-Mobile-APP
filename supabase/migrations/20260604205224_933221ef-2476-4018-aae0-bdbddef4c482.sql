
-- 1. billing_config: restrict SELECT to admins/managers
DROP POLICY IF EXISTS "Users can view organization billing config" ON public.billing_config;
CREATE POLICY "Admins can view organization billing config"
  ON public.billing_config FOR SELECT
  USING (
    public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR public.has_role(auth.uid(), organization_id, 'manager'::app_role)
    OR public.is_super_admin(auth.uid())
  );

-- 2. agent_mcp_servers: restrict SELECT to manager+
DROP POLICY IF EXISTS "Users can view MCP servers for their org agents" ON public.agent_mcp_servers;
CREATE POLICY "Managers can view MCP servers"
  ON public.agent_mcp_servers FOR SELECT
  USING (
    public.has_role(auth.uid(), organization_id, 'manager'::app_role)
    OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR public.is_super_admin(auth.uid())
  );

-- 3. agent_platform_webhooks: restrict SELECT to manager+
DROP POLICY IF EXISTS "Users can view webhooks for their org agents" ON public.agent_platform_webhooks;
CREATE POLICY "Managers can view platform webhooks"
  ON public.agent_platform_webhooks FOR SELECT
  USING (
    public.has_role(auth.uid(), organization_id, 'manager'::app_role)
    OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR public.is_super_admin(auth.uid())
  );

-- 4. phone_numbers: restrict SELECT to manager+
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='phone_numbers') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can view organization phone numbers" ON public.phone_numbers';
    EXECUTE 'DROP POLICY IF EXISTS "Members can view phone numbers" ON public.phone_numbers';
    EXECUTE $p$CREATE POLICY "Managers can view phone numbers"
      ON public.phone_numbers FOR SELECT
      USING (
        public.has_role(auth.uid(), organization_id, 'manager'::app_role)
        OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
        OR public.is_super_admin(auth.uid())
      )$p$;
  END IF;
END$$;

-- 5. handoff_requests: split ALL policy into SELECT (members) + write (agent+)
DROP POLICY IF EXISTS "Agents can manage handoff requests" ON public.handoff_requests;
CREATE POLICY "Agents can insert handoff requests"
  ON public.handoff_requests FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), organization_id, 'agent'::app_role)
    OR public.has_role(auth.uid(), organization_id, 'manager'::app_role)
    OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR public.is_super_admin(auth.uid())
  );
CREATE POLICY "Agents can update handoff requests"
  ON public.handoff_requests FOR UPDATE
  USING (
    public.has_role(auth.uid(), organization_id, 'agent'::app_role)
    OR public.has_role(auth.uid(), organization_id, 'manager'::app_role)
    OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR public.is_super_admin(auth.uid())
  );
CREATE POLICY "Managers can delete handoff requests"
  ON public.handoff_requests FOR DELETE
  USING (
    public.has_role(auth.uid(), organization_id, 'manager'::app_role)
    OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR public.is_super_admin(auth.uid())
  );

-- 6. user_roles: prevent org_admin from modifying super_admin rows
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_roles' AND policyname='Org admins can update roles'
  ) THEN
    EXECUTE 'DROP POLICY "Org admins can update roles" ON public.user_roles';
  END IF;
END$$;

CREATE POLICY "Org admins can update non-super-admin roles"
  ON public.user_roles FOR UPDATE
  USING (
    (
      public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
      OR public.is_super_admin(auth.uid())
    )
    AND (role <> 'super_admin'::app_role OR public.is_super_admin(auth.uid()))
  )
  WITH CHECK (
    (
      public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
      OR public.is_super_admin(auth.uid())
    )
    AND (role <> 'super_admin'::app_role OR public.is_super_admin(auth.uid()))
  );
