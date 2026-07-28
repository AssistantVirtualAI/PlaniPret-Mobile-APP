
-- 1. Column-level revokes for sensitive credentials (frontend uses *_safe views)
REVOKE SELECT (platform_api_key) ON public.agents FROM authenticated, anon;
REVOKE SELECT (api_key) ON public.organization_integrations FROM authenticated, anon;
REVOKE SELECT (access_token, refresh_token) ON public.calendar_integrations FROM authenticated, anon;

-- webhook_endpoints: revoke secret column
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='webhook_endpoints' AND column_name='secret') THEN
    EXECUTE 'REVOKE SELECT (secret) ON public.webhook_endpoints FROM authenticated, anon';
  END IF;
END $$;

-- agent_mcp_servers.auth_config: revoke from authenticated; only service role can read raw config
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='agent_mcp_servers' AND column_name='auth_config') THEN
    EXECUTE 'REVOKE SELECT (auth_config) ON public.agent_mcp_servers FROM authenticated, anon';
  END IF;
END $$;

-- 2. billing_config: restrict stripe identifiers to org_admin/super_admin only
-- Drop the broader "Admins can view" policy that allowed managers
DROP POLICY IF EXISTS "Admins can view organization billing config" ON public.billing_config;

-- Create a manager-safe SELECT policy excluding stripe ids by revoking those columns from authenticated
REVOKE SELECT (stripe_customer_id, stripe_subscription_id) ON public.billing_config FROM authenticated, anon;

-- Restore manager read access to non-sensitive billing columns
CREATE POLICY "Managers and admins can view billing config"
ON public.billing_config FOR SELECT
USING (
  has_role(auth.uid(), organization_id, 'org_admin'::app_role)
  OR has_role(auth.uid(), organization_id, 'manager'::app_role)
  OR is_super_admin(auth.uid())
);

-- 3. user_roles DELETE: prevent org_admin from deleting super_admin rows
DROP POLICY IF EXISTS "Org admins can delete roles" ON public.user_roles;
CREATE POLICY "Org admins can delete non-super-admin roles"
ON public.user_roles FOR DELETE
USING (
  (has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR is_super_admin(auth.uid()))
  AND ((role <> 'super_admin'::app_role) OR is_super_admin(auth.uid()))
);

-- 4. Remove tables from public realtime publication to prevent cross-tenant broadcast leaks.
-- Edge functions / service role can still mutate; UI should switch to authorized channels or polling.
ALTER PUBLICATION supabase_realtime DROP TABLE public.handoff_requests;
ALTER PUBLICATION supabase_realtime DROP TABLE public.twilio_active_calls;
