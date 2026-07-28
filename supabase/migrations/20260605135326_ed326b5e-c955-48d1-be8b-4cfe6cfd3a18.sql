
-- Lock down sensitive columns: revoke direct client read/update on plaintext secrets.
-- These columns must only be accessed via service_role edge functions.

REVOKE SELECT (api_key), UPDATE (api_key) ON public.organization_integrations FROM anon, authenticated;
REVOKE SELECT (access_token, refresh_token), UPDATE (access_token, refresh_token) ON public.calendar_integrations FROM anon, authenticated;
REVOKE SELECT (secret), UPDATE (secret) ON public.webhook_endpoints FROM anon, authenticated;
REVOKE SELECT (platform_api_key), UPDATE (platform_api_key) ON public.agents FROM anon, authenticated;

-- Tighten organization_integrations SELECT: require active org membership (not just original creator)
DROP POLICY IF EXISTS "Users can view their integrations" ON public.organization_integrations;
DROP POLICY IF EXISTS "Users can view organization integrations" ON public.organization_integrations;
CREATE POLICY "Org members can view organization integrations"
ON public.organization_integrations
FOR SELECT
TO authenticated
USING (
  organization_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = organization_integrations.organization_id
      AND om.user_id = auth.uid()
  )
);
