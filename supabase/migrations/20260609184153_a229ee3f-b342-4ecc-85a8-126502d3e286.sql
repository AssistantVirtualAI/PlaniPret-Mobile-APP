
-- 1. pbx_extensions.raw_data (and password) - block authenticated reads
REVOKE SELECT (raw_data) ON public.pbx_extensions FROM authenticated;
REVOKE SELECT (password) ON public.pbx_extensions FROM authenticated;

-- 2. agent_platform_webhooks.webhook_secret
REVOKE SELECT (webhook_secret) ON public.agent_platform_webhooks FROM authenticated;

-- 3. agents.platform_api_key
REVOKE SELECT (platform_api_key) ON public.agents FROM authenticated;

-- 4. lemtel_softphone_users.sip_password
REVOKE SELECT (sip_password) ON public.lemtel_softphone_users FROM authenticated;

-- 5. organization_integrations.api_key
REVOKE SELECT (api_key) ON public.organization_integrations FROM authenticated;

-- 6. webhook_endpoints.secret
REVOKE SELECT (secret) ON public.webhook_endpoints FROM authenticated;

-- 7. organization_integrations: tighten INSERT policy to require org membership
DROP POLICY IF EXISTS "Users can insert own integrations" ON public.organization_integrations;
CREATE POLICY "Users can insert own integrations"
  ON public.organization_integrations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      organization_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE user_id = auth.uid() AND organization_id = organization_integrations.organization_id
      )
      OR public.is_super_admin(auth.uid())
    )
  );
