
-- 1) APPOINTMENTS: split ALL policy into role-scoped policies
DROP POLICY IF EXISTS "Users can manage organization appointments" ON public.appointments;

CREATE POLICY "Managers can view organization appointments"
  ON public.appointments FOR SELECT
  USING (
    has_role(auth.uid(), organization_id, 'manager'::app_role)
    OR has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR is_super_admin(auth.uid())
  );

CREATE POLICY "Managers can write organization appointments"
  ON public.appointments FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), organization_id, 'manager'::app_role)
    OR has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR is_super_admin(auth.uid())
  );

CREATE POLICY "Managers can update organization appointments"
  ON public.appointments FOR UPDATE
  USING (
    has_role(auth.uid(), organization_id, 'manager'::app_role)
    OR has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR is_super_admin(auth.uid())
  );

CREATE POLICY "Managers can delete organization appointments"
  ON public.appointments FOR DELETE
  USING (
    has_role(auth.uid(), organization_id, 'manager'::app_role)
    OR has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR is_super_admin(auth.uid())
  );

-- 2) LEADS: restrict INSERT to managers/admins
DROP POLICY IF EXISTS "Users can create organization leads" ON public.leads;
CREATE POLICY "Managers can create organization leads"
  ON public.leads FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), organization_id, 'manager'::app_role)
    OR has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR is_super_admin(auth.uid())
  );

-- 3) ORGANIZATION_INTEGRATIONS: tighten SELECT to org_admin only (managers no longer see rows)
DROP POLICY IF EXISTS "Users can view their own integrations" ON public.organization_integrations;
CREATE POLICY "Admins can view organization integrations"
  ON public.organization_integrations FOR SELECT
  USING (
    user_id = auth.uid()
    OR (organization_id IS NOT NULL AND (
      has_role(auth.uid(), organization_id, 'org_admin'::app_role)
      OR is_super_admin(auth.uid())
    ))
  );

-- 4) USER_ROLES: block non-super-admins from assigning super_admin role
DROP POLICY IF EXISTS "Org admins can assign roles" ON public.user_roles;
CREATE POLICY "Org admins can assign roles"
  ON public.user_roles FOR INSERT
  WITH CHECK (
    (has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR is_super_admin(auth.uid()))
    AND (role <> 'super_admin'::app_role OR is_super_admin(auth.uid()))
  );

DROP POLICY IF EXISTS "Org admins can update roles" ON public.user_roles;
CREATE POLICY "Org admins can update roles"
  ON public.user_roles FOR UPDATE
  USING (has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR is_super_admin(auth.uid()))
  WITH CHECK (
    (has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR is_super_admin(auth.uid()))
    AND (role <> 'super_admin'::app_role OR is_super_admin(auth.uid()))
  );

-- 5) AGENT_MCP_SERVERS: restrict mutations to managers/admins; hide auth_config column
DROP POLICY IF EXISTS "Users can insert MCP servers for their org agents" ON public.agent_mcp_servers;
DROP POLICY IF EXISTS "Users can update MCP servers for their org agents" ON public.agent_mcp_servers;
DROP POLICY IF EXISTS "Users can delete MCP servers for their org agents" ON public.agent_mcp_servers;

CREATE POLICY "Managers can insert MCP servers"
  ON public.agent_mcp_servers FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), organization_id, 'manager'::app_role)
    OR has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR is_super_admin(auth.uid())
  );
CREATE POLICY "Managers can update MCP servers"
  ON public.agent_mcp_servers FOR UPDATE
  USING (
    has_role(auth.uid(), organization_id, 'manager'::app_role)
    OR has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR is_super_admin(auth.uid())
  );
CREATE POLICY "Managers can delete MCP servers"
  ON public.agent_mcp_servers FOR DELETE
  USING (
    has_role(auth.uid(), organization_id, 'manager'::app_role)
    OR has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR is_super_admin(auth.uid())
  );
REVOKE SELECT (auth_config) ON public.agent_mcp_servers FROM authenticated, anon;

-- 6) AGENT_PLATFORM_WEBHOOKS: restrict mutations to managers/admins; hide secret
DROP POLICY IF EXISTS "Users can insert webhooks for their org agents" ON public.agent_platform_webhooks;
DROP POLICY IF EXISTS "Users can update webhooks for their org agents" ON public.agent_platform_webhooks;
DROP POLICY IF EXISTS "Users can delete webhooks for their org agents" ON public.agent_platform_webhooks;

CREATE POLICY "Managers can insert platform webhooks"
  ON public.agent_platform_webhooks FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), organization_id, 'manager'::app_role)
    OR has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR is_super_admin(auth.uid())
  );
CREATE POLICY "Managers can update platform webhooks"
  ON public.agent_platform_webhooks FOR UPDATE
  USING (
    has_role(auth.uid(), organization_id, 'manager'::app_role)
    OR has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR is_super_admin(auth.uid())
  );
CREATE POLICY "Managers can delete platform webhooks"
  ON public.agent_platform_webhooks FOR DELETE
  USING (
    has_role(auth.uid(), organization_id, 'manager'::app_role)
    OR has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR is_super_admin(auth.uid())
  );
REVOKE SELECT (webhook_secret) ON public.agent_platform_webhooks FROM authenticated, anon;

-- 7) CLIENT_MEMBERS: restrict SELECT to managers/admins
DROP POLICY IF EXISTS "Users can view client members of their organization" ON public.client_members;
CREATE POLICY "Managers can view client members"
  ON public.client_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = client_members.client_id
        AND (
          has_role(auth.uid(), c.organization_id, 'manager'::app_role)
          OR has_role(auth.uid(), c.organization_id, 'org_admin'::app_role)
          OR is_super_admin(auth.uid())
        )
    )
  );

-- 8) ORG_EXPORTS: hide raw content column from the client; readers use signed paths/edge function
REVOKE SELECT (content) ON public.org_exports FROM authenticated, anon;

-- 9) SUPER_ADMIN_EXCEPTIONS: scope policies to authenticated only
DROP POLICY IF EXISTS "Super admins can manage exceptions" ON public.super_admin_exceptions;
DROP POLICY IF EXISTS "Super admins can view exceptions" ON public.super_admin_exceptions;

CREATE POLICY "Super admins can view exceptions"
  ON public.super_admin_exceptions FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can manage exceptions"
  ON public.super_admin_exceptions FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));
