
-- 1) AGENTS: hide platform_api_key (and platform_api creds) from members
REVOKE SELECT (platform_api_key) ON public.agents FROM authenticated, anon;

-- 2) ORGANIZATIONS: hide api_key from members
REVOKE SELECT (api_key) ON public.organizations FROM authenticated, anon;

-- 3) ORGANIZATION_INTEGRATIONS: hide api_key from members
REVOKE SELECT (api_key) ON public.organization_integrations FROM authenticated, anon;

-- 4) BILLING_CONFIG: hide stripe ids from members
REVOKE SELECT (stripe_customer_id, stripe_subscription_id) ON public.billing_config FROM authenticated, anon;

-- 5) WEBHOOK_ENDPOINTS: tighten SELECT to admins/managers and hide secret column entirely
DROP POLICY IF EXISTS "Users can view organization webhook endpoints" ON public.webhook_endpoints;
CREATE POLICY "Admins can view organization webhook endpoints"
  ON public.webhook_endpoints
  FOR SELECT
  USING (
    has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR has_role(auth.uid(), organization_id, 'manager'::app_role)
    OR is_super_admin(auth.uid())
  );
REVOKE SELECT (secret) ON public.webhook_endpoints FROM authenticated, anon;

-- 6) CALENDAR_INTEGRATIONS: restrict SELECT to org_admin only and revoke token columns
DROP POLICY IF EXISTS "Only admins can view calendar integrations" ON public.calendar_integrations;
DROP POLICY IF EXISTS "Org admins can manage calendar integrations" ON public.calendar_integrations;

CREATE POLICY "Org admins can view calendar integrations"
  ON public.calendar_integrations
  FOR SELECT
  USING (
    has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR is_super_admin(auth.uid())
  );

CREATE POLICY "Org admins can manage calendar integrations"
  ON public.calendar_integrations
  FOR ALL
  USING (
    has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR is_super_admin(auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR is_super_admin(auth.uid())
  );

REVOKE SELECT (access_token, refresh_token) ON public.calendar_integrations FROM authenticated, anon;

-- 7) Revoke EXECUTE on internal helper functions so they're not callable from PostgREST
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_agent_slug(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_api_key() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_agent_slug() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_kb_search_vector() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_unique_username(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at_org_role_permissions() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_table_changes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at_org_retention_settings() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at_client_credentials() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.setup_new_user_organization(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_security_audit(uuid) FROM PUBLIC, anon;
